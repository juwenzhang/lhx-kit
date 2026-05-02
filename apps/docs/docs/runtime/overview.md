# 🧩 `@lhx-kit/runtime`

> 浏览器侧运行时能力集合。**subpath export 设计**，按需 import 只打需要的东西。

---

## 一、🎯 设计原则

:::tip 四条硬约束
1. **零聚合**：主入口 `@lhx-kit/runtime` 只是 `setupRuntime()` 便利函数，生产代码**建议直接 import 子模块**
2. **零框架假设**：所有子模块都是 vanilla TS，**不依赖** React / Vue
3. **可降级**：SSR / Node 环境下 `typeof document === 'undefined'` 分支都有 no-op 实现
4. **长期依赖少**：整个包**只有两个生产依赖**（`axios` + `ua-parser-js`）
:::

---

## 二、📦 依赖清单

| 依赖 | 版本 | 用途 |
| --- | --- | --- |
| `axios` | `^1.7.9` | `request` 子模块的底层 HTTP 客户端；拦截器栈 + 错误分类建立在 axios 上 |
| `ua-parser-js` | `^1.0.39` | `env` 子模块解析 UA → `{browser, os, device, engine}` |
| `msw` | `>=2`（peer 可选） | `mock` 子模块的 Service Worker + Node Interceptor 运行时 |

---

## 三、📚 子模块列表

一共 **10 个子模块**，全部通过 `@lhx-kit/runtime/<name>` subpath 暴露。

### 3.1 `@lhx-kit/runtime/request` — HTTP 客户端

Axios 实例工厂，提供工业级能力：

```ts title="基本用法"
import {createRequest} from '@lhx-kit/runtime/request';

const api = createRequest({
  baseURL: '/api',
  timeout: 15_000,
  commonParams: {traceId: () => crypto.randomUUID()},
  dedupe: true,
  retry: {
    count: 2,
    delay: 500,
    shouldRetry: (e) => isNetworkError(e)
  }
});
```

| 能力 | 说明 |
| --- | --- |
| 🏷️ 公共参数 / 头注入 | `commonParams` 自动合并到 `config.params`；`commonHeaders` 合并到 headers |
| 🔗 拦截器栈 | 三个数组：`requestInterceptors` / `responseInterceptors` / `errorInterceptors` |
| 🔁 去重（dedupe） | 按 `method + url + params + data` 作为 key 缓存 in-flight 请求 |
| 🔄 重试（retry） | 次数 + 延迟 + `shouldRetry` 谓词；默认只对网络错误重试，4xx 不重试 |

:::details 🧮 去重算法
```ts title="去重 key 生成"
function requestKey(config) {
  return [
    config.method || 'get',
    config.url || '',
    JSON.stringify(config.params || {}),
    JSON.stringify(config.data || {})
  ].join('|');
}
```

**JSON 序列化对 key 顺序敏感是故意的**：`{a:1,b:2}` 和 `{b:2,a:1}` 视为不同请求。

避免错误去重的典型场景：业务代码里 `a={id:1}; b={id:1, extra:'…'}` 明显是两个不同请求。
:::

### 3.2 `@lhx-kit/runtime/env` — 环境检测

```ts title="用法"
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

:::details 🧮 WebView 识别算法
```ts
function isWebView(ua: string): boolean {
  // Android: UA 含 'wv' / 'WebView'
  if (/wv|WebView/i.test(ua)) return true;

  // iOS: UA 不含 Safari 标识（原生 Safari 必含）
  if (/iPhone|iPad/.test(ua) && !/Safari/.test(ua)) return true;

  return false;
}

// 微信优先看官方注入的 __wxjs_environment
function isWeChat(): boolean {
  if ((window as any).__wxjs_environment === 'miniprogram') return true;
  return /MicroMessenger/i.test(navigator.userAgent);
}
```
:::

### 3.3 `@lhx-kit/runtime/mobile` — 移动端适配

**整个 kit 的一大亮点**。完整决策背景见 [📱 移动端适配](../guide/mobile-adaptation)。

```ts
import {setupMobile} from '@lhx-kit/runtime/mobile';

