# ⚡ `@lhx-kit/vite-plugin` 实现详解

> 本章面向**想看懂源码的维护者**，解释插件每个钩子在做什么、为什么这么做。
> 阅读对象：`packages/vite-plugin/src/plugin.ts`（约 1200 行）

---

## 一、🎬 插件形态

用户侧**只写这一行**：

```ts title="vite.config.ts"
import {lhxKit} from '@lhx-kit/vite-plugin';

export default defineConfig({
  plugins: [lhxKit()]
});
```

但内部 `lhxKit()` 返回 **一个插件数组**：

```ts title="packages/vite-plugin/src/plugin.ts" showLineNumbers
function lhxKit(options: LhxKitPluginOptions = {}): Plugin[] {
  return [
    mainPlugin,         // 主插件：config / resolveId / load / transform / generateBundle
    lhxCompress(...)    // 副插件：build 后压缩 gzip + brotli
  ];
}
```

:::tip Vite 支持嵌套数组
`plugins: [[a, b]]` 是合法的——用户写法不变，内部可以按责任分层。
:::

---

## 二、🎣 生命周期钩子时序

```text
Vite 启动
   ↓
[1] config(userConfig, env)        ← 翻译 project.config.ts → UserConfig
   ↓
[2] configResolved(resolvedConfig) ← (规划中) 某些依赖最终 config 的行为
   ↓
[3] resolveId / load               ← 支持 @lhx-kit/virtual:config 虚拟模块
   ↓
Vite 进入 bundle 阶段
   ↓
[4] transform(code, id)            ← CDN 激活时改写 bare imports
   ↓
Rollup 生成 chunk
   ↓
[5] generateBundle(opts, bundle)   ← 重组 chunk + 注入 CDN loader
   ↓
[6] writeBundle                    ← lhxCompress 产出 .gz / .br
```

---

## 三、🎣 每个钩子详解

### 3.1 `config(userConfig, env)` — 配置翻译

**时机**：Vite 启动第一步，UserConfig 还没和默认值合并。

**职责**：

```ts title="config 钩子的 10 件事" showLineNumbers
async function config(userConfig, env) {
  // 1. 加载 project.config.ts（via @lhx-kit/config::loadProjectConfig）
  const project = await loadProjectConfig(viteRoot);

  // 2. 加载 offline.config.ts（如果存在）
  const offline = await loadOfflineConfig(viteRoot, project);

  // 3. 命令正规化（env.command 只有 build/serve，我们要区分 preview）
  const command = env.command === 'build' ? 'build'
    : (process.env.LHX_VITE_COMMAND === 'preview' ? 'preview' : 'dev');

  // 4. 生成中间 HTML
  //    .lhx-kit/pages/home.html, .lhx-kit/pages/settings.html, ...
  const intermediateHtml = generateIntermediateHtml(project, command);

  // 5. 把 pages 翻译成 Rollup input
  const input = {};
  for (const [name, html] of Object.entries(intermediateHtml)) {
    input[name] = html;
  }

  // 6. aliases 翻译
  const aliasArray = Object.entries(project.aliases).map(([find, target]) => ({
    find,
    replacement: resolve(project.rootDir, target)
  }));

  // 7. env.apiBase / env.define / LHX_MODE 翻译
  const define = {
    'import.meta.env.LHX_API_BASE': JSON.stringify(env.apiBase),
    'import.meta.env.LHX_MODE': JSON.stringify(mode)
  };

  // 8. CDN 激活时收集 externals
  const externalIds = new Set();
  const globals = {};
  if (cdn.active) {
    for (const entry of cdn.entries) {
      for (const id of entry.externals) {
        externalIds.add(id);
        globals[id] = entry.globalVar;
      }
    }
  }

  // 9. 固化 build 优化参数
  const buildOpts = {
    target: 'es2018',
    minify: 'esbuild',
    assetsInlineLimit: 8 * 1024,
    cssCodeSplit: true,
    chunkSizeWarningLimit: 100
  };

  // 10. 装配 rollupOptions
  return {
    root: project.rootDir,
    resolve: {alias: aliasArray},
    define,
    build: {
      ...buildOpts,
      rollupOptions: {
        input,
        external: Array.from(externalIds),
        output: {
          globals,
          manualChunks: nodeModulesPerPackageChunker,
          experimentalMinChunkSize: 10 * 1024
        }
      }
    }
  };
}
```

