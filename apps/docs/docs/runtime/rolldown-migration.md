# 🦀 Rolldown 迁移记：从"沉默白屏"到干净构建

> **发生时间**：2026-05-02
> **影响范围**：Vite 8 + `@lhx-kit/vite-plugin` + `@lhx-kit/offline`
> **严重程度**：🔴 P0 — 离线包沉默缺失页面 HTML，容器下发后白屏
>
> 本章记录一次真实的生产事故：Vite 从 7 升到 8（底层从 Rollup 换成 Rolldown）后，`generateBundle` 钩子里的一个历史写法触发了 Rolldown 的硬性约束，**导致 per-page 重定位全部失效**，而离线包校验却显示 `valid: yes`。
>
> 读完你会得到：
>
> - 🧠 Rollup 与 Rolldown 在 `generateBundle` 上的 **核心语义差异**
> - 🕵️ 一条从"日志里 11 行 DANGER 警告"到"白屏"的完整归因链
> - 🛠️ 让插件在 Rollup + Rolldown **双栈兼容**的最小代码改动
> - 🛡️ 我们给离线管道加的 **两条防御性检查**，阻止同类问题再次悄悄上线

:::tip 为什么单独写一章
这是一个**反直觉**的 Bug：日志里能看到错误，构建能"成功"，产物体积"合理"，manifest 声明 `valid: true`——但容器一解压就白屏。每一个表象都在骗你，只有真正拆开 dist 目录才能看到漏洞。把这种案例记下来，团队下次升级重型依赖时就不会再踩同样的坑。
:::

---

## 一、🎬 事故现场

### 1.1 触发动作

升级后首次执行：

```bash
pnpm run offline:build
```

### 1.2 终端输出（节选）

```text title="build log"
vite v8.0.10 building client environment for production...

# [信号 1] esbuild 选项被 deprecated
9:03:13 PM [vite] warning: `esbuild` option was specified by "lhx-kit" plugin.
This option is deprecated, please use `oxc` instead.

# [信号 2] Rolldown 不认识 experimentalMinChunkSize
Warning: Invalid output options (1 issue found)
- For the "experimentalMinChunkSize". Invalid key: Expected never but received
  "experimentalMinChunkSize".

✓ 109 modules transformed.

# [信号 3] generateBundle 钩子尝试赋值 bundle，被拒绝 11 次
[plugin lhx-kit] Error: This plugin assigns to bundle variable.
This is discouraged by Rollup and is not supported by Rolldown.
This will be ignored. (x11)
    at renameBundleEntry (packages/vite-plugin/dist/index.js:857:18)

✓ built in 253ms
```

```text title="offline build output"
offline build
› hybridType=prod version=0.1.0
✓ offline package generated                   ← 🟢 骗人的"成功"
› pages: 1, assets: 11, size: 335 KB
› valid: yes                                  ← 🟢 骗人的"有效"
› top assets:
›   - shared/vendor/vue.js 164 KB
›   - shared/vendor/vue.js.gz 60 KB
›   - shared/vendor/vue.js.br 53 KB
```

### 1.3 实际 dist 目录

```text title="ls -la dist/"
mockServiceWorker.js          ← public/ 拷贝
mockServiceWorker.js.br
mockServiceWorker.js.gz
shared/                       ← emitFile 直接写入的 vendor
```

::::warning 致命问题
- ❌ **没有 `home/index.html`** — 页面入口不存在
- ❌ **没有 `home/assets/*.js`** — 页面代码缺失
- ❌ **没有 `settings/index.html`** — 另一个页面也缺
- 🤡 `manifest.json` 里仍然写着 `pages[0].file = "home/index.html"`，而 `assets[]` 里却根本没有这一条
::::

---

