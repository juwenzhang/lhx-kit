# 🧠 架构总览

> 本章讲**系统是如何组织的**、**为什么这样组织**、**底层每一层在解决什么问题**。
> 读完之后你应该能：
> - 📐 给同事画出整条构建链路
> - 🔍 定位一个 bug 应该去哪个包查
> - 🎯 判断一个新 feature 应该加在哪层

## 一、🧭 设计哲学

### 1.1 单一真理源（Single Source of Truth）

:::tip 核心约束
整个 kit 的所有工具链能力，**只能读** `project.config.ts`，**不允许**自行维护另一份配置。
:::

传统 MPA 项目的痛苦：

```text title="❌ 传统工具链：三份配置不同步"
webpack.config.js      ← 列出入口文件
package.json           ← scripts: "build:home", "build:settings"
src/routes.json        ← 同一份 page 列表的第三个副本
```

改一个 page 名字，三处都要改，漏掉一处就跑不起来。

lhx-kit 的做法：

```text title="✅ lhx-kit：所有工具读同一个配置" {3}
project.config.ts      ← SSOT：唯一可写位置
     ↓
     ├─ @lhx-kit/cli（build / dev / add）
     ├─ @lhx-kit/vite-plugin（input / alias / define）
     ├─ @lhx-kit/offline（whitelist / pages）
     └─ @lhx-kit/config（validateAgainstFilesystem）
```

### 1.2 分层架构

```text
┌─────────────────────────────────────────────────────────┐
│                     Layer 4: UI 层                       │
│              (examples / 用户自建项目)                    │
│           React / Vue 组件 + 业务逻辑                      │
└─────────────────────┬───────────────────────────────────┘
                      │ peer dep
┌─────────────────────▼───────────────────────────────────┐
│                  Layer 3: 能力层                         │
│   @lhx-kit/runtime     @lhx-kit/renderer                 │
│   浏览器侧运行时        配置驱动渲染                        │
│   (request/mobile/...)  (schema/walker/...)              │
└─────────────────────┬───────────────────────────────────┘
                      │ import
┌─────────────────────▼───────────────────────────────────┐
│                  Layer 2: 编排层                         │
│   @lhx-kit/vite-plugin    @lhx-kit/offline               │
│   构建管线编排              离线包生产                       │
└─────────────────────┬───────────────────────────────────┘
                      │ uses
┌─────────────────────▼───────────────────────────────────┐
│                  Layer 1: 基础层                         │
│   @lhx-kit/config (ssot)    @lhx-kit/cli (input)         │
└─────────────────────────────────────────────────────────┘
```

四层**严格单向依赖**：

- Layer 4 依赖 Layer 3 / 2 / 1
- Layer 3 依赖 Layer 1（不依赖 Layer 2）
- Layer 2 依赖 Layer 1
- Layer 1 不依赖任何内部包

:::info 为什么 Layer 3 不能依赖 Layer 2
如果 `@lhx-kit/runtime` 依赖 `@lhx-kit/vite-plugin`，就意味着"运行时代码需要构建时代码才能跑"—— SSR / Node.js 环境会直接炸。这是**"运行时代码零构建依赖"**的硬约束。
:::

### 1.3 可渐进采用（Progressive Adoption）

```text
最小集：只用 CLI 创建项目 → 然后就用普通 Vite
          ↓
扩展：启用 runtime/mobile 做适配
          ↓
扩展：启用 renderer 做 A/B 配置化
          ↓
扩展：启用 offline 打离线包
          ↓
扩展：启用 CDN 外挂优化首屏
```

每一步都**可选**；不用某个能力时，它不出现在 bundle 里。

## 二、📦 Monorepo 布局

