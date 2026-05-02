# 📚 术语表

> 文档里反复出现的专有名词和缩写的统一解释。

---

## A

### **AST (Abstract Syntax Tree) 抽象语法树**

源代码经过 parser 解析后的树形结构。lhx-kit 用 `ts-morph` 操作 AST 来**安全地修改** `project.config.ts`，避免字符串拼接踩坑。

### **`aliasGlobals`**

CDN entry 字段。加载 UMD 后把 `window[globalVar]` 追加到其他 global 名上。典型场景：**Preact 替代 React**——把 `window.preactCompat` 别名为 `window.React`。

### **`applyOn`**

CDN 配置字段。`('dev' | 'build' | 'preview')[]`，指定哪些 Vite 命令启用 CDN。默认 `['build']`，保证开发时源码直接引用便于调试。

---

## B

### **Base Schema（renderer）**

Renderer 里的"基础配置"。所有 patches 都基于 base schema 合并。

### **bootstrap.ts**

MPA 的共享初始化代码。通常在每个 page 的 `entry.{ts,tsx}` 最早期被 import，负责调用 `setupMobile` / `setupMock` / 主题初始化等。

### **Brotli**

Google 开源的压缩算法，压缩比比 gzip 多省 15–25%。**仅 HTTPS 场景下**被浏览器接受。lhx-kit 默认产 `.br` 文件。

---

## C

### **cac**

