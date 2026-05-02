# @lhx-kit/runtime

> 🧩 浏览器侧运行时工具集。**subpath 导出**——按需 import，tree-shake 完美。
> 零框架耦合，React / Vue / 原生都能用。

[![npm](https://img.shields.io/npm/v/@lhx-kit/runtime?color=0c9)](https://www.npmjs.com/package/@lhx-kit/runtime)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[English](./README.md)

---

## 安装

```bash
pnpm add @lhx-kit/runtime
```

> 需要 Node.js `>= 18.18.0`（构建工具链依赖；运行时本身只跑浏览器）。

## 为什么 subpath 导出

```ts
// ✅ 推荐 — tree-shake 完美
import {setupMobile} from '@lhx-kit/runtime/mobile';
import {createRequest} from '@lhx-kit/runtime/request';

// ❌ 生产不推荐 — 会把所有子模块都拉进来
import {setupRuntime} from '@lhx-kit/runtime';
```

每个子模块都编译成独立 ESM 文件 + 独立 `.d.ts`。`import '/mobile'` **不会**连带 `axios` 或 `msw`。

---

## 子模块

| Import 路径 | 用途 | 关键 API |
| --- | --- | --- |
| `/request` | 基于 axios 的 HTTP 客户端 | `createRequest`、拦截器栈、重试、去重 |
| `/env` | 浏览器 / 设备检测 | `detectEnv`、WebView + 微信识别 |
| `/mobile` | H5 rem 适配 | `setupMobile`——lib-flexible + 桌面护栏 |
| `/logger` | Sink-based logger | `createLogger`、`consoleSink` |
| `/bridge` | WebView JSBridge | `createBridge`（wkwebview / dsbridge / noop） |
| `/auth` | 可插拔登录 | `createAuth`，与 `/request` 协作 |
| `/mock` | MSW 封装 | `setupMock`——dev/test SW + node interceptor |
| `/experiment` | 灰度开关 | `createExperiment` + localStorage TTL 缓存 |
| `/theme` | CSS 变量主题 | `applyTheme` |
| `/cdn-loader` | 给 `@lhx-kit/vite-plugin` 用 | IIFE 生成器（进阶） |

---

## 亮点

### 📱 移动端适配（lib-flexible 现代重写）

```ts
import {setupMobile} from '@lhx-kit/runtime/mobile';

setupMobile({
  enableRem: true,
  maxWidth: 750,        // 桌面居中 + rem 计算上限
  safeArea: true,       // 自动注入 --lhx-safe-* CSS 变量
  detectHairlines: true // 0.5px 边框支持检测
});
```

CSS 里**只写 px**，由 `postcss-pxtorem` 统一转换。桌面浏览器打开时整页渲染成居中的"手机壳"（百度网盘 / B 站 H5 的方案）。

详见 [移动端适配专题](https://juwenzhang.github.io/lhx-kit/guide/mobile-adaptation)。

### 🌐 工业级 HTTP 客户端

```ts
import {createRequest} from '@lhx-kit/runtime/request';

const api = createRequest({
  baseURL: '/api',
  timeout: 15_000,
  commonParams: {traceId: () => crypto.randomUUID()},
  dedupe: true,                         // 相同 in-flight 请求共享 promise
  retry: {
    count: 2,
    delay: 500,
    shouldRetry: (e) => isNetworkError(e)
  }
});
```

- 三段式拦截器链（`request / response / error`）
- 去重 key = `method|url|JSON(params)|JSON(data)`
- 默认只对**网络错误**重试，4xx 不重试

### 🎯 浏览器 / 设备检测

```ts
import {detectEnv} from '@lhx-kit/runtime/env';

const env = detectEnv();
// {
//   browser:  {name: 'Chrome', version: '128.0.0'},
//   os:       {name: 'iOS', version: '17.0'},
//   device:   {type: 'mobile', vendor: 'Apple'},
//   isWebView: true,
//   isWeChat:  false,
//   dpr:       3,
//   locale:    'zh-CN'
// }
```

---

## 依赖

| 依赖 | 用途 |
| --- | --- |
| `axios` ^1.7.9 | `/request` 底层（行业标准） |
| `ua-parser-js` ^1.0.39 | `/env` UA 解析 |
| `msw` >=2（可选 peer） | `/mock` service worker |

**仅 2 个硬依赖**，其他都是 peer 或可选。

---

## 设计

### 零框架耦合

所有子模块是纯 TS，可用于：

- React / Vue / Solid / Svelte 项目
- Node.js SSR（DOM 访问都有 no-op 分支）
- Web Worker（适用时）

### SSR 安全

```ts
// 每个触碰 DOM 的子模块开头都有：
if (typeof document === 'undefined') return () => {};
```

服务端 import `@lhx-kit/runtime/mobile` 是**静默 no-op**，不会崩。

---

## 文档

- 📖 [Runtime 概览](https://juwenzhang.github.io/lhx-kit/runtime/overview)
- 📱 [移动端适配](https://juwenzhang.github.io/lhx-kit/guide/mobile-adaptation)
- 🌐 [CDN loader 实现](https://juwenzhang.github.io/lhx-kit/guide/cdn)

## License

[MIT](./LICENSE) © luhanxin
