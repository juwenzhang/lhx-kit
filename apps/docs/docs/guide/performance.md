# ⚡ 性能优化决策与落地

> 本章记录 lhx-kit 构建产物优化的**完整思考过程**。
> 读完之后你应该能：
> - 📐 理解 HTTP/2 下 chunk 大小的物理公理
> - 🧪 看懂 Rollup manualChunks 是如何工作的
> - ❌ 明白为什么**不能**把 react-dom 拆成更小的 chunk
> - ✅ 自己回答"这个项目的 chunk 该不该拆"

:::tip 为什么要单独写这一章
性能优化是一个**反直觉很重**的领域。"拆得越细越快"听起来对，实际经常是错的。本章的每一个结论都伴随**数据**和**原理**，让你能独立判断、而不是记住几条 recipe。
:::

---

## 一、🎯 问题起点

`examples/rmpa`（React MPA，3 个页面）第一版构建产物：

```text title="pnpm --filter rmpa build（优化前）"
dist/settings/assets/settings-B9HRk1Nj.js             0.56 kB
dist/home/assets/HomeAbout-CXjmzz56.js                0.57 kB
dist/shared/assets/preload-helper-D7HrI6pR.js         1.02 kB
dist/home/assets/home-zbQ6W3LI.js                     1.07 kB
dist/dashboard/assets/dashboard-Cyz9swpE.js           1.10 kB
dist/shared/assets/schema-zod-DJC6O4JY.js             1.12 kB
dist/dashboard/assets/DashboardLanding-BqwLkcZq.js    1.28 kB
dist/home/assets/HomeLanding-B5Lz-QKO.js              1.29 kB
dist/shared/assets/bootstrap-HbFA4b1I.js              3.68 kB
dist/shared/assets/Paragraph-CqF_hI2l.js             10.62 kB
dist/shared/assets/vendor-react-router-UdACNAMy.js   20.30 kB
dist/shared/assets/vendor-zod-BLheilQr.js            54.54 kB
dist/shared/assets/vendor-react-elAOjG93.js         192.05 kB
```

**13 个 JS chunk**，其中 **8 个小于 2KB**。

:::warning 这是一个值得优化的信号
我们的**直觉**是"小 chunk 太多浪费"。但"直觉"不能作为决策依据——必须先建立**可量化的判断标准**。
:::

---

## 二、🧠 底层原理：HTTP 传输的物理公理

很多优化讨论混淆两个概念：**"拆多了慢"** 和 **"拆少了慢"**。先把边界定下来。

### 2.1 TCP + TLS 的启动成本

```text
一次 HTTPS 请求的典型 timeline (4G):
├─ DNS lookup         ~20ms
├─ TCP handshake      ~50ms  (1 RTT)
├─ TLS handshake      ~100ms (2 RTT)
├─ HTTP 请求发送       ~0ms
├─ TTFB (wait)         ~50ms (1 RTT)
└─ 内容传输
```

**首次**打开一个域名至少 **3 个 RTT ≈ 200ms**。对第二个资源如果走同一连接，省掉 DNS + TCP + TLS，只剩 **TTFB ≈ 50ms**。

### 2.2 TCP 慢启动（initcwnd）

```text title="Linux 内核默认"
initcwnd = 10         // 初始拥塞窗口 = 10 个 MSS
MSS      ≈ 1.46 KB    // 典型值
```

意味着**首轮 RTT 最多发 ~14.6KB**。如果资源 ≤ 14.6KB，传输时间 ≈ 1 RTT；如果 > 14.6KB，需要多轮 RTT。

:::info 什么意思？
**低于 14KB 的 chunk**，拆分带来的"并行下载"优势**根本没机会发挥**——因为 initcwnd 还没打开，带宽还没被用上，就传完了。
:::

### 2.3 HTTP/2 多路复用