```text title="unkown/"
unkown/
├── apps/
│   └── docs/                # 📘 文档站（Rspress）
├── examples/
│   ├── vmpa/                # 🟢 Vue3 MPA 示例
│   └── rmpa/                # 🔵 React MPA 示例
├── packages/
│   ├── config/              # @lhx-kit/config        — Layer 1 SSOT
│   ├── cli/                 # @lhx-kit/cli           — Layer 1 入口
│   ├── vite-plugin/         # @lhx-kit/vite-plugin   — Layer 2 编排
│   ├── offline/             # @lhx-kit/offline       — Layer 2 离线
│   ├── runtime/             # @lhx-kit/runtime       — Layer 3 能力
│   └── renderer/            # @lhx-kit/renderer      — Layer 3 渲染
├── scripts/
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

:::tip 为什么 docs 放 `apps/` 不放 `packages/`
- `packages/` 是发布到 npm 的**库**
- `apps/` 是部署到服务器的**应用**

docs 是一个部署到 GitHub Pages 的 Rspress 站点，它不会被 `import`，也不发 npm——属于**应用**而非库。分开放避免 `pnpm -r publish` 误发。
:::

## 三、🔗 包依赖关系图

```text
                   project.config.ts
                        (SSOT)
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
    ┌──────────┐    ┌─────────────┐   ┌───────────┐
    │  config  │◄───│ vite-plugin │   │  offline  │
    └──────────┘    └─────┬───────┘   └─────┬─────┘
          ▲               │                 │
          │          peer │ uses            │ uses
          │               ▼                 │
          │         ┌─────────────┐         │
          └─────────┤     cli     ├─────────┘
                    └─────┬───────┘
                          │
                    ┌─────┴────────────┐
                    ▼                  ▼
              ┌──────────┐       ┌──────────┐
              │ runtime  │       │ renderer │
              └────┬─────┘       └────┬─────┘
                   │                  │
                   └──────┬───────────┘
                          ▼
                 用户业务代码 (examples)
