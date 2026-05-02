# 🌐 CDN 外挂方案

> 让 `import {createApp} from 'vue'` 在生产构建中变成 `const {createApp} = window.Vue`，bundle 里一行 Vue 代码都不打。
>
> 读完之后你应该能：
> - 🎯 理解为什么 `rollupOptions.external` 不够用
> - 🧪 知道 import 改写的 4 种语法变体
> - 🛡️ 掌握三层降级（多 CDN → 本地 fallback → 报错）
> - 🔧 用 `aliasGlobals` / `initScript` 做 Preact 替代 React

---

## 一、🎯 动机

### 1.1 为什么要做 CDN 外挂

```text title="React 19 + React Router 的首屏成本"
vendor-react          192 KB   gzip 60 KB
vendor-react-router    20 KB   gzip  7 KB
────────────────────────────────────────
合计                  212 KB   gzip 67 KB
```

即使用了 [⚡ 性能优化](./performance) 的全部手段，这 67KB 依然在**每个首屏的关键路径上**。

:::info 唯一能让它**完全不出现在首屏传输路径**的办法
- 浏览器**从 CDN 加载**同版本 React（`https://cdn.jsdelivr.net/npm/react@19/umd/react.production.min.js`）
- 浏览器**缓存命中率极高**（jsDelivr / unpkg 用户规模大）
- 多项目共享同一份缓存，跨项目受益
:::

### 1.2 为什么不直接用 Rollup external

```ts title="❌ 仅用 Rollup external 的结果"
build: {
  rollupOptions: {
    external: ['vue']
  }
}

// 构建产物里还是：
import {createApp} from 'vue'

// 浏览器运行时：
// ❌ Uncaught TypeError: Failed to resolve module specifier "vue"
```

:::danger Rollup external 只剥离模块图，不改写 import 语句
必须有一个**源码级改写层**把 `import 'vue'` 变成 `const {createApp} = window.Vue`。这是 lhx-kit 在 `@lhx-kit/vite-plugin` 里做的事。
:::

---

## 二、🧠 整体思路

在 `project.config.ts` 声明哪些包走 CDN：

```ts title="project.config.ts" showLineNumbers {4-22}
import {defineProjectConfig} from '@lhx-kit/config';

export default defineProjectConfig({
  cdn: {
    enabled: true,
    applyOn: ['build'],            // 仅 build 启用，dev 正常打包方便调试
    fallback: 'local',             // CDN 全挂时降级到本地 vendor chunk
    globalNamespace: 'LhxCdn',     // window.LhxCdn API 挂载点

    entries: [
      {
        name: 'vue',
        globalVar: 'Vue',
        urls: [
          'https://cdn.jsdelivr.net/npm/vue@3.5.13/dist/vue.global.prod.js',
          'https://unpkg.com/vue@3.5.13/dist/vue.global.prod.js'
        ]
      },
      {
        name: 'pinia',
        globalVar: 'Pinia',
        urls: ['https://cdn.jsdelivr.net/npm/pinia@2.2.6/dist/pinia.iife.min.js'],
        depends: ['vue']            // 声明依赖：Pinia 的 UMD 需要 window.Vue 先到
      }
    ]
  }
});
```

构建时发生的四件事：

```text
1. @lhx-kit/vite-plugin 把 'vue' / 'pinia' 设为 Rollup external
2. transform() 钩子把所有源码里 import ... from 'vue' → const = window.Vue
3. HTML 里注入运行时 CDN loader（从 @lhx-kit/runtime/cdn-loader 生成）
4. 为每个 entry emit 本地 vendor chunk（dist/shared/vendor/vue.js）
   → CDN 全挂时 loader 动态 import() 它
```

---

## 三、🔧 核心算法：import 改写

### 3.1 为什么需要改写

```text
Rollup `external` 行为: 仅"告诉 bundler 这个 id 不要打"
         ↓
ESM 语法要求: bare specifier 必须能解析
         ↓
结果: import {createApp} from 'vue' 出现在 bundle 里
         ↓
浏览器: ❌ Failed to resolve module specifier "vue"
```

**必须有源码级改写层把 import 翻译成 window 访问。**

### 3.2 改写的 4 种语法变体

:::code-group

```ts [default import]
// 原始
import vue from 'vue'

// 改写后
const vue = (window.Vue.default !== undefined ? window.Vue.default : window.Vue);
```

```ts [namespace import]
// 原始
import * as ns from 'vue'

// 改写后
const ns = window.Vue;
```