setupMobile({
  enableRem: true,
  maxWidth: 750,
  safeArea: true,
  ensureViewport: true,
  detectHairlines: true
});
```

### 3.4 `@lhx-kit/runtime/logger` — Sink-based Logger

不与具体上报平台耦合：

```ts title="用法"
import {createLogger, consoleSink} from '@lhx-kit/runtime/logger';

const log = createLogger({
  level: 'info',
  sinks: [
    consoleSink(),
    {
      write: (rec) => fetch('/api/log', {
        method: 'POST',
        body: JSON.stringify(rec)
      })
    }
  ]
});

log.info('user.click', {btn: 'submit'});
```

| 特性 | 说明 |
| --- | --- |
| 日志级别 | `trace < debug < info < warn < error` |
| sink 并行 | sink 之间并行执行，异常独立 catch（一个挂不影响其他） |
| 结构化字段 | 支持 key-value 对象，不是字符串拼接 |

### 3.5 `@lhx-kit/runtime/bridge` — WebView JSBridge

```ts
import {createBridge} from '@lhx-kit/runtime/bridge';

const bridge = createBridge({
  adapter: 'wkwebview'  // 或 'dsbridge' / 'noop'
});

const {name} = await bridge.call('getUserInfo');
bridge.on('nativeEvent', handler);
```

:::info Noop adapter
保证在桌面浏览器 / SSR 下代码照样能跑，返回 reject 或 undefined。
:::

### 3.6 `@lhx-kit/runtime/auth` — 可插拔登录

**不绑定**任何具体登录方案：

```ts
import {createAuth} from '@lhx-kit/runtime/auth';

const auth = createAuth({
  getToken: () => localStorage.getItem('token'),
  refresh: async () => fetch('/api/refresh').then(r => r.json()),
  onInvalid: () => location.href = '/login'
});
```

与 `request` 配合：

```ts
const api = createRequest({
  requestInterceptors: [
    async (config) => {
      const token = await auth.getToken();
      if (token) config.headers.Authorization = `Bearer ${token}`;
      return config;
    }
  ],
  errorInterceptors: [
    async (err) => {
      if (err.response?.status === 401) {
        await auth.refresh();
        return api(err.config);   // 重试
      }
      throw err;
    }
  ]
});
```

### 3.7 `@lhx-kit/runtime/mock` — MSW 封装

```ts
import {setupMock} from '@lhx-kit/runtime/mock';

await setupMock({
  handlers: [
    rest.get('/api/user', (req, res, ctx) =>
      res(ctx.json({name: 'mock'}))
    )
  ],
  onUnhandledRequest: 'bypass'
});
```

:::tip 三环境分别处理
- **dev 环境**：启动 Service Worker，拦截 fetch / XHR
- **test 环境**：启动 Node Interceptor（同 API）
- **prod 环境**：通过 `import.meta.env.DEV` 条件判断，完全 tree-shake 掉
:::

### 3.8 `@lhx-kit/runtime/experiment` — Feature Flag

```ts
import {createExperiment} from '@lhx-kit/runtime/experiment';

const exp = createExperiment({
  defaults: {newCheckout: false},
  fetcher: () => fetch('/api/flags').then(r => r.json()),
  ttl: 300_000   // 5 min cache
});

if (exp.isOn('newCheckout')) {
  // 新版本
} else {
  // 旧版本
}
```

内部用 `localStorage` 做 ttl 缓存，失败时兜底到 defaults。

### 3.9 `@lhx-kit/runtime/theme` — CSS 变量主题

```ts
import {applyTheme} from '@lhx-kit/runtime/theme';