轻量级 CLI 框架，15KB 大小。lhx-kit 的 CLI 框架选型。见 [CLI §10](../cli/reference#十-cli-自身依赖)。

### **CDN Loader**

运行时代码（来自 `@lhx-kit/runtime/cdn-loader`），构建时**以 IIFE 形式 inline 到 HTML**。负责按顺序加载 CDN UMD、失败降级、通知业务代码。

### **Chunk**

Rollup 构建产物的单元，对应一个 `.js` 文件。lhx-kit 在 `generateBundle` 钩子里按 ownership 把 chunk 分到 `<page>/assets/` 或 `shared/assets/`。

### **CJS (CommonJS)**

`require` / `module.exports` 风格的模块系统。Node.js 早期格式。react-dom 的生产构建就是一个大 CJS 闭包。

### **CSP (Content Security Policy)**

浏览器安全策略。生产 CSP 通常禁 `unsafe-eval`，这就是 lhx-kit renderer 不用 `new Function` 的原因。

---

## D

### **Dead-path Chunk**

代码里通过 `if (false) import(...)` 或条件为假的 `await import(...)` 产生的 chunk。在 **dead path 上永远不会加载**，但保留了"按需时才加载"的语义。

典型：`@lhx-kit/renderer/schema-zod` 的 1.12KB chunk。

### **DPR (Device Pixel Ratio)**

物理像素与 CSS 像素的比值。iPhone Retina 是 2 / 3，Android 高端机 2 / 3 / 3.5。`window.devicePixelRatio`。

### **Dynamic Import**

`import(...)` 返回 Promise 的语法。Rollup 遇到它会**自动拆 chunk**。

---

## E

### **Early Exit**

优化模式：在**昂贵操作之前**做一个快速检查，能跳过就跳过。lhx-kit `transform()` 钩子的 `code.includes(name)` 就是 early exit。

### **ESM (ECMAScript Modules)**

`import` / `export` 风格的模块系统。浏览器原生支持。

### **Entry Chunk**

Rollup 术语：作为构建入口的 chunk。在 lhx-kit 里对应每个 page 的 `entry.{ts,tsx}` 产生的 chunk。

### **`experimentalMinChunkSize`**

Rollup 配置项。低于阈值的 chunk 自动合并到静态 importer。lhx-kit 设为 `10 * 1024`（10KB）。

---

## F

### **Family Groups**

lhx-kit 的自定义 chunk 分组策略。React / Vue 等"总是一起用"的包归到同一个 vendor chunk。

### **Fiber**

React reconciler 的内部数据结构。**10 年稳定存在**，是 react-dom 不能被拆分的根本原因。

### **Fallback**

降级机制。在 CDN 方案里指"CDN 全挂时走本地 vendor"的那一层。

---

## G

### **`generateBundle`**

Rollup / Vite 插件钩子。所有 chunk 已生成、写盘前最后一步。lhx-kit 在这里做 chunk 重组和 HTML 注入。

### **giget**

从 GitHub / tarball 拉模板的工具。lhx-kit **保留依赖但目前不用**（走本地 templates）。

### **globalVar**

CDN entry 字段。UMD 暴露的全局变量名。默认按 kebab→PascalCase 推导（`vue`→`Vue`，`vue-router`→`VueRouter`）。

### **gzip**

基础压缩算法，所有浏览器都支持。lhx-kit 默认产 `.gz` 文件。

---

## H

### **Hairline**

0.5px 边框。DPR >= 2 的设备通常支持。lhx-kit `setupMobile({detectHairlines: true})` 会自动给 `<html>` 加 `.hairlines` class。

### **HPACK**

HTTP/2 的头部压缩算法。每个 HTTP/2 请求的 overhead（即使头部很小）在 HPACK 下也是 ~200 bytes。

### **HTTP/2**

HTTP 协议的 2.0 版本，支持**多路复用**（一条 TCP 连接跑多个 stream）。lhx-kit 的 chunk 策略假设生产环境是 HTTP/2。

### **Hybrid App**

原生 App + WebView 混合的应用。淘宝 / 京东 / 各家银行 App 都是典型。lhx-kit 的 offline 功能专为此场景设计。

---

## I

### **IIFE (Immediately-Invoked Function Expression)**

`(function(){...})()` 结构。CDN loader 就是一个 IIFE。

### **initcwnd**

TCP 的**初始拥塞窗口**。Linux 默认 10，约等于 14KB。**首轮 RTT 能传的字节数上限**。这是 10KB chunk 门槛的理论依据。

### **`initScript`**

CDN entry 字段。entry 加载后执行的 JS 片段，用于 polyfill。典型：给 Preact compat 加 `createRoot` polyfill。

---

## J

### **jiti**

运行时加载 `.ts` / `.mjs` / `.js` 的工具。lhx-kit 用它加载用户的 `project.config.ts`，不需要预编译。

---

## L

### **lazy route / lazy component**

用 `lazy(() => import(...))` / `defineAsyncComponent` 包裹的组件。Rollup 会**单独拆 chunk**。

### **lib-flexible**

阿里团队早期的移动端适配库。思路："根字体 = clientWidth / 10"。lhx-kit `mobile.ts` 基本是它的现代化重写。

### **`localFallback`**

CDN entry 字段。覆盖自动扫描的本地 UMD 路径。典型场景：**`package.json#exports` 封闭了子路径**，自动扫描失败。

---

## M

### **manifest.json**

离线包的清单文件。包含 `packageName / version / pages / assets` 等元信息。容器侧读取它决定怎么加载。

### **manualChunks**

Rollup 配置项。接受函数或映射，决定每个模块落到哪个 chunk。lhx-kit 的 `nodeModulesPerPackageChunker` 就是这个。

### **modulepreload**

`<link rel="modulepreload">` 标签。让浏览器**并行**下载关键 chunk 而不等 entry module 被解析。Vite build 自动注入。

### **MPA (Multi-Page Application)**

多页面应用，每个页面一个独立 HTML 入口。对应 SPA（单页面应用）。lhx-kit 专为 MPA 场景优化。

### **MSW (Mock Service Worker)**

接口 mock 工具，通过 Service Worker 拦截 fetch/XHR。`@lhx-kit/runtime/mock` 是它的封装。

---

## O

### **offline package**

离线包。由 `lhx-cli offline build` 产出的 zip，包含 HTML/JS/CSS/manifest。

### **Ownership（chunk）**

lhx-kit 的术语。一个 chunk 被哪些 page 引用。`ownership.size === 1` → 进 page 目录；`>= 2` → 进 shared。

---

## P

### **Per-page**

lhx-kit 的 MPA 产物布局。每个 page 独立目录：`dist/home/`、`dist/dashboard/`。

### **Pinia**

Vue 3 的推荐状态管理库。`vue3-mpa` 模板默认引入。

### **PPID (PostCSS Plugin)**

后处理 CSS 的工具。lhx-kit 移动端场景用 `postcss-pxtorem` 把 px 转 rem。

### **Prefetch Rule**

离线包配置的"预热规则"。容器启动后异步预取的 API 列表。

### **Project Config**

`project.config.ts`。lhx-kit 的**单一真理源**。

### **Project Root**

项目根目录。由 `lhx-cli` 通过 `findNearestProjectRoot` 向上查找 `project.config.*` 确定。

---

## R

### **react-dom reconciler**

React 的内部调度系统。fiber tree + commit phase 的总称。**不可 tree-shake**。

### **rem**

相对根字体的尺寸单位。`1rem === document.documentElement.style.fontSize`。

### **Remote Schema**

运营后台下发的 schema。由 `fetchRemoteSchema` 拉取，合并到 base 之上。

### **Renderer**

`@lhx-kit/renderer`。配置驱动的 UI 渲染器。

### **Rollup**

Vite 生产构建的底层打包器。lhx-kit 在 Rollup 钩子里做 chunk 分配等工作。

### **RTT (Round-Trip Time)**

网络往返时间。4G 典型 50ms，WiFi 典型 20ms，国际 200ms。

### **Runtime**

`@lhx-kit/runtime`。浏览器侧运行时能力集合。

---

## S

### **Schema**

`@lhx-kit/renderer` 里的 JSON 配置。定义页面组件树 + 绑定。

### **Schema Patch**

对 base schema 的修改声明。支持 `set / insert / remove` 三种 op。

### **Shared Chunk**

被 2+ page 引用的 chunk。在 `dist/shared/assets/`。

### **Sink**

logger 架构里的"输出端"。一个 logger 可以有多个 sink（console + HTTP 上报 + 等）。

### **SSOT (Single Source of Truth)**

单一真理源。lhx-kit 的核心架构原则——所有工具读同一份 `project.config.ts`。

### **Subpath Export**

`package.json#exports` 的子路径配置。允许 `@lhx-kit/runtime/mobile` 这种精细 import。

---

## T

### **Template (CLI)**

lhx-cli 的模板目录。`packages/cli/templates/<name>/`。

### **Template (literal)**

`*.template` 文件。拷贝时经过占位替换才变成最终文件。

### **`template.html`**

MPA 共用的 HTML 模板。`{{ title }}` 等占位在 `generateIntermediateHtml` 阶段被替换。

### **transform**

Vite 插件钩子。改写源码。lhx-kit 在这里做 CDN import 改写。

### **ts-morph**

TypeScript AST 操作库。lhx-kit CLI 用它做 `project.config.ts` 的 AST 级修改。

### **tsup**

基于 esbuild 的 TS 打包工具。lhx-kit 的所有内部包都用 tsup 构建。

---

## U

### **UA (User-Agent)**

浏览器发送给服务器的身份标识字符串。`@lhx-kit/runtime/env` 用 `ua-parser-js` 解析它。

### **UMD (Universal Module Definition)**

兼容 CJS / AMD / 全局的模块格式。CDN 方案依赖 UMD 产物。**React 19 不再提供 UMD**。

---

## V

### **Variant**

Renderer 里的"变体"。按 `when` 条件选一组 base + patches。

### **vendor chunk**

来自 `node_modules` 的 chunk。相对于 user code chunk。

### **vite-plugin**

`@lhx-kit/vite-plugin`。整个 kit 的**编排层核心**。

### **VUE-DEMI**

Vue 2 / 3 兼容层。Pinia 通过它支持 Vue 2。作为 vue 家族 chunk 的一部分。

---

## W

### **Walker**

`@lhx-kit/renderer/walker.ts` 里的 `walkComponents` 函数。组件树遍历 + 表达式求值。

### **WebView**

原生 App 里嵌入的浏览器组件。iOS `WKWebView` / Android `WebView`。

### **`when` expression**

Renderer schema 里的条件表达式。结构化布尔（`and/or/not/eq/...`）。

### **whitelistPages**

`offline.config.ts` 字段。哪些 page 进离线包。

### **workspace:\***

pnpm 的 workspace 协议。`"@lhx-kit/config": "workspace:*"` 表示用 workspace 里的版本。

---

## Z

### **zod**

TS 优先的 schema 校验库。lhx-kit 的 `@lhx-kit/config` / `@lhx-kit/renderer` / `@lhx-kit/offline` 都用它。

### **zustand**

轻量 React 状态管理库。`react-mpa` 模板默认引入（替代 Redux）。