```ts [named imports]
// 原始
import {ref, computed as c} from 'vue'

// 改写后
const {ref, computed: c} = window.Vue;
```

```ts [side-effect import]
// 原始
import 'vue'

// 改写后
/* lhx-cdn: side-effect import "vue" replaced by global */
```

:::

### 3.3 为什么用正则而不是 AST

```ts title="packages/vite-plugin/src/plugin.ts::rewriteCdnImports"
const importRe = /import\s+([^'"]+?)\s+from\s+(['"])([^'"]+)\2\s*;?/g;
const sideRe   = /import\s+(['"])([^'"]+)\1\s*;?/g;
```

| 方面 | 正则 | AST (acorn/swc) |
| --- | --- | --- |
| 代码量 | 🟢 30 行 | 🔴 100+ 行 |
| Per-file 开销 | 🟢 < 1ms | 🟡 5–10ms |
| 包体积增加 | 🟢 0 | 🔴 +200KB (acorn) |
| 边界情况 | 🟡 靠 Vite 归一化兜底 | 🟢 完美 |

:::tip 做这个决策时的关键观察
**Vite 到达 `transform()` 钩子时，源码已经被归一化了**：

- TypeScript 已 strip
- JSX 已编译
- 只剩 ESM
- 导入语句统一格式

这时候正则的误匹配率**极低**。权衡下来，正则是更合适的选择。
:::

### 3.4 Early exit 优化

```ts title="packages/vite-plugin/src/plugin.ts" showLineNumbers {1-9}
transform(code, id) {
  // Early exit: 文件里压根不含任何 external 名字 → 跳过
  let hit = false;
  for (const name of Object.keys(externalsByName)) {
    if (code.includes(name)) { hit = true; break; }
  }
  if (!hit) return null;

  // 真正改写
  const rewritten = rewriteCdnImports(code, externalsByName);
  return rewritten === code ? null : {code: rewritten, map: null};
}
```

:::info 为什么这个优化重要
绝大多数模块不 import CDN external 包。`code.includes(name)` 是一个 C 实现的快速子串检查，把 per-file transform 调用量砍到 **5% 以下**。
:::

### 3.5 踩过的坑：node_modules 也要改写

```ts title="早期错误的实现"
transform(code, id) {
  if (id.includes('node_modules')) return null;  // ❌ 跳过 node_modules
  // ...
}
```

:::danger 会发生什么
`react-router-dom` 打进 bundle 时**内部**还是这样：

```js
// react-router-dom/dist/index.js
import {createContext} from 'react'
import {useEffect} from 'react'
```

Rollup `external` 只从**用户模块图**里剥离，**不会改写 third-party 包产物里的 import**。浏览器运行时立刻炸：

```text
❌ Uncaught TypeError: Failed to resolve module specifier "react"
```
:::

**修复**：去掉 node_modules 跳过，靠 early exit 控制性能。现在的 `transform()` 对每个文件都跑一次 `includes()` 快速检查。

---

## 四、🛡️ CDN 加载器运行时

### 4.1 状态机

每个 CDN entry 有 4 个状态：

```text
┌─────────┐
│ pending │
└────┬────┘
     │
     ├─ 某个 CDN URL 加载成功 ───→ ┌────┐
     │                              │ ok │
     │                              └────┘
     │
     ├─ 所有 CDN URL 都挂          ┌──────────┐
     │  但本地 vendor 成功  ───→ │ fallback │
     │                              └──────────┘
     │
     └─ 所有路径都挂       ───→ ┌────────┐
                                   │ failed │
                                   └────────┘
```

### 4.2 HTML 里注入的 loader

```html title="dist/home/index.html" {5-15,17-22}
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <!-- lhx-kit: CDN loader -->
    <script>
    ;(function(){
      var plan = {entries:[{name:'vue',globalVar:'Vue',urls:[...]}], fallback:'local'};
      var w = window;
      var state = {};
      // ... 完整状态机 + 事件系统 + whenReady / on
      w.LhxCdn = {plan, state, _ok, _failUrl, whenReady, on};
      for (var k=0; k<plan.entries.length; k++) {
        state[plan.entries[k].name] = 'pending';
      }
    })();
    </script>

    <script src="https://cdn.jsdelivr.net/npm/vue@3.5.13/dist/vue.global.prod.js"
            crossorigin="anonymous"
            data-lhx-cdn="vue"
            onload="LhxCdn._ok('vue')"
            onerror="LhxCdn._failUrl('vue', 0)"></script>
    <!-- /lhx-kit: CDN loader -->
    <script type="module" src="/home/assets/home-*.js"></script>
  </head>
</html>
```