applyTheme({
  '--color-primary': '#1677ff',
  '--color-bg': '#ffffff',
  '--color-text': '#333333'
});
```

写到 `document.documentElement.style`，所有用 `var(--color-primary)` 的 CSS 立即生效。

### 3.10 `@lhx-kit/runtime/cdn-loader` — 给插件用

给 `@lhx-kit/vite-plugin` 使用的 CDN 加载器源码生成器。**用户代码一般不直接用**。

详见 [🌐 CDN 外挂](../guide/cdn)。

---

## 四、🎁 `setupRuntime` 聚合入口

```ts title="推荐仅 demo 使用"
import {setupRuntime} from '@lhx-kit/runtime';

const runtime = setupRuntime({
  request: {baseURL: '/api'},
  mobile:  {maxWidth: 750},
  mock:    {handlers: [...]}
});
// runtime = {request, env, logger, mobile, experiment, theme, dispose}
```

:::warning 业务代码建议直接 import 子模块
```ts
// ❌ 一次性全拉
import {setupRuntime} from '@lhx-kit/runtime';

// ✅ 按需
import {setupMobile} from '@lhx-kit/runtime/mobile';
import {createRequest} from '@lhx-kit/runtime/request';
```

tree-shake 粒度更好。
:::

---

## 五、🧬 为什么分成这么多子模块

早期版本是单入口 `@lhx-kit/runtime`，全部能力一次性 import。三个问题：

:::danger 单入口的问题
1. 🔴 `axios` / `ua-parser-js` 这类大依赖即使不用 `request` / `env` 也被打进 bundle
2. 🔴 `mock` 模块内部 `await import('msw')`，Vite 的 pre-bundle 会预解析 msw → 即使生产不用也走一遍依赖
3. 🔴 单文件模块升级一个能力要全员升级
:::

拆成 subpath export 后：

- `import '@lhx-kit/runtime/mobile'` → 最终 bundle 里只有 120 行 mobile 代码
- `import '@lhx-kit/runtime/request'` → 打包时才把 axios 拉进来

---

## 六、🔧 tsup 构建配置

```ts title="packages/runtime/tsup.config.ts"
import {defineConfig} from 'tsup';

export default defineConfig({
  entry: ['src/*.ts'],         // 每个文件独立编译
  format: ['esm'],
  dts: true,                    // emit .d.ts
  sourcemap: true,
  clean: true,
  splitting: false              // 关掉 splitting 保证输出文件 1:1
});
```

每个 `src/*.ts` 都编译成独立 dist 文件并 emit dts，保证：

- ✅ `package.json#exports` 字段和文件完全对应
- ✅ 每个子模块是独立 ESM 文件，没有跨文件 import 污染
- ✅ TypeScript 消费者能准确跳转定义

---

## 七、📦 `package.json` exports

```json title="packages/runtime/package.json"
{
  "exports": {
    ".":              {"types": "./dist/index.d.ts",        "default": "./dist/index.js"},
    "./request":      {"types": "./dist/request.d.ts",      "default": "./dist/request.js"},
    "./env":          {"types": "./dist/env.d.ts",          "default": "./dist/env.js"},
    "./mobile":       {"types": "./dist/mobile.d.ts",       "default": "./dist/mobile.js"},
    "./logger":       {"types": "./dist/logger.d.ts",       "default": "./dist/logger.js"},
    "./bridge":       {"types": "./dist/bridge.d.ts",       "default": "./dist/bridge.js"},
    "./auth":         {"types": "./dist/auth.d.ts",         "default": "./dist/auth.js"},
    "./mock":         {"types": "./dist/mock.d.ts",         "default": "./dist/mock.js"},
    "./experiment":   {"types": "./dist/experiment.d.ts",   "default": "./dist/experiment.js"},
    "./theme":        {"types": "./dist/theme.d.ts",        "default": "./dist/theme.js"},
    "./cdn-loader":   {"types": "./dist/cdn-loader.d.ts",   "default": "./dist/cdn-loader.js"}
  }
}
```

---

## 八、📖 下一步

- [Vite 插件实现详解](./vite-plugin) — 运行时子模块如何被构建工具链调用
- [📱 移动端适配](../guide/mobile-adaptation) — `mobile` 子模块的深度专题
- [🌐 CDN 外挂](../guide/cdn) — `cdn-loader` 子模块的深度专题