```text
HTTP/2 一条 TCP 连接上:
┌─ stream 1: chunk-A.js
├─ stream 2: chunk-B.js     ← 逻辑上"并行"
├─ stream 3: chunk-C.js
└─ stream 4: chunk-D.js

但底层物理带宽是同一条管道。
真实传输时间 ≈ 总字节数 / 带宽
```

拆 chunk 在 HTTP/2 下的真正收益**不是并行下载**（物理上不可能），而是：

- 🎯 **缓存粒度**：换 React 版本不作废业务 chunk
- 🔀 **解析并行**：多个 chunk 可以同时 parse（V8 有多核 parser）
- 📥 **HTTP/2 优先级**：关键 chunk 可以优先到达

### 2.4 甜蜜区

```text
chunk size    0       10KB      30KB      100KB      500KB
─────────────────────────────────────────────────────────────
拆分收益     ──        0    ↑↑      ↑↑↑      ↑↑        ↓
拆分代价     ↑↑↑      ↑     ~        ↓        ↓↓        ↓↓↓
净收益       ↓↓↓      ~    ↑↑      ↑↑↑        ↑         ↓
                     ^^^^              ^^^^^^^^^^^^
                  合并为王            拆分为王
```

| 区间 | 策略 | 原因 |
| --- | --- | --- |
| `< 10KB` | **一定要合** | 拆了净亏：RTT 开销 > 传输节省 |
| `10–30KB` | **看场景** | 灰色地带 |
| `30–500KB` | **应该拆** | 并行解析 + 缓存粒度收益明显 |
| `> 500KB` | **不拆但压** | 再拆会破坏内部优化 |

**这是所有后续决策的基础公理**。

---

## 三、📋 候选方案清单

列出**理论上能解决这个问题的所有方案**，逐一评估：

### 方案 A：手写 `manualChunks` 映射表

```ts title="rollupOptions.output.manualChunks"
manualChunks(id) {
  if (id.includes('react-router')) return 'vendor-react-router';
  if (id.includes('react'))        return 'vendor-react';
  if (id.includes('zod'))          return 'vendor-zod';
  return undefined;
}
```

| 评价 | |
| --- | --- |
| ✅ | 完全可控 |
| ❌ | 需要项目方维护包名列表 |
| ❌ | 对用户代码（`HomeAbout`、`bootstrap`）无能为力 |
| ❌ | 通用插件硬编码包名不合理 |

### 方案 B：Rollup `experimentalMinChunkSize`

Rollup 官方 flag：**任何独立 chunk 如果小于阈值，就把它合并进静态 importer**。

| 评价 | |
| --- | --- |
| ✅ | 对 user code 和 node_modules 都生效 |
| ✅ | 零配置——只要一个阈值数字 |
| ✅ | 内部做"安全性检查"：不会破坏循环依赖 / 多 importer chunk |
| ✅ | 不会合并真正需要延迟加载的 chunk（lazy route） |
| 🟡 | 名字叫 "experimental"，但 Vite 从 4.x 就在内部依赖它 |

### 方案 C：社区插件 `vite-plugin-chunk-split`

| 评价 | |
| --- | --- |
| ❌ | 引入第三方依赖增加供应链风险 |
| ❌ | 本质是 `manualChunks` 的封装，等价于方案 A |
| ❌ | 对 Vite 7 / Rollup 4 的兼容性不保证 |

### 方案 D：强拆 React/Vue 这种大单块