关键点：

| 设计 | 原因 |
| --- | --- |
| Classic `<script>` 不用 module | UMD bundle 必须在 module entry 之前完成 |
| `async=false` | 保证多个 CDN script 顺序加载（pinia 依赖 vue） |
| `onload` / `onerror` | DOM 属性，ES5 兼容，老 IE 都能跑 |
| `data-lhx-cdn` | 调试时在 DevTools Elements 能识别哪些 script 是 kit 注入的 |

### 4.3 失败降级链

```text title="举例：vue 三级降级"
t=0ms   尝试 CDN URL 0 (jsDelivr)
         └─ onerror → _failUrl('vue', 0)
           ↓
t=100ms  尝试 CDN URL 1 (unpkg)
         └─ onerror → _failUrl('vue', 1)
           ↓
t=200ms  所有 CDN 挂了
         → loadLocalFallback(entry)
         → dynamic import('/shared/vendor/vue.js')
           ↓
t=250ms  本地 vendor 加载成功
         → state.vue = 'fallback'
         → emit('fallback', {name:'vue'})
```

:::info `fallback: 'error'` 模式
如果 `cdn.fallback === 'error'`，则跳过最后一步，直接 `state = 'failed'`。用户代码里的 `whenReady(['vue'])` 会 reject。

适合**对完整性有严格要求**的场景（比如监控系统要上报 CDN 挂了的事件）。
:::

### 4.4 为什么 loader inline 而不是外链

:::details 关键开销权衡

```text
外链 loader:
  multiple HTTP/2 streams
  loader 必须是 type="module" 或等 <script> 解析
  多一次 HTTP 请求 + 一次 RTT（50ms）

inline loader:
  HTML 多 ~2KB（压缩后 ~0.6KB gzip）
  省一次 RTT
```

明显应该 inline。代价：loader 代码必须**不依赖任何 bundler**，手写 ES5 IIFE。
:::

---

## 五、🎨 `aliasGlobals` / `initScript` / `localFallback`

这三个字段是 lhx-kit CDN 相比"裸 Rollup external"最有特色的能力。都是从 **Preact 替代 React 的踩坑**中提炼。

### 5.1 `aliasGlobals` 的由来

```text title="场景"
用户代码 (transform 后):
  const {lazy} = window.React
       ↑
       但我们实际引入的是 preact/compat:
  window.preactCompat = {lazy, Suspense, createContext, ...}
```

如果不做 alias，要么改所有源码（不可能），要么 loader 写一堆 special case。

**解法**：

```ts title="project.config.ts" {4}
{
  name: 'preact',
  globalVar: 'preactCompat',
  aliasGlobals: ['React', 'ReactDOM'],   // 👈 关键
  urls: ['https://.../preact-compat.umd.js']
}
```

Loader 在 entry 加载成功后执行：

```js title="loader 内部（renderCdnLoaderScript 生成）"
function applyAliases(entry) {
  if (entry.aliasGlobals) {
    var src = w[entry.globalVar];        // window.preactCompat
    for (var ai = 0; ai < entry.aliasGlobals.length; ai++) {
      w[entry.aliasGlobals[ai]] = src;    // window.React = src
                                          // window.ReactDOM = src
    }
  }
}
```

之后 `const {lazy} = window.React` → 🎯 成功。

### 5.2 `initScript` 的由来

Preact compat 的 UMD **没有 `createRoot`**（React 18/19 API）。需要 polyfill。

```ts title="project.config.ts" showLineNumbers {5-17}
{
  name: 'preact',
  globalVar: 'preactCompat',
  aliasGlobals: ['React', 'ReactDOM'],
  initScript: `
    var R = window.React;
    if (!R.createRoot) {
      R.createRoot = function(container){
        return {
          render: function(el){ R.render(el, container); },
          unmount: function(){
            R.unmountComponentAtNode && R.unmountComponentAtNode(container);
          }
        };
      };
    }
  `
}
```

:::info 执行时机
`initScript` 在 `aliasGlobals` 执行完之后被调用：

```js
(new Function(entry.initScript))()
```

`try-catch` 包裹保证 script 错误不会阻塞后续 entries。
:::

### 5.3 `localFallback` 的由来

默认情况下 lhx-kit 会从 `node_modules/<pkg>/dist/` 自动找 UMD 产物（见 `resolveLocalVendor`）。但：