## 二、🕵️ 归因链条

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Vite 升级 7 → 8                                                     │
│   底层打包器：Rollup → Rolldown                                     │
└─────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Rolldown 明确禁止：插件在 generateBundle 钩子里对 `bundle` 变量赋值 │
│   delete bundle[key]  ❌                                            │
│   bundle[newKey] = x  ❌                                            │
│   → 被静默忽略 + 日志打印 DANGER 警告                                │
└─────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────┐
│ lhx-kit 的 `renameBundleEntry` 恰好干的就是这件事：                 │
│   delete bundle[from]; bundle[to] = {...asset, fileName: to};       │
└─────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────┐
│ per-page 重定位步骤全部变成 no-op：                                 │
│   `.lhx-kit/pages/home.html`（中间产物）没被改名成 `home/index.html`│
│   `home/assets/home.js` 的相对 import 也没被重算                    │
└─────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────┐
│ writeBundle 阶段，Rolldown 按每个 asset 自己的 `fileName` 写磁盘：  │
│   HTML 仍指向 `.lhx-kit/pages/home.html`（不在 outDir 内）          │
│   → 永远不会出现在 `dist/` 下                                       │
│   dist/ 里只剩 emitFile 直接写入的 `shared/vendor/*`                 │
└─────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 离线打包器扫描 dist/ 构建 manifest：                                 │
│   白名单过滤器只发现 shared/ + 几个顶层文件                          │
│   manifest.assets 仅 11 项                                          │
│   inspectOfflineOutput：每个 asset 文件都存在 → valid: true ✅      │
│   ❌ 漏了一条关键校验：manifest.pages[i].file 必须在 assets 里       │
└─────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────┐
│ zip 上传运维系统 → 容器下发 → WebView 加载 `home/index.html` → 404  │
│ 💥 白屏                                                              │
└─────────────────────────────────────────────────────────────────────┘
```

::::tip 每一环都"看起来对"
- Rolldown **打印**了警告（但只是 DANGER 级，不 fail 构建）
- Vite 的 `build` 任务**退出码是 0**
- offline CLI 报告 `✓ offline package generated · valid: yes`
- 离线 zip 的文件哈希校验**全部通过**（因为 manifest 里声明的 11 个文件确实都在）
- 只有当你执行 `find dist -type f` 才发现少了最重要的 HTML

这就是**静默故障（silent failure）**的典型教材。
::::

---

## 三、🧠 Rollup vs Rolldown：`generateBundle` 的核心差异

### 3.1 两个 bundler 对 `bundle` 变量的态度

| 操作 | Rollup（Vite 5/6/7）| Rolldown（Vite 8+）|
|------|---------------------|---------------------|
| `delete bundle[key]` | ✅ 接受 | 🔴 忽略 + 警告 |
| `bundle[newKey] = obj` | ✅ 接受 | 🔴 忽略 + 警告 |
| `bundle[key].fileName = 'new/path'` | ✅ 接受 | ✅ 接受 |
| `bundle[key].code = '...'`（chunk 代码）| ✅ 接受 | ✅ 接受 |
| `bundle[key].source = '...'`（asset 内容）| ✅ 接受 | ✅ 接受 |
| `this.emitFile({type, fileName, source})` | ✅ 官方推荐 | ✅ 官方推荐 |

::::info 核心心智模型
**bundle 是只读映射；asset 对象本身可写**。

- 不要增删 key
- 可以 **in-place** 修改 asset/chunk 的内部字段
- 新文件走 `this.emitFile`（两边都支持，语义一致）

Rollup 的 `delete + assign` 能工作只是**历史包袱**——其实 Rollup 官方文档同样标注 "DANGER: modifying the bundle variable is discouraged"。Rolldown 把它升级成了**硬约束**。
::::

### 3.2 写入磁盘时用的是什么？

**关键**：Rolldown（以及 Rollup）在 `writeBundle` 阶段**只看 asset 对象自己的 `fileName`**，不看 bundle 映射的 key。

```ts
// Rolldown 伪代码
for (const asset of Object.values(bundle)) {
  writeFile(join(outDir, asset.fileName), asset.source ?? asset.code);
  //                     ^^^^^^^^^^^^^^^ ← 物理路径来自这里
}
```

这个事实决定了我们**不需要**改 bundle 的 key——**只改每个 asset 的 `fileName`** 就能完成重定位。

### 3.3 其他 API 差异速查

| 维度 | Rollup | Rolldown |
|------|--------|----------|
| `manualChunks` | ✅ 支持 | ⚠️ 兼容但 deprecated，推荐 `codeSplitting.groups` |
| `experimentalMinChunkSize` | ✅ 支持 | ❌ 报 `Invalid key`，对应 `codeSplitting.minSize`（**必须配合 groups 才生效**）|
| `esbuild: {...}`（minify 选项）| ✅ 官方用法 | ⚠️ 被兼容层翻译，打印 `deprecated, use oxc instead` |
| `oxc: {...}` | ❌ 不存在 | ✅ Vite 8+ 原生 |
| `rolldownVersion` 导出 | 不存在 | ✅ 存在（可用于运行时探测）|
| `load/transform` 返回值 | `{code, map}` | 建议加 `moduleType: 'js'` |

---

## 四、🛠️ 修复方案

### 4.1 运行时探测：到底跑在哪个 bundler 上

```ts title="packages/vite-plugin/src/plugin.ts"
import * as viteExports from 'vite';