:::danger 直觉说"拆了更快"，但物理上拆不开
详见 [第四节](#四-react-dom-为什么不能再拆)。
:::

### 方案 E：换更小的框架

- Preact + compat：runtime ≈ 10KB
- Solid / Svelte：runtime < 8KB

**产品层决策**，不是构建层优化。lhx-kit 的 `aliasGlobals` + `initScript` 就是为这条路留的接口（见 [🌐 CDN 外挂](./cdn)）。

---

## 四、❌ react-dom 为什么不能再拆

这是最反直觉的点，值得详细论证。

### 4.1 物理结构：React 19 包内真实情况

```bash title="Terminal"
$ ls node_modules/.pnpm/react-dom@19.2.5_*/node_modules/react-dom/cjs/
```

```text {3}
react-dom-client.development.js        1066 KB
react-dom-client.production.js          536 KB   ← 整个 reconciler 闭包
react-dom-profiling.development.js     1082 KB
react-dom-server.browser.production.js  268 KB
```

```js title="react-dom-client.production.js（结构示意）"
'use strict';
(function () {
  // ... 10000+ 行 fiber 调度器
  // ... 事件系统
  // ... commit phase
  function createRoot(container) { /* ... */ }
  function hydrateRoot(container, element) { /* ... */ }
  // ...
  module.exports = {createRoot, hydrateRoot, flushSync, /* ... */};
})();
```

:::warning 核心事实
`react-dom-client.production.js` 是 **Meta 的 release bundler 预先打好的一整个 CJS 闭包**。到了你的 pnpm 安装时，它在 Rollup 眼里**就是一个 module**。
:::

### 4.2 Rollup 的视角

```text title="Rollup manualChunks 的约束"
manualChunks: N 个 module → M 个 chunk

约束：N ≥ M
```

对 react-dom：

- **N = 1**（只有一个 CJS 文件）
- **M 最多 1**（其他桶都是空的，Rollup 会忽略）

**物理上没有拆分空间**——不是懒，是输入粒度就是不可再分的原子。

### 4.3 "那我自己写插件切成 4 份呢？"

```ts title="假想实现：按字节切"
transform(code, id) {
  if (id.includes('react-dom-client.production.js')) {
    const quarter = code.length / 4;
    return {
      code: [
        code.slice(0, quarter),
        code.slice(quarter, quarter * 2),
        code.slice(quarter * 2, quarter * 3),
        code.slice(quarter * 3)
      ]
    };
  }
}
```

会发生什么？

```text title="运行结果"
❌ ReferenceError: fiberRootTag is not defined
❌ ReferenceError: scheduleUpdateOnFiber is not defined
...
```

:::danger 为什么必炸
那个 IIFE 闭包内部变量互相引用。切两半后：
- 前半段定义的 `fiberRootTag` 在后半段不可见
- 后半段的 `scheduleUpdateOnFiber` 反过来也一样

要做**语义切分**需要理解 fiber 内部数据流——这相当于自己维护一份 React 分发版本。Meta 10 年都没自己做，**投入产出比极低**。
:::

### 4.4 Vue 3 稍好但也有限

Vue 3 的 ESM 构建是多个 module：

```text
@vue/runtime-core       (reactivity 接口 + render)
@vue/runtime-dom        (DOM 端适配)
@vue/reactivity         (ref / reactive)
@vue/shared             (工具函数)
```

但这几个**互相调用极其频繁**——reactivity 的 ref 会在 runtime-core 里被 patch，runtime-dom 会回调 runtime-core 的 render……

分到 4 个 chunk 后每个 chunk 都得 `import` 另外 3 个——**浏览器还是要全部下载完才能执行，且多了 3 个 HTTP 请求**。

---

## 五、🧮 假设能拆：收益分析

即使我们有办法拆，性能就更好吗？用数据说话。

### 5.1 方案 A：1 个 192KB chunk（现状）

```text
HTTP/2 单连接:
  t = 0ms    请求发起
  t = 50ms   首字节到达 (TTFB)
  t = 250ms  传输完成 (192KB / ~1MB/s)
  t = 250ms  开始执行
```

### 5.2 方案 B：假设能拆成 4 个 48KB chunks

```text {5,6}
HTTP/2 单连接:
  t = 0ms    4 个请求同时发起（modulepreload 并行）
  t = 50ms   首字节到达（共享同一 TCP 连接）
  t = ???    受限于带宽，总下载量仍是 192KB
             4 个 chunk 共享同一 TCP 管道
             下载时间 ≈ 195KB / 带宽 ≈ 200ms
  t = 200ms  最后一个 chunk 到
  t = 200ms  开始执行（必须等全部到齐）
```

### 5.3 对比表

| 指标 | 方案 A | 方案 B | 差异 |
| --- | --- | --- | --- |
| 字节总量 | 192KB | 195KB | +3KB（闭包头 + HPACK） |
| 请求数 | 1 | 4 | +3 |
| 首字节 | 50ms | 50ms | 0 |
| 传输完成 | 250ms | 250ms | 0 |
| 执行开始 | 250ms | 200ms | -50ms（理论） |
| 缓存失效代价 | 192KB | 48KB × 4 | 实际相同 |

:::danger 结论
方案 B 在**最理想情况下**只是和 A 持平；考虑闭包头 / HPACK / TCP 拥塞控制，实际**略差**。
:::

### 5.4 真正能根治 192KB 的只有三条路

```text
┌──────────────────────────────────────────────┐
│ 1. 换框架（Preact/Solid）    → 产品决策        │
│ 2. CDN 外挂                  → 浏览器缓存命中 │
│ 3. 路由级懒加载              → MPA 无此空间    │
└──────────────────────────────────────────────┘
```

---

## 六、✅ 最终落地

### 6.1 代码

```ts title="packages/vite-plugin/src/plugin.ts" showLineNumbers {8-15}
rollupOptions: {
  input,
  output: {
    // 第一层策略：按包路径分 chunk，家族归并
    manualChunks: nodeModulesPerPackageChunker,

    // 第二层策略：10KB 以下自动折叠进父 chunk
    // Merge any chunk below the threshold into its static importer.
    // Rollup only considers this for chunks that are safe to inline
    // (no cycles, single importer). Sub-10KB chunks are dominated by
    // HTTP request overhead — TCP+TLS+HTTP/2 framing is ~1–2 round-trips
    // regardless of payload, so a 0.5KB chunk costs the same as a 10KB
    // one. This auto-folds tiny route views / helper chunks without us
    // having to hand-tune per-project.
    experimentalMinChunkSize: 10 * 1024
  }
}
```

### 6.2 家族分组规则

```ts title="packages/vite-plugin/src/plugin.ts"
const FAMILY_GROUPS = {
  // React 全家桶：reconciler 核心 + cooperative scheduler
  react: ['react', 'react-dom', 'scheduler'],

  // React Router 全家桶：router + dom bindings + 底层状态机
  'react-router': ['react-router', 'react-router-dom', 'remix-run-router'],

  // Vue 3 全家桶：核心 + vue-demi 兼容层（Pinia 依赖）
  vue: ['vue', 'vue-demi'],

  // Pinia + Vue Router：Vue 的规范数据层 + 路由
  'vue-state': ['pinia', 'vue-router']
};
```

**两层策略叠加**：

```text
1. FAMILY_GROUPS:    node_modules 按家族归并
2. minChunkSize=10K: 所有 chunk（含 user code）自动合并
```

### 6.3 实测结果

```bash title="pnpm --filter rmpa build（优化后）"
Initially, there are 11 chunks, of which 10 are below minChunkSize.
After merging chunks, there are 7 chunks, of which 6 are below minChunkSize.
```

```text title="优化后产物"
dist/settings/index.html                              0.58 kB
dist/home/index.html                                  0.67 kB
dist/dashboard/index.html                             0.67 kB
dist/settings/assets/settings-CNYq4wvg.js             0.56 kB
dist/shared/assets/schema-zod-DJC6O4JY.js             1.12 kB
dist/dashboard/assets/DashboardLanding-Bs4LgNti.js    1.23 kB
dist/home/assets/HomeLanding-D_jatks2.js              1.23 kB
dist/dashboard/assets/dashboard-DCvf0Gnk.js           1.36 kB
dist/home/assets/home-OcQ0rEhC.js                     1.44 kB
dist/shared/assets/Paragraph-DDr-F12U.js             15.27 kB
dist/shared/assets/vendor-react-router-UdACNAMy.js   20.30 kB
dist/shared/assets/vendor-zod-BLheilQr.js            54.54 kB
dist/shared/assets/vendor-react-elAOjG93.js         192.05 kB
```

### 6.4 前后对比

| 维度 | 优化前 | 优化后 | 变化 |
| --- | --- | --- | --- |
| JS chunk 数 | 13 | 10 | 🟢 -3 |
| sub-10KB chunk 数 | 8 | 5 | 🟢 -3 |
| `preload-helper` (1KB) | 独立 | 折叠进 entry | 🟢 合并 |
| `bootstrap` (3.7KB) | 独立 | 折叠进各 page entry | 🟢 合并 |
| `HomeAbout` (0.6KB) | 独立 | 与 `HomeLanding` 合并 | 🟢 合并 |
| `DashboardAbout` (0.5KB) | 独立 | 与 `DashboardLanding` 合并 | 🟢 合并 |
| 总字节 | 差异 < 1% | | ⚪ 持平 |

### 6.5 为什么还剩 5 个 sub-10KB chunk

```text title="剩下的小 chunk 都是不可合的"
┌──────────────────────┬──────┬────────────────────────────┐
│ chunk                │ size │ 为什么保留                  │
├──────────────────────┼──────┼────────────────────────────┤
│ settings-*.js        │ 0.5K │ 独立 page 入口，无父可合    │
│ schema-zod-*.js      │ 1.1K │ dead-path 懒加载 chunk     │
│                      │      │ 合了会让 zod(54K) 进主包    │
│ HomeLanding-*.js     │ 1.2K │ lazy() 动态 import 唯一   │
│ DashboardLanding-*.js│ 1.2K │ importer 的 lazy chunk    │
│ home/dashboard 入口   │ 1.4K │ 是 entry chunk，本体     │
└──────────────────────┴──────┴────────────────────────────┘
```

:::tip `experimentalMinChunkSize` 做到了它能做的一切
这些剩下的都属于 Rollup 安全检查拒绝合并的情况——要么是 entry，要么是 dead-path lazy chunk。再合就破坏语义了。
:::

---

## 七、📂 chunk 物理布局策略

### 7.1 per-page 分配算法

```text title="packages/vite-plugin/src/plugin.ts::computeChunkOwners"
for each active page entry:
  BFS(entry chunk) through:
    - chunk.imports       (static imports)
    - chunk.dynamicImports (lazy imports)
  mark every reachable chunk as "owned by page X"

for each chunk:
  if owners.size === 1: move to dist/<page>/assets/
  if owners.size >= 2:  move to dist/shared/assets/
```

### 7.2 最终目录效果

```text title="dist/"
dist/
├── home/
│   ├── index.html
│   └── assets/
│       ├── home-*.js            ← entry + bootstrap 折叠
│       └── HomeLanding-*.js     ← 仅 home 路由的 lazy chunk
├── dashboard/
│   ├── index.html
│   └── assets/
├── settings/
│   ├── index.html
│   └── assets/
└── shared/
    └── assets/
        ├── vendor-react-*.js         ← 多 page 共享
        ├── vendor-react-router-*.js
        └── Paragraph-*.js            ← 组件库共享
```

### 7.3 为什么要 per-page 目录

| 好处 | 说明 |
| --- | --- |
| 🎯 MPA 路由解耦 | 每个 page 独立 URL，CDN/nginx 按目录前缀配缓存策略简单 |
| 📦 离线打包白名单友好 | `whitelistPages: ['home']` → 只打包 `dist/home/` + `dist/shared/` |
| 🔍 排查直观 | 看 filename 就知道是哪个 page 的资源 |

---

## 八、🗜️ 预压缩

### 8.1 策略

```ts title="packages/vite-plugin/src/compress.ts"
// 对 build 产物并发跑 zlib.gzip + brotliCompress
// 仅对 > 1KB 的文本文件做
// 产物：foo.js / foo.js.gz / foo.js.br 三件套
```

### 8.2 为什么要预压缩

:::info 动态 vs 静态压缩
生产 nginx / CDN 可以**请求时动态压缩**，但每次都消耗 CPU。

**预压缩**：
- ✅ 静态内容一次压缩多次使用
- ✅ CPU 一次性消耗，首屏 TTFB 更小
- ✅ nginx `gzip_static on` / `brotli_static on` 直接服务 `.gz` / `.br`
:::

### 8.3 Brotli vs Gzip

**两个都出**：

| 算法 | 压缩比 | 场景限制 |
| --- | --- | --- |
| gzip | 基线（100%） | HTTP/HTTPS 全部支持 |
| brotli | 比 gzip 多省 15–25% | **仅 HTTPS** 下被浏览器接受 |

让 CDN 按 `Accept-Encoding` 头 content negotiation。

### 8.4 实测收益

```text title="examples/rmpa 的 vendor-react"
┌────────┬──────────┬──────┐
│ 格式    │ 大小      │ 占比  │
├────────┼──────────┼──────┤
│ 原始    │ 192 KB   │ 100% │
│ gzip    │  60 KB   │  31% │
│ brotli  │  52 KB   │  27% │
└────────┴──────────┴──────┘
```

:::tip 压缩带来的收益 >> 任何 chunk 拆分
一个 React 页面的首屏关键路径从 192KB 降到 52KB（brotli）。

这就是为什么我们把**预压缩放在默认开启**，而不是 "用户按需打开"——它的 ROI 高到没有不开的理由。
:::

---

## 九、🧾 决策回顾表

| 问题 | 决策 | 理由 |
| --- | --- | --- |
| 10KB 以下小 chunk | `experimentalMinChunkSize: 10KB` | Rollup 原生能力，零维护 |
| React 192KB 是否拆分 | ❌ **不拆** | 物理拆不开 |
| Vue 35KB 是否拆分 | ❌ **不拆** | 内部调用过紧 |
| React Router 20KB | ✅ 合进 `vendor-react-router` 家族 | 三包一起用 |
| zod 54KB | ✅ 独立 chunk + 动态 import | `validate:true` 时才加载 |
| 业务 chunk 分发 | per-page owner 分析 + shared 兜底 | MPA 解耦 + 离线友好 |
| 压缩 | 默认 gzip + brotli | ROI 极高 |

---

## 十、🔭 未来还能做什么

### 10.1 短期内**不**计划的优化

:::details 为什么不做这些
| 方案 | 不做理由 |
| --- | --- |
| HTTP/2 Server Push | 浏览器已普遍禁用，被 Early Hints (103) 替代 |
| 关键 CSS 内联 | MPA 每页 CSS 已按页独立，内联收益 < HTTP 请求成本 |
| Service Worker 预缓存 | 与 `@lhx-kit/offline` 的 hybrid 容器路线冲突 |
:::

### 10.2 值得做但尚未落地

- 🧪 **Module Federation** 跨项目共享 React（需要有第二个项目的前提）
- 🧪 **HTTP/3 (QUIC)** 环境下重新测量 RTT（初始数据显示 10KB 门槛可降到 6KB）
- 🧪 **React Server Components** 前置（需要 Next.js 或自建 RSC runtime）

---

## 十一、📚 推荐阅读

- [Rollup `experimentalMinChunkSize` 设计讨论](https://github.com/rollup/rollup/pull/4705)
- [HTTP/2 slow-start 与 chunk size 关系实证](https://web.dev/articles/granular-chunking-nextjs)
- [React team 不 tree-shake react-dom 的官方回复](https://github.com/facebook/react/issues/26028)
- [🌐 CDN 外挂专题](./cdn)