- 🔴 有些包 UMD 放在奇怪路径（`dist/umd/production.min.js`）
- 🔴 有些包的 `package.json#exports` 封闭了子路径，`require.resolve` 找不到
- 🔴 有些场景想用完全自定义的兜底版本

```ts title="project.config.ts"
{
  name: 'vue',
  localFallback: 'node_modules/vue/dist/vue.global.prod.js'
}
```

**查找优先级**：

```text
1. entry.localFallback (用户显式指定)
   ↓ miss
2. require.resolve(<name>/package.json) → 扫候选路径:
   - dist/<name>.umd.production.min.js
   - dist/<name>.production.min.js
   - dist/<name>.umd.js
   - umd/<name>.production.min.js
   ↓ miss
3. 文件系统递归扫 node_modules/<name>/dist/**/*.umd.production.min.js
```

---

## 六、❌ 失败的尝试：React 19 CDN

### 6.1 React 19 不再发 UMD

:::danger 重大变化
React 18 还有 `umd/react.production.min.js`；React 19 **彻底删除**了 UMD 构建。

官方理由："生态已经进 ESM 时代"。

**现实后果**：
- CDN URL `https://cdn.jsdelivr.net/npm/react@19/umd/react.production.min.js` → **404**
- React 19 的 ESM 构建走 `<script type="module">`，但 classic `<script>` loader 模式不兼容
:::

### 6.2 尝试 Preact 替代

Preact 有完整 UMD，社区成熟度高。但踩了一串坑：

| 坑 | 现象 | 解法 |
| --- | --- | --- |
| 1 | `window.preactCompat` ≠ `window.React` | 新增 `aliasGlobals` |
| 2 | Preact compat 没 `createRoot` | 新增 `initScript` |
| 3 | `react-router-dom` 内部 import 没改写 | 去掉 `transform()` 里 node_modules 跳过 |
| 4 | `react-router-dom` 依赖 `@remix-run/router`（无 UMD） | router 不走 CDN，打进 bundle |
| 5 | `require.resolve('preact/hooks/dist/hooks.umd.js')` 失败 | 新增文件系统直查 fallback |

### 6.3 最终决定

:::warning 决策
经过五轮修复后，Preact 方案**能跑**，但对 React 生态的兼容性**不稳定**（`react-router-dom` 升级后可能再次踩坑）。

**最终策略**：
- ✅ `examples/rmpa` 关闭 CDN，React 19 全量打进 bundle
- ✅ CDN 能力**在 kit 里保留**（`aliasGlobals` / `initScript` / `localFallback` 三板斧都可用）
- ✅ `examples/vmpa` (Vue3) 用 CDN 外挂作为演示（Vue UMD 长期稳定）
- ✅ React 项目想用 CDN 走 Preact compat 路径，文档给完整 recipe
:::

这个决定看似"失败"，但本质是把"**CDN 方案能不能落地**"从**代码问题**变成了**"是否符合你项目的生态假设"**。未来 React 19 的 ESM CDN 成熟后可以直接接入。

---

## 七、📦 离线场景

### 7.1 问题

离线 WebView 容器里网络不可达，CDN URLs 全部 404。

```text title="不做特殊处理的结果"
t=0ms    loader 启动
t=100ms  <script src="https://..." onerror>
         ↓
         DNS 失败 + TCP SYN 超时 (2~5s)
         ↓
         onerror 触发 → _failUrl → 尝试下一个 URL
         ↓
         再等一次 2~5s
         ↓
         最终 loadLocalFallback
         ↓
t=10s+   终于加载完
```

### 7.2 解决：`stripCdnUrlsFromHtml`

```ts title="packages/offline/src/index.ts::stripCdnUrlsFromHtml"
// 1. 把 loader 块里的 "urls":[...] 替换成 "urls":[]
// 2. 删除所有 <script src="https://..."> 标签
```

```html title="离线包中的 HTML" {3}
<!-- lhx-kit: CDN loader -->
<script>
var plan = {entries:[{name:'vue',globalVar:'Vue',urls:[]}], fallback:'local'};
// ...
</script>
<!-- /lhx-kit: CDN loader -->
```

效果：

```text title="离线 WebView 里的行为"
t=0ms    loader 启动
         发现 urls 数组空
         ↓ 直接
t=0ms    loadLocalFallback(entry)
         dynamic import('/shared/vendor/vue.js')
         ↓
t=50ms   本地 vendor 加载成功
         state.vue = 'fallback'
```

**零网络请求**，首屏提速 10s+。

---

## 八、📋 配置 API 参考