/**
 * Vite 8+ 在 Rolldown 模式下会导出 `rolldownVersion` 常量；
 * Rollup 模式（Vite 5/6/7）下该导出不存在。用可选链 + any
 * 兜底，让插件在整个 Vite 5~8 区间都能正确分支。
 */
const IS_ROLLDOWN = Boolean((viteExports as any).rolldownVersion);
```

::::tip 为什么是这一个探测点
官方文档推荐 `this.meta.rolldownVersion`，但那个只在 plugin 钩子上下文里可用，而我们的 config 构造里还没进入钩子上下文。`import * as` + 检查命名导出是**构建期就能 resolve** 的写法，零运行时成本。
::::

### 4.2 `renameBundleEntry`：只改 `fileName`，不动 bundle 映射

**修复前**（🔴 Rolldown 下悄悄失效）：

```ts
function renameBundleEntry(bundle, fromName, toName, asset): void {
  if (fromName === toName) return;
  const next = {...asset, fileName: toName};
  delete bundle[fromName];           // ❌ Rolldown 忽略
  bundle[toName] = next;             // ❌ Rolldown 忽略
}
```

**修复后**（✅ 两栈兼容）：

```ts title="packages/vite-plugin/src/plugin.ts"
/**
 * Rename a bundle entry *in place*.
 *
 * 两栈兼容：Rolldown 和 Rollup 在 writeBundle 阶段都只读
 * `asset.fileName`，bundle 映射的 key 只是一个索引名。因此
 * 我们只改 asset 自身的 fileName 字段，不再 delete/assign 映射。
 *
 * 后续 iterate bundle 的地方必须用 `asset.fileName`（而不是
 * Object.entries() 的 key）—— 因为 key 会 stale。
 */
function renameBundleEntry(_bundle, fromName, toName, asset): void {
  if (fromName === toName) return;
  (asset as {fileName: string}).fileName = toName;
}
```

### 4.3 所有后续遍历切换到 `asset.fileName`

`renameBundleEntry` 之后，bundle 的 key 依然是旧路径，只有对象的 `fileName` 变了。所以 `patchHtmlReferences`、`patchChunkImports`、`reportOversizedChunks` 和最后的 CDN gate 注入**都必须改**：

```ts title="修复前 → 修复后"
// ❌ 修复前：读 key
for (const [fileName, asset] of Object.entries(bundle)) {
  if (!fileName.endsWith('.html')) continue;
  ...
}

// ✅ 修复后：读 asset.fileName
for (const asset of Object.values(bundle)) {
  const a = asset as {fileName?: string; type?: string};
  if (!a.fileName || !a.fileName.endsWith('.html')) continue;
  ...
}
```

::::info 这一步是"跟着第一步改"
如果只改 `renameBundleEntry` 不改后续遍历：
- Rollup 下：仍然正确（key === fileName，两种读法都行）
- Rolldown 下：patchHtmlReferences 把 HTML 里的 `<script src="assets/home-xxx.js">` 替换成 stale 的 key（旧路径），浏览器依然 404

**必须**一起改，且**之前 Rollup 下能工作是巧合**（因为 delete/assign 生效后 key 和 fileName 一致）。
::::

### 4.4 配置字段：`IS_ROLLDOWN` 分叉发送

**关键语义发现**：Rolldown 里 `codeSplitting.minSize` **必须与 `groups` 一起用才生效**。而 `manualChunks` 和 `codeSplitting` **互斥**——一旦设置 `codeSplitting`，`manualChunks` 被忽略。

所以我们**放弃**在 Rolldown 下尝试自动合并 <10KB 小 chunk（需要把 200+ 行的 `nodeModulesPerPackageChunker` 重写成 `codeSplitting.groups` 形式），**保留** `manualChunks`（vendor 缓存策略远比 10KB 合并重要）：

```ts title="packages/vite-plugin/src/plugin.ts"
rollupOptions: {
  input,
  ...(c.cdn.active
    ? {
        external: Array.from(externalIds),
        output: {
          globals,
          manualChunks: nodeModulesPerPackageChunker,
          // Rollup 独占：Rolldown 会打印 Invalid key 并拒绝
          ...(IS_ROLLDOWN ? {} : {experimentalMinChunkSize: 10 * 1024})
        }
      }
    : {
        output: {
          manualChunks: nodeModulesPerPackageChunker,
          ...(IS_ROLLDOWN ? {} : {experimentalMinChunkSize: 10 * 1024})
        }
      })
} as any
```

### 4.5 Minifier 选项：`oxc` vs `esbuild` 两选一

Rolldown 默认用 Oxc minifier，对 `esbuild: {...}` 做了兼容层翻译并打印 deprecated 警告。我们根据 bundler 发**不同的字段**，不再两者同发：

```ts title="packages/vite-plugin/src/plugin.ts"
...(IS_ROLLDOWN
  ? {
      oxc: {
        drop: env.command === 'build' ? ['debugger'] : undefined,
        pure: env.command === 'build'
          ? ['console.log', 'console.debug', 'console.trace']
          : undefined,
        legalComments: 'none'
      } as any
    }
  : {
      esbuild: {
        drop: env.command === 'build' ? ['debugger'] : undefined,
        pure: env.command === 'build'
          ? ['console.log', 'console.debug', 'console.trace']
          : undefined,
        legalComments: 'none'
      }
    }),