:::info 为什么要物理生成中间 HTML
Vite MPA 模式要求 `input` 指向**真实存在的 HTML 文件**（不能是虚拟模块）。

我们在 `.lhx-kit/pages/<name>.html` 写一份带 CDN loader 注释块 + 页面 entry `<script>` 的 HTML，让 Vite 照常处理。
:::

### 3.2 `resolveId(id)` / `load(id)` — 虚拟模块

只做一件事：支持 `@lhx-kit/virtual:config` 虚拟模块。

```ts title="packages/vite-plugin/src/plugin.ts"
resolveId(id) {
  if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID;
  return null;
}

load(id) {
  if (id !== RESOLVED_VIRTUAL_ID) return null;
  return renderVirtualModuleCode(
    serializeConfig(ctx.project, ctx.mode, ctx.env)
  );
}
```

用户代码可以：

```ts title="src/bootstrap.ts"
import cfg from '@lhx-kit/virtual:config';

console.log(cfg.project.name);
console.log(cfg.mode);
console.log(cfg.env.apiBase);
```

**好处**：在客户端运行时拿到**编译时快照的 project.config.ts**。不需要运行时 jiti 重新加载 TS 配置。

### 3.3 `transform(code, id)` — CDN import 改写

**时机**：Vite pre-bundle 完成后，Rollup 正式 bundle 前。

```ts title="transform 钩子完整流程" showLineNumbers
transform(code, id) {
  // Step 1: 非 CDN 模式直接跳过
  if (!ctx?.cdn.active) return null;

  // Step 2: 虚拟模块跳过
  if (id.startsWith('\0')) return null;

  // Step 3: 收集 externals
  const externalsByName = {};
  for (const entry of ctx.cdn.entries) {
    for (const ext of entry.externals) {
      externalsByName[ext] = entry.globalVar;
    }
  }
  if (Object.keys(externalsByName).length === 0) return null;

  // Step 4: ⚡ Early exit — 文件不含任何 external 名字就跳过
  let hit = false;
  for (const name of Object.keys(externalsByName)) {
    if (code.includes(name)) { hit = true; break; }
  }
  if (!hit) return null;

  // Step 5: 改写 import 语句
  const rewritten = rewriteCdnImports(code, externalsByName);

  // Step 6: 没变就返 null（避免 source map 刷新）
  if (rewritten === code) return null;

  return {code: rewritten, map: null};
}
```

:::tip Early exit 为什么重要
绝大多数模块不 import 任何 CDN external。`code.includes(name)` 是 C 实现的快速子串检查，把 per-file transform 调用量砍到 **5% 以下**。
:::

### 3.4 `rewriteCdnImports` — 4 种改写

```ts title="正则定义"
const importRe = /import\s+([^'"]+?)\s+from\s+(['"])([^'"]+)\2\s*;?/g;
const sideRe   = /import\s+(['"])([^'"]+)\1\s*;?/g;
```