### 8.1 `project.config.ts::cdn`

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `false` | 全局开关 |
| `applyOn` | `('dev'\|'build'\|'preview')[]` | `['build']` | 哪些命令启用 |
| `fallback` | `'local'\|'error'` | `'local'` | CDN 全挂时策略 |
| `timeoutMs` | `number` | `5000` | 保留字段，当前版本暂未启用 |
| `globalNamespace` | `string` | `'LhxCdn'` | `window.LhxCdn` 的挂载名 |
| `entries` | `CdnEntry[]` | `[]` | 待外挂的包列表 |

### 8.2 `CdnEntry`

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | `string` | ✅ | npm 包名，loader 状态表的 key |
| `globalVar` | `string` | | UMD 全局名；默认按 kebab→PascalCase 推导 |
| `urls` | `string[]` | ✅ | CDN URL 列表，按顺序尝试 |
| `depends` | `string[]` | | 此 entry 依赖的其他 entry 名 |
| `externals` | `string[]` | | 要映射到 `globalVar` 的 bare specifier；默认 `[name]` |
| `localFallback` | `string` | | 覆盖自动扫描的本地 UMD 路径 |
| `aliasGlobals` | `string[]` | | entry 加载后追加的 `window[x] = window[globalVar]` 别名 |
| `initScript` | `string` | | alias 后执行的 polyfill 片段 |

---

## 九、👤 用户侧运行时 API

CDN 激活后，`window[namespace]`（默认 `window.LhxCdn`）提供：

```ts title="API 类型"
interface LhxCdnApi {
  /** 等待一批 entry 就绪（ok 或 fallback 都算） */
  whenReady(names: string[]): Promise<void>;

  /** 订阅生命周期 */
  on(event: 'ok',       h: (e: {name: string; url: string}) => void): () => void;
  on(event: 'fallback', h: (e: {name: string; url: string}) => void): () => void;
  on(event: 'failed',   h: (e: {name: string; reason: string}) => void): () => void;
  on(event: 'ready',    h: (e: {names: string[]}) => void): () => void;

  /** 只读状态（调试用） */
  readonly state: Readonly<Record<string, 'pending'|'ok'|'fallback'|'failed'>>;
  readonly plan: CdnPlan;
}
```

**典型使用**：

```ts title="src/bootstrap.ts" showLineNumbers
import {createApp} from 'vue';

// 等 CDN 加载完成再启动
await window.LhxCdn.whenReady(['vue', 'pinia', 'vue-router']);

// 此后可以放心 import Vue APIs
createApp(App).use(router).use(pinia).mount('#app');
```

**监控埋点**：

```ts title="上报 CDN 降级事件"
window.LhxCdn.on('fallback', ({name, url}) => {
  analytics.track('cdn.fallback', {package: name, attempted: url});
});

window.LhxCdn.on('failed', ({name, reason}) => {
  analytics.track('cdn.failed', {package: name, reason});
});
```

---

## 十、🏗️ 架构设计回顾

```text
┌─────────────────────────────────────────────────┐
│                  构建阶段                         │
├─────────────────────────────────────────────────┤
│  project.config.ts (cdn.entries)                │
│           ↓                                     │
│  @lhx-kit/vite-plugin                           │
│  ├─ resolveCdnEntries()                         │
│  ├─ transform()  → 源码改写 bare imports         │
│  ├─ emitFile()   → shared/vendor/*.js          │
│  └─ generateBundle() → 注入 loader HTML          │
└─────────────────────────────────────────────────┘
                    ↓ dist/*
┌─────────────────────────────────────────────────┐
│                  运行时                           │
├─────────────────────────────────────────────────┤
│  浏览器加载 HTML                                  │
│  └─ 执行 inline loader (ES5 IIFE)               │
│     ├─ 注册 window.LhxCdn API                    │
│     ├─ 装 script 标签顺序加载 CDN UMD             │
│     ├─ onerror → 降级链                          │
│     ├─ 全挂 → loadLocalFallback (dynamic import) │
│     └─ applyAliases + initScript                │
│                                                 │
│  之后加载 entry module                            │
│  └─ const {createApp} = window.Vue              │
└─────────────────────────────────────────────────┘
```

---

## 十一、📚 相关资源

- [Rollup external 官方文档](https://rollupjs.org/configuration-options/#external)
- [Preact compat 使用指南](https://preactjs.com/guide/v10/getting-started/#aliasing-react-to-preact)
- [Web.dev - resource-hints](https://web.dev/learn/performance/resource-hints)
- [📦 离线打包专题](../offline/overview)