```

---

## 五、🛡️ 防御：让同类静默故障暴露出来

光修 plugin 不够——**离线管道本身没发现 HTML 丢失**才是更深层的问题。我们给 `@lhx-kit/offline` 的 inspect 加了一条交叉校验：

### 5.1 问题：`valid: true` 定义过松

**修复前**：只要 `manifest.assets[i].path` 列出来的所有文件都存在，就算 `valid`。但 manifest 本身是从 dist 扫出来的——如果 dist 一开始就缺 HTML，manifest 里压根不会有这一条 asset，自然不会 missing，也就永远 valid。

### 5.2 修复：页面声明必须在资产清单里

```ts title="packages/offline/src/index.ts::inspectOfflineOutput"
// 交叉校验：每个声明的 page.file 必须也出现在 assets[] 里。
// 历史上构建管道曾经静默丢失 per-page 输出（例如 bundler 的
// rename 钩子在 Rolldown 下被忽略），留下声称
// `pages[0].file = "home/index.html"` 但 zip 里其实只有
// vendor chunk 的 manifest —— 发到容器就是白屏。
// 把这种不一致升级为 validation failure，让 CI 非零退出。
const assetPaths = new Set(manifest.assets.map(a => a.path));
for (const page of manifest.pages) {
  if (!assetPaths.has(page.file)) {
    missing.push(`(page "${page.name}" declared file) ${page.file}`);
  }
}
```

::::warning 这条校验的意义
它把"**白屏级别的故障**"从"上线后被用户发现"提前到了"CI 失败阶段"。CI 输出会明确指出：

```text
✗ offline package INVALID
  missing: (page "home" declared file) home/index.html
