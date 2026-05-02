# @lhx-kit/runtime

> 🧩 Browser-side runtime toolkit. Subpath exports — import only what you use.
> Zero framework assumption. Works with React, Vue, or vanilla.

[![npm](https://img.shields.io/npm/v/@lhx-kit/runtime?color=0c9)](https://www.npmjs.com/package/@lhx-kit/runtime)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[中文文档](./README.zh-CN.md)

---

## Install

```bash
pnpm add @lhx-kit/runtime
```

> Requires Node.js `>= 18.18.0` (for the build tooling; runtime itself is browser-only).

## Why subpath exports

```ts
// ✅ Recommended — tree-shakes perfectly
import {setupMobile} from '@lhx-kit/runtime/mobile';
import {createRequest} from '@lhx-kit/runtime/request';

// ❌ Discouraged in production — pulls every submodule
import {setupRuntime} from '@lhx-kit/runtime';
```

Each submodule is compiled to an independent ESM file with its own `.d.ts`. Importing `/mobile` never brings `axios` or `msw` along.

---

## Submodules

| Import | Purpose | Key APIs |
| --- | --- | --- |
| `/request` | HTTP client on axios | `createRequest`, interceptor stack, retry, dedupe |
| `/env` | Browser / device detection | `detectEnv`, WebView + WeChat heuristics |
| `/mobile` | H5 rem adaptation | `setupMobile` — lib-flexible + desktop guard |
| `/logger` | Sink-based logger | `createLogger`, `consoleSink` |
| `/bridge` | WebView JSBridge | `createBridge` with `wkwebview / dsbridge / noop` |
| `/auth` | Pluggable auth adapter | `createAuth`, integrates with `/request` |
| `/mock` | MSW wrapper | `setupMock` — dev/test SW + node interceptor |
| `/experiment` | Feature flag controller | `createExperiment` with localStorage TTL cache |
| `/theme` | CSS variable theme switch | `applyTheme` |
| `/cdn-loader` | For `@lhx-kit/vite-plugin` | IIFE generator (advanced) |

---

## Highlights

### 📱 Mobile adaptation (lib-flexible reborn)

```ts
import {setupMobile} from '@lhx-kit/runtime/mobile';

setupMobile({
  enableRem: true,
  maxWidth: 750,        // Desktop centering + rem cap
  safeArea: true,       // Auto --lhx-safe-* CSS vars
  detectHairlines: true // 0.5px border detection
});
```

Write plain `px` in your CSS, let `postcss-pxtorem` handle the rest. On desktop browsers, the whole page renders as a centered phone mock (Baidu/Bilibili style).

See [Mobile Adaptation deep-dive](https://juwenzhang.github.io/lhx-kit/guide/mobile-adaptation).

### 🌐 HTTP client with industrial-grade features

```ts
import {createRequest} from '@lhx-kit/runtime/request';

const api = createRequest({
  baseURL: '/api',
  timeout: 15_000,
  commonParams: {traceId: () => crypto.randomUUID()},
  dedupe: true,                        // Same request inflight → share promise
  retry: {
    count: 2,
    delay: 500,
    shouldRetry: (e) => isNetworkError(e)
  }
});
```

- 3-stage interceptor chains (`request / response / error`)
- Dedupe key = `method|url|JSON(params)|JSON(data)`
- Retry only on network errors by default (not 4xx)

### 🎯 Browser / device detection

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

## Dependencies

| Dep | Why |
| --- | --- |
| `axios` ^1.7.9 | `/request` backend (industry standard) |
| `ua-parser-js` ^1.0.39 | `/env` UA parsing |
| `msw` >=2 (optional peer) | `/mock` service worker |

Only **2 hard runtime deps**. Everything else is peer/optional.

---

## Design

### Zero framework coupling

All submodules are vanilla TS. They work in:

- React / Vue / Solid / Svelte projects
- Node.js SSR (no-op branches guard `document` access)
- Web Workers (where applicable)

### SSR safety

```ts
// Every DOM-touching submodule starts with:
if (typeof document === 'undefined') return () => {};
```

Importing `@lhx-kit/runtime/mobile` on the server is a silent no-op, not a crash.

---

## Docs

- 📖 [Runtime overview](https://juwenzhang.github.io/lhx-kit/runtime/overview)
- 📱 [Mobile adaptation](https://juwenzhang.github.io/lhx-kit/guide/mobile-adaptation)
- 🌐 [CDN loader internals](https://juwenzhang.github.io/lhx-kit/guide/cdn)

## License

[MIT](./LICENSE) © luhanxin