改写规则详见 [🌐 CDN 外挂 §3](../guide/cdn#三-核心算法import-改写)。

:::warning 踩过的坑：node_modules 也要改写
曾经有 `if (id.includes('node_modules')) return null;` 跳过。结果 `react-router-dom` bundle 打进来后里面的 `import {createContext} from 'react'` **没有**被改写，浏览器报：

```text
❌ Failed to resolve module specifier 'react'
```

**原因**：Rollup 的 `external` 只从**用户模块图**里剥离，third-party 包经过打包后的产物仍保留 `import` 语句。必须让 `transform` 也进入 `node_modules`。

**修复**：去掉 node_modules 跳过，靠 early exit 控制性能。
:::

### 3.5 `generateBundle(options, bundle)` — chunk 分配 + HTML 重写

**时机**：所有 chunk 已生成，写盘前最后一步。

**五步工作**：

```text
┌─────────────────────────────────────────────┐
│ ① emit 本地 vendor fallback                  │
│    shared/vendor/<name>.js                   │
├─────────────────────────────────────────────┤
│ ② 重写中间 HTML → per-page 路径               │
│    .lhx-kit/pages/home.html → home/index.html│
├─────────────────────────────────────────────┤
│ ③ chunk owner 分析 (BFS)                     │
│    for each page entry → BFS imports        │
├─────────────────────────────────────────────┤
│ ④ 按 ownership 搬运 chunk                    │
│    owners.size === 1 → <page>/assets/       │
│    owners.size >= 2 → shared/assets/        │
├─────────────────────────────────────────────┤
│ ⑤ 注入 CDN loader 到每个页面 HTML            │
│    <!-- lhx-kit: CDN loader -->...           │
└─────────────────────────────────────────────┘
```

#### ① 本地 vendor fallback

```ts title="为什么要 emit 这个"
// CDN loader 降级时:
//   → loadLocalFallback(entry)
//   → dynamic import(entry.localFallbackUrl)
//   → 这个 URL 指向 shared/vendor/<name>.js

if (cdn.active && cdn.fallback === 'local') {
  for (const entry of cdn.entries) {
    const src = cdn.localFallbackSrc[entry.name];
    this.emitFile({
      type: 'asset',
      fileName: `shared/vendor/${vendorFilename(entry.name)}`,
      source: readFileSync(src, 'utf8')
    });
  }
}
```

#### ③ chunk owner 分析算法

```ts title="BFS 遍历" showLineNumbers
function computeChunkOwners(bundle, activePageNames, pageIntermediatePath) {
  // 构建 moduleId → chunk 映射
  const chunkByFacadeId = new Map();
  for (const [name, asset] of Object.entries(bundle)) {
    if (asset.type === 'chunk' && asset.facadeModuleId) {
      chunkByFacadeId.set(asset.facadeModuleId, name);
    }
  }

  const owners = new Map();

  // 从每个 page entry 开始 BFS
  for (const pageName of activePageNames) {
    const entryChunk = chunkByFacadeId.get(pageIntermediatePath[pageName]);
    if (!entryChunk) continue;

    const visited = new Set();
    const queue = [entryChunk];

    while (queue.length > 0) {
      const current = queue.shift();
      if (visited.has(current)) continue;
      visited.add(current);

      const asset = bundle[current];
      if (!asset || asset.type !== 'chunk') continue;

      // 标记 ownership
      const set = owners.get(current) ?? new Set();
      set.add(pageName);
      owners.set(current, set);

      // 入队 static + dynamic imports
      for (const imp of asset.imports ?? []) queue.push(imp);
      for (const imp of asset.dynamicImports ?? []) queue.push(imp);
    }
  }

  return owners;
}
```

### 3.6 `lhxCompress` 副插件

```ts title="packages/vite-plugin/src/compress.ts"
generateBundle: {
  order: 'post',
  async handler(_, bundle) {
    for (const [name, asset] of Object.entries(bundle)) {
      if (!shouldCompress(name, asset)) continue;
      const buf = Buffer.from(asset.source);

      // 并发压缩 gzip + brotli
      const [gz, br] = await Promise.all([
        gzip(buf, {level: 9}),
        brotliCompress(buf, {
          params: {
            [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
            [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT
          }
        })
      ]);

      this.emitFile({type: 'asset', fileName: `${name}.gz`, source: gz});
      this.emitFile({type: 'asset', fileName: `${name}.br`, source: br});
    }
  }
}
```

`shouldCompress` 规则：

- ✅ 文本文件（`.js / .css / .html / .svg / .json`）
- ✅ 字节数 > 1KB
- ❌ 用户 `compress: false` 关闭

---

## 四、🗂️ 核心数据结构

### 4.1 `Context`

```ts title="buildContext() 在 config() 钩子里构造"
interface Context {
  project: ResolvedProjectConfig;
  offline: ResolvedOfflineConfig | null;
  mode: string;
  env: EnvEntry;
  activePageNames: string[];
  intermediateHtml: Record<string, string>;  // pageName → absolute path
  opts: ResolvedOptions;
  cdn: CdnContext;
}

interface CdnContext {
  active: boolean;
  entries: ResolvedCdnEntry[];
  fallback: 'local' | 'error';
  plan: CdnPlan;                              // 注入到 HTML 的数据
  localFallbackSrc: Record<string, string>;   // entry name → UMD 绝对路径
}
```

### 4.2 `FAMILY_GROUPS`

```ts title="家族分组规则"
const FAMILY_GROUPS = {
  react: ['react', 'react-dom', 'scheduler'],
  'react-router': ['react-router', 'react-router-dom', 'remix-run-router'],
  vue: ['vue', 'vue-demi'],
  'vue-state': ['pinia', 'vue-router']
};
```

:::info 为什么是这四个家族
经验数据：这四组里的包几乎总是"全家桶一起用"，分开打只增 HTTP 请求数。

其他包（antd / echarts / zod / lodash / dayjs ...）彼此独立，分开打缓存粒度更好。
:::

---

## 五、🔍 `resolveLocalVendor` — 找 UMD 本地兜底

### 5.1 优先级

```text
┌──────────────────────────────────────────────────┐
│ 1. entry.localFallback（用户显式指定）             │
│    ↓ miss                                         │
│ 2. require.resolve(<name>/package.json) → pkgRoot│
│    扫候选路径：                                    │
│      - dist/<name>.umd.production.min.js          │
│      - dist/<name>.production.min.js              │
│      - dist/<name>.umd.js                         │
│      - umd/<name>.production.min.js               │
│      - umd/<name>.min.js                          │
│    ↓ miss                                         │
│ 3. 文件系统递归扫描                                │
│    node_modules/<name>/dist/**/*.umd.production.* │
└──────────────────────────────────────────────────┘
```

### 5.2 为什么需要兜底层级

:::warning 真实世界的混乱
| 场景 | 问题 |
| --- | --- |
| 某些包把 UMD 放在非标准位置 | `dist/umd/production.min.js` |
| 某些包的 `package.json#exports` 封闭子路径 | `require.resolve('preact/hooks/dist/hooks.umd.js')` 直接抛错 |
| 旧版包结构不规范 | 完全没有命名规律 |

`resolveLocalVendor` 这层"启发式"把 20+ 主流包的 UMD 都能自动找到。
:::

---

## 六、🎯 为什么是 `enforce: 'pre'`

```ts
const mainPlugin: Plugin = {
  name: 'lhx-kit',
  enforce: 'pre',   // 👈 关键
  ...
};
```

:::tip 必须先于其他插件运行
- React / Vue 插件会基于默认 input 预处理。如果我们晚一步，会造成**重复工作**
- 用户定义的其他 plugins 可能依赖 `aliasArray` 已经生效
:::

---

## 七、🐞 调试技巧

### 7.1 看 CDN 改写前后的代码

```bash title="规划中"
DEBUG=lhx:* pnpm build
```

### 7.2 看 chunk ownership

```bash
pnpm build --mode=debug
```

输出：

```text
[lhx-kit] chunk ownership:
  shared/assets/vendor-react-*.js → home, dashboard, settings
  home/assets/home-*.js           → home
  home/assets/HomeLanding-*.js    → home
```

### 7.3 dev 下禁用某个功能

```ts title="vite.config.ts"
lhxKit({
  compress: false,      // 关闭预压缩
  cleanUrls: false,     // 关闭 /home 自动映射到 home.html
})
```

---

## 八、📂 文件清单

```text title="packages/vite-plugin/src/"
plugin.ts           # 主体（1200+ 行）
compress.ts         # 预压缩副插件
html.ts             # HTML 渲染 + CDN loader 注入
virtual.ts          # @lhx-kit/virtual:config 虚拟模块实现
index.ts            # 对外 export
```

---

## 九、🧪 测试

```text title="packages/vite-plugin/src/__tests__/"
plugin.test.ts      # 端到端：mock userConfig → 验证 returned UserConfig
chunker.test.ts     # nodeModulesPerPackageChunker 单测
rewrite.test.ts     # rewriteCdnImports 单测
```

:::info 测试覆盖 roadmap
当前覆盖率约 40%，主要缺失：

- `generateBundle` 的 chunk ownership BFS
- `resolveLocalVendor` 的文件系统兜底
- `compress` 在大文件下的正确性

补全计划在 [Migration Guide](../reference/migration)。
:::

---

## 十、📖 下一步

- [🦀 Rolldown 迁移记（Vite 8）](./rolldown-migration) — 本插件在 Vite 8 下的 `generateBundle` 改造与事故复盘
- [⚡ 性能优化](../guide/performance) — 看 chunk 策略演进 + 实测数据
- [🌐 CDN 外挂](../guide/cdn) — transform() 改写逻辑的深度解释
- [Runtime 概览](./overview) — 看 cdn-loader 运行时源码