```

团队再也不会"构建成功 + 离线 valid + 白屏上线"这种连锁被骗。
::::

---

## 六、📊 修复前后对比

### 6.1 构建日志

| 信号 | 修复前 | 修复后 |
|------|--------|--------|
| `esbuild option was deprecated` | 🔴 每次构建 1 条 | ✅ 0 |
| `Invalid key: experimentalMinChunkSize` | 🔴 每次构建 1 条 | ✅ 0 |
| `[plugin lhx-kit] Error: assigns to bundle` | 🔴 **每次 11 条** | ✅ 0 |
| `advancedChunks option is deprecated` | — | ✅ 0 |
| `manualChunks option is ignored` | — | ✅ 0 |
| `INVALID_OPTION: minSize without groups` | — | ✅ 0 |

### 6.2 产物完整性

| 指标 | 修复前 | 修复后 |
|------|--------|--------|
| `dist/home/index.html` | ❌ 丢失 | ✅ 7.07 KB |
| `dist/settings/index.html` | ❌ 丢失 | ✅ 6.99 KB |
| `dist/home/assets/*.js` | ❌ 丢失 | ✅ 10 个 chunk |
| `manualChunks` 生效（`vendor-zod-*.js`）| ❌ | ✅ |
| 离线包 asset 数量 | 11（残缺）| ✅ **33**（完整）|
| 离线包体积 | 335 KB（缺入口）| ✅ **501 KB** |
| 离线 `valid` 是否可信 | 🔴 骗人 | ✅ 交叉校验后可信 |

### 6.3 诊断能力

```text title="现在再遇到 dist 丢 HTML 会发生什么"
构建阶段：
  如果任何 plugin 误改 bundle → Rolldown 打警告（已经是干净日志，警告一目了然）

离线阶段：
  manifest.pages[0].file = "home/index.html"
  manifest.assets 里找不到 home/index.html
  ↓
  inspectOfflineOutput 报告：
    missing: (page "home" declared file) home/index.html
    valid: no
  ↓
  CLI 非零退出，CI 失败，**根本到不了上线**
```

---

## 七、🎯 受影响代码总览

### 7.1 `packages/vite-plugin/src/plugin.ts`

| 函数/位置 | 改动 | 原因 |
|-----------|------|------|
| 文件顶部 `import * as viteExports from 'vite'` | 新增 | 探测 Rolldown |
| `IS_ROLLDOWN` 常量 | 新增 | 两栈分叉开关 |
| `renameBundleEntry` | **in-place 修改 fileName**，不再 delete/assign | Rolldown 硬约束 |
| `patchHtmlReferences` | 遍历改为 `Object.values() + asset.fileName` | rename 后 key 不再权威 |
| `patchChunkImports` | 同上 | 同上 |
| `reportOversizedChunks` | 同上 | 同上 |
| generateBundle 里 CDN gate 循环 | 同上 | 同上 |
| `rollupOptions.output` | `IS_ROLLDOWN` 下不发 `experimentalMinChunkSize` | Rolldown 拒绝未知字段 |
| 根级 minify 选项 | `IS_ROLLDOWN` 下发 `oxc`，否则 `esbuild` | 去掉 deprecated 警告 |

### 7.2 `packages/offline/src/index.ts`

| 函数 | 改动 | 原因 |
|------|------|------|
| `inspectOfflineOutput`（目录分支 + zip 分支）| 新增"page.file 必须在 assets 中"交叉校验 | 把沉默失败变成 valid: false |

---

## 八、✅ 升级清单（面向其他项目）

如果你维护的 Vite 插件也要从 Rollup 兼容升到 Rolldown，按这张表走一遍：

| 检查项 | 说明 |
|--------|------|
| [ ] 搜 `delete bundle[` / `bundle[*] =` | 有就改成 in-place 修改 `fileName` |
| [ ] 搜 `Object.entries(bundle)` | 凡是对 rename 后的状态敏感的地方，改成 `Object.values` + 读 `asset.fileName` |
| [ ] 搜 `experimentalMinChunkSize` | 按 `IS_ROLLDOWN` 分叉，Rolldown 下去掉 |
| [ ] 搜 `inlineDynamicImports: true` | Rolldown 改名为 `codeSplitting: false` |
| [ ] 搜 `manualChunks` | 功能仍在；未来若要启用 minChunkSize，需要整体迁到 `codeSplitting.groups` |
| [ ] 搜 `esbuild:` 配置 | 加 Rolldown 分支发 `oxc:` |
| [ ] 搜 `transformWithEsbuild` | 换成新导出 `transformWithOxc` |
| [ ] load/transform hook 返回 | 加 `moduleType: 'js'`（非 JS 转 JS 时必要）|
| [ ] 下游诊断工具的"valid" 定义 | 加交叉校验，别让"资产清单内部一致"等价于"产物对业务有效" |

---

## 九、🧭 延伸阅读

- [Rolldown 集成](https://cn.vite.dev/guide/rolldown) — Vite 8 官方迁移指南
- [Vite Issue #21844](https://github.com/vitejs/vite/issues/21844) — `experimentalMinChunkSize` 迁移讨论
- [Rolldown `codeSplitting` 文档](https://rolldown.rs/reference/outputoptions.codesplitting) — `groups + minSize` 语义
- [Rolldown Issue #7330](https://github.com/rolldown/rolldown/issues/7330) — `advancedChunks → codeSplitting` 改名说明
- [⚡ Vite 插件实现详解](./vite-plugin) — 当前 `@lhx-kit/vite-plugin` 的整体设计
- [📦 离线打包概览](../offline/overview) — 离线管道的总体流程
- [🔬 打包深度剖析](../offline/packaging-deep-dive) — 压缩/哈希的选型对比

---

::::tip 一页速记
1. **Rolldown 约束**：`generateBundle` 里不能对 `bundle` 变量赋值（`delete` / 新 key 都不行），但**可以**修改 asset 对象的 `fileName`。
2. **识别 bundler**：`import * as viteExports from 'vite'` → `viteExports.rolldownVersion` 存在即 Rolldown。
3. **配置分叉**：`experimentalMinChunkSize` → Rolldown 下删除；`esbuild:` → Rolldown 下改 `oxc:`；`manualChunks` 两边都留。
4. **深层防御**：不要信任"所有列出的 asset 都存在"=="产物对业务可用"。一定要加**跨集合交叉校验**（"声明的 pages.file 必须都在 assets 列表里"）。
5. **静默故障教训**：构建退出码 0、valid yes、体积合理——三件事同时成立**也不等于**上线没事。要物理对比一次 dist 才踏实。
::::