```

## 四、🎬 完整执行时序：以 `lhx-cli dev` 为例

```text
┌─────────────────────────────────────────────────────────┐
│ 1. 用户执行 lhx-cli dev                                  │
│    ↓                                                    │
│ 2. packages/cli/src/bin.ts 入口                         │
│    cac 路由到 commands/dev-build.ts                     │
│    ↓                                                    │
│ 3. @lhx-kit/config::loadProjectConfig                   │
│    - jiti 动态加载 TS 配置（不预编译）                    │
│    - zod.parse 严格校验                                  │
│    - validateAgainstFilesystem 做文件存在性检查          │
│    ↓                                                    │
│ 4. @lhx-kit/cli::context.ts                             │
│    组装 Context {project, env, mode, pages}             │
│    ↓                                                    │
│ 5. 启动 Vite（createServer）                             │
│    vite.config.ts 里 plugins: [lhxKit()]                │
│    ↓                                                    │
│ 6. @lhx-kit/vite-plugin::config() hook                  │
│    - 生成 .lhx-kit/pages/*.html（中间 HTML）            │
│    - 翻译成 Vite UserConfig：                            │
│      · input: {home: '.../home.html', ...}              │
│      · resolve.alias: [...]                             │
│      · define: {LHX_API_BASE, LHX_MODE, ...}            │
│      · rollupOptions.output.manualChunks                │
│      · experimentalMinChunkSize: 10KB                   │
│    ↓                                                    │
│ 7. Vite dev server started on :5173                     │
│    ↓                                                    │
│ 8. 浏览器请求 /home                                      │
│    → cleanUrls middleware 映射到 home.html              │
│    → Vite 按 entry 流程加载                              │
│    ↓                                                    │
│ 9. HMR ready                                            │
└─────────────────────────────────────────────────────────┘
```

build 流程基本相同，只是第 7 步变成 `vite build`，第 8 步变成 `transform()` 改写 CDN + `generateBundle()` 重组 chunk。完整流程见 [Vite 插件实现详解](../runtime/vite-plugin)。

## 五、📚 各包职责详解

### 5.1 `@lhx-kit/config` — 单一真理源

**职责**：读取、校验、规范化配置。

```ts title="packages/config/src/loader.ts" showLineNumbers
import {createJiti} from 'jiti';

export async function loadProjectConfig(rootDir: string) {
  const configPath = findConfig(rootDir, 'project.config');
  const jiti = createJiti(rootDir, {
    moduleCache: false,       // ← 关键：关掉 require 缓存让 HMR 生效
    interopDefault: true      //   保证 export default 读成默认导出
  });
  const raw = await jiti.import(configPath);
  return resolveProjectConfig(raw);   // zod.parse + 默认值填充
}
```

:::info 为什么用 jiti 不用 esbuild / tsx
| 工具 | 启动成本 | ESM / TS 支持 | 备注 |
| --- | --- | --- | --- |
| `esbuild` | 🔴 50MB 二进制 | ✅ | 依赖 native binary，Docker 交叉编译踩坑 |
| `tsx` | 🟡 中 | ✅ | 进程级，启动慢 |
| `ts-node` | 🔴 慢 | ⚠️ | ESM 兼容有缺陷 |
| `jiti` | 🟢 纯 JS | ✅ | 适合程序内加载单个配置文件 |

我们只需要**加载一个几十行的 TS 文件**，不需要全量 TS 编译。`jiti` 是正好匹配这个场景的轻量方案。
:::

**算法：`resolveEnv` 环境降级**

```ts title="packages/config/src/helpers.ts"
const ENV_FALLBACK_ORDER = ['prod', 'staging', 'test', 'dev'] as const;

export function resolveEnv(project: ResolvedProjectConfig, mode: string): EnvEntry {
  // 1. 精确匹配
  const direct = project.envs[mode];
  if (direct) return direct;

  // 2. 降级链：找第一个存在的
  for (const name of ENV_FALLBACK_ORDER) {
    const env = project.envs[name];
    if (env) return env;
  }

  // 3. schema 已经保证至少有一个，走不到这里
  throw new Error('unreachable: env schema requires at least one entry');
}
```

### 5.2 `@lhx-kit/cli` — 入口

```text title="packages/cli/src/"
cli/
├── bin.ts               # #!/usr/bin/env node 入口
├── index.ts             # cac 路由注册
├── context.ts           # Context 构造（读配置 + 环境）
├── commands/
│   ├── create.ts        # 脚手架创建
│   ├── add.ts           # add page / component / ...
│   ├── dev-build.ts     # dev / build / preview
│   ├── info.ts          # 配置摘要打印
│   ├── doctor.ts        # 环境与配置诊断
│   ├── offline.ts       # offline 子命令
│   └── upgrade.ts       # 升级（占位）
├── ast/                 # ts-morph 封装
├── scaffold/            # 模板拷贝与占位替换
└── ui.ts                # 交互式 UI（prompts + kolorist）
```

### 5.3 `@lhx-kit/vite-plugin` — MPA 编排器

**核心**：把 `project.config.ts` 翻译成 Vite 能理解的 UserConfig，并接管 MPA 相关的所有产物重写。

5 个钩子时序见 [Vite 插件实现详解](../runtime/vite-plugin)。

### 5.4 `@lhx-kit/runtime` — 浏览器侧能力

```ts title="subpath exports 设计"
import {setupMobile} from '@lhx-kit/runtime/mobile';       // ✅ 只引 mobile
import {createRequest} from '@lhx-kit/runtime/request';    // ✅ 只引 request
// 其他子模块不会被 tree-shake 进来
```

完整子模块见 [Runtime 概览](../runtime/overview)。

### 5.5 `@lhx-kit/renderer` — 配置驱动 UI

```text title="renderer 的 5 个核心函数"
schema.ts       →  PageSchema / ComponentSchema 类型
walker.ts       →  walkComponents() 组件树遍历
expression.ts   →  resolveValue() CSP 安全表达式求值
merge.ts        →  mergeSchema() patch 合并
variant.ts      →  resolveVariant() A/B 选组
```

完整算法见 [Renderer 概览](../renderer/overview)。

### 5.6 `@lhx-kit/offline` — 离线打包

```text title="打包流程"
dist/ → 白名单过滤 → sha256 指纹 → manifest.json → AdmZip → .zip
                                 ↓
                        HTML CDN urls 置空
```

完整算法见 [离线打包](../offline/overview)。

## 六、🧪 依赖表

所有 **生产依赖** 汇总如下（`devDependencies` 省略）：

| 包 | 依赖 | 作用 |
| --- | --- | --- |
| `@lhx-kit/config` | `jiti` `zod` | 加载 TS 配置 + 运行时校验 |
| `@lhx-kit/cli` | `cac` `prompts` `kolorist` `execa` `fs-extra` `giget` `jiti` `ts-morph` | 命令解析 / 交互 / 彩色输出 / 子进程 / 文件系统 / 模板拉取 / TS 加载 / AST 操作 |
| `@lhx-kit/vite-plugin` | `@lhx-kit/config` `@lhx-kit/runtime` | peer: `vite ^5/6/7` |
| `@lhx-kit/runtime` | `axios` `ua-parser-js` | HTTP 客户端 + UA 解析 |
| `@lhx-kit/renderer` | `zod` | peer: `react >=18` / `vue >=3`（均可选） |
| `@lhx-kit/offline` | `adm-zip` `fs-extra` `zod` | zip 打包 / 文件系统 / 校验 |

:::tip 为什么选 zod 而不是 joi / yup / ajv
| 特性 | zod | joi | yup | ajv |
| --- | --- | --- | --- | --- |
| TS 优先（infer） | ✅ | ❌ | 🟡 | ❌ |
| Bundle 体积 | 🟡 54KB | 🔴 150KB | 🟢 40KB | 🟡 60KB |
| Discriminated union | ✅ | ❌ | ❌ | ✅ |
| 错误信息可读性 | 🟢 | 🟡 | 🟡 | 🔴 |

我们需要的场景：**TS 类型推导 + 精细的错误信息 + discriminated union**。zod 是唯一全部满足的方案。体积问题通过 dynamic import 在客户端规避（见 [Renderer 概览 §4](../renderer/overview)）。
:::

## 七、📖 约定大于配置

| 约定 | 含义 |
| --- | --- |
| `src/pages/<name>/entry.{ts\|tsx}` | 每个 page 的入口文件位置 |
| `src/pages/<name>/render.json` | renderer 就近 schema（可选） |
| `src/pages/<name>/router.{ts\|tsx}` | page 内路由（可选） |
| `.lhx-kit/pages/` | 插件生成的中间 HTML 目录 |
| `dist/<name>/index.html` | 每个 page 的最终产物 |
| `dist/shared/assets/` | 跨 page 共享的 chunks |
| `dist-offline/manifest.json` | 离线包清单 |
| `dist-offline/files/` | 离线包待打包文件 |

:::warning 不要打破约定
违反上面任何一条，都需要修改 Vite 插件源码才能让工具链识别。**约定是 lhx-kit 的 API**，不是内部实现细节。
:::

## 八、🎯 性能设计原则

> 详细论证见 [⚡ 性能优化](./performance)

- **HTTP/2 下 chunk 门槛 = 10KB**：拆小了亏 RTT，拆大了亏缓存粒度
- **家族分组 + 最小 chunk 合并双策略**：`FAMILY_GROUPS` 限定 React / Vue 全家桶不分裂
- **CDN 外挂可选**：打进 bundle 是基线，CDN 是优化
- **预压缩双格式**：`.gz` + `.br` 都产，nginx 按 Accept-Encoding 协商

## 九、🔭 扩展性设计

### 9.1 怎么加一个新模板

```text title="packages/cli/templates/vue3-admin/"
vue3-admin/
├── template.json         # 元数据（feature 清单 / postCreate 提示）
├── files/                # 基础文件
└── features/             # 按勾选追加
```

**不需要改 CLI 源码**。模板是数据驱动的，`create` 命令扫描 `templates/` 目录发现可选模板。

### 9.2 怎么加一个新运行时子模块

```text title="packages/runtime/src/tracker.ts"
// 1. 新增文件
export function createTracker(opts) { ... }
```

```json title="packages/runtime/package.json"
{
  "exports": {
    "./tracker": {                        // 2. 追加 exports 字段
      "types": "./dist/tracker.d.ts",
      "default": "./dist/tracker.js"
    }
  }
}
```

```ts title="packages/runtime/tsup.config.ts"
{
  entry: ['src/*.ts']                    // 3. 已经是通配符，自动包含
}
```

用户写 `import {createTracker} from '@lhx-kit/runtime/tracker'` 即可。

### 9.3 怎么加一个新 vite 插件钩子行为

```ts title="packages/vite-plugin/src/plugin.ts"
// 直接在 mainPlugin 对象里加一个 hook
const mainPlugin: Plugin = {
  name: 'lhx-kit',
  enforce: 'pre',
  async config(userConfig, env) { ... },
  transform(code, id) { ... },
  generateBundle(options, bundle) { ... },
  // ↓ 新增
  handleHotUpdate(ctx) { ... }
};
```

## 十、🔗 下一步

- [⚡ 性能优化](./performance) — 看 chunk 策略演进 + 实测数据
- [🌐 CDN 外挂](./cdn) — 把 React/Vue 请出 bundle 的完整方案
- [📱 移动端适配](./mobile-adaptation) — rem + 桌面居中护栏
- [⚙️ CLI 参考](../cli/reference) — 全部命令与选项
- [🧩 Runtime 概览](../runtime/overview) — 10 个子模块的能力清单
