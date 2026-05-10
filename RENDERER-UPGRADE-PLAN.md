# @lhx-kit/renderer 能力边界与升级计划

> 起源：在 rmpa（React）+ vmpa（Vue）各做了一个**双端 schema 逐字一致的「用户详情 + 编辑表单」demo**，把 JSON-based renderer 的能力边界用真实业务页踩出来。本文是该 demo 暴露出的卡点清单 + 升级 API 雏形 + 落地顺序。
>
> Demo 入口：
> - `examples/rmpa/src/pages/user-detail/`（React 19 + zustand + antd）
> - `examples/vmpa/src/pages/user-detail/`（Vue 3.5 + pinia + tdesign-mobile-vue）
> - 共享 schema：`render.json`（两份逐字一致——`diff` 为空）
> - 验证路径：`http://<host>/user-detail.html#/user/u-001` / `?role=admin` / `#/user/missing`

---

## TL;DR

| 顺序 | 项 | 改动量 | 收益 | 双端对称难度 |
|---|---|---|---|---|
| 1 | **Action middleware**（P1） | walker.ts 改 ~50 行 | 立刻解锁 AOP，埋点 / 审计 / 错误兜底全部声明式化 | 低 ✅ |
| 2 | **Route 根 + Lifecycle 钩子**（P2+P3） | expression.ts + react/vue.ts ~80 行 | 让「路由参数 → fetch → 渲染」成为纯 schema 可表达流 | 低 ✅ |
| 3 | **State 响应式 + events 参数透传**（P0） | react.tsx / vue.ts setup 重写 ~150 行；新增 store 适配器抽象 | 解锁所有表单 / 交互密集页 | **高 ⚠️** |
| 4 | **错误边界**（P4） | 各端 ~30 行 | 生产可靠性 | 低 ✅ |

**建议从 ① 开始**——它最小、最独立，并且完成后 demo 里的 `withTracking` HOF 可以直接删掉，立刻形成可见的"边界往里收"。

---

## 起源：为什么用 demo 而不是凭空设计

最初的提议是直接升级 renderer。否决理由：在没有真实业务页驱动的情况下设计 middleware/state API，**十有八九会偏**——抽象会脱离实际需求。

所以选择反向：**先在两个示例项目里做一个故意把 6 个缺口都踩到的页面**，让升级清单从真实摩擦里浮出来。Demo 完成后这个文档才得以撰写。

Demo 设计原则：
1. 一份 `render.json` 双端复用（验证 schema 跨框架可移植性）
2. 自定义组件抽象到 `Section` / `FormField` / `ActionButton` / `Banner` 级别（schema 才能逐字一致）
3. 故意走"宿主壳 + JSON-based renderer + 业务 store"三层结构，让每一个 renderer 不能做的事都映射成宿主壳里的一段冗余代码

---

## 缺口逐条

### 🔴 P0（合并）：State 快照 + 事件参数丢失

> 这两条本质上是同一个根因——renderer 没有"状态变化的双向通道"——只能合并治疗。

#### 卡点①：state 在 mount 时一次性快照，无后续同步通道

- **React**: `packages/renderer/src/react.tsx:55`
  ```ts
  const [state] = useState<Record<string, unknown>>({...(options.state ?? {})});
  ```
  没有 setter，`options.state` 后续变化不触发更新。

- **Vue**: `packages/renderer/src/vue.ts:70`
  ```ts
  const state = ref<Record<string, unknown>>({...(options.state ?? {})});
  ```
  同问题。`ref` 初始值后只对 `.value` 内部变化响应，对外部 options.state 变化不响应。

#### 卡点②：events 形参列表是空的，事件参数被吃掉

- **React**: `packages/renderer/src/react.tsx:155`
  ```ts
  props[`on${capitalize(eventName)}`] = () => dispatchAction(expr, options.actions ?? {}, ctx);
  ```
- **Vue**: `packages/renderer/src/vue.ts:170`（同形态）

输入框 `onChange(e)` 的 `e` 直接丢失。schema 里写 `payload: {value: {$: "$event.target.value"}}` 也没用——expression 没有 `$event` 这个 lookup root。

#### Demo 中的痛

- `examples/rmpa/src/pages/user-detail/views/UserDetailPage.tsx:64-99` 的 `useMemo([store.version, role, id])` 是这两个缺口共同导致的"workaround"：每次按键都要重建 Page 工厂、整个 React 子树重挂载、registry.resolve 重跑。1 秒打 5 个字 = 5 次完整 remount，输入框肉眼可见的卡顿/掉光标。
- vmpa 同上：`examples/vmpa/src/pages/user-detail/views/UserDetailPage.vue:68-92`
- FormField 因为无法走 schema events 双向绑定，被迫**绕过 renderer** 直接 import store：
  - `examples/rmpa/src/pages/user-detail/components/FormField.tsx:21` `useUserDetailStore(s => s.setField)`
  - `examples/vmpa/src/pages/user-detail/components/FormField.vue:18` `store.setField(...)`

#### 升级 API 雏形

```ts
createConfiguredPage({
  // 1. 用外部 reactive store 替代 useState 快照
  state: store,                                      // 接受 reactive 容器，不是快照
  stateAdapter: 'zustand' | 'pinia' | 'manual',      // 或者 {get, subscribe} 接口
  // 2. events 透传原始事件参数到表达式 lookup
  // schema 改成: {type: "setField", payload: {field: "name", value: {$: "$event.value"}}}
})
```

关键改动：
- `react.tsx:155` / `vue.ts:170` 的 handler wrapper 从 `() => dispatch(...)` 改为 `(...eventArgs) => dispatch(..., {...ctx, $event: eventArgs[0]})`
- `expression.ts:18` 的 lookupPath 加 `$event` 根
- `useState({...options.state})` 改成接受 store 适配器 → 订阅外部、render 时读最新值

#### 双端对称性

**对称难度高但路径相同**：
- React 端用 `useSyncExternalStore(store.subscribe, store.getSnapshot)` 替代 `useState(snapshot)`
- Vue 端 store 本身就是 reactive，直接 `state = computed(() => storeAdapter.snapshot())`
- 两边的 schema 不变，只是底层订阅机制各自适配

---

### 🟠 P1：Action middleware 缺失（AOP 入口）

#### 卡点

`packages/renderer/src/walker.ts:84-89`，dispatch 是裸调用：
```ts
const handler = actions[step.type];
if (!handler) continue;
const payload = step.payload ? Object.fromEntries(...) : {};
handler(payload as Record<string, unknown>, ctx);
```
无前置/后置切片，无错误捕获，无 telemetry hook。

#### Demo 中的痛

rmpa `UserDetailPage.tsx:23-33`、vmpa `UserDetailPage.vue:23-33` 各自手写：
```ts
function withTracking<TArgs, TRet>(name: string, fn: (...args: TArgs) => TRet) {
  return (...args) => {
    console.log(`[track] action=${name}`, args[0] ?? null);
    return fn(...args);
  };
}
// 用法：
actions: {
  saveUser: withTracking('saveUser', async () => store.saveUser()),
  deleteUser: withTracking('deleteUser', async () => store.deleteUser())
}
```
想统一加埋点 / 错误兜底 / 性能埋点 / 审计 → 必须**每个项目自己造一遍 HOF**，且漏一个就漏一个；schema 里完全无声明能力。

#### 升级 API 雏形

```ts
createConfiguredPage({
  actions: {
    saveUser: () => store.saveUser(),
    deleteUser: () => store.deleteUser()
  },
  actionMiddlewares: [
    async (action, ctx, next) => {
      console.log('[track]', action.type, action.payload);
      const t0 = performance.now();
      try {
        return await next();
      } catch (e) {
        ctx.diag?.({code: 'action/error', level: 'error', message: String(e)});
        throw e;
      } finally {
        console.log(`[perf] ${action.type} took ${performance.now() - t0}ms`);
      }
    }
  ]
});
```

实现：`walker.ts:dispatchAction` 把直接 `handler(payload, ctx)` 改成 koa 风格的 `compose(middlewares)(handler)` 链。

#### 双端对称性

**完美对称**——middleware 链是框架无关纯函数，React/Vue 共用一份 walker 实现。**6 条里改动最小、收益最高，建议第一个做。**

---

### 🟡 P2：Route 根缺失

#### 卡点

`packages/renderer/src/expression.ts:18` 的 lookupPath 只识别 6 个根：`state, props, flags, env, item, data` —— **没有 `route`**。

schema 想写 `{$: "route.params.id"}` 表达不了，被迫绕道 `flags.userId`。

#### Demo 中的痛

- rmpa `UserDetailPage.tsx:36-37`：必须手动 `useParams<{id: string}>()` 然后塞进 `flags: {role, userId: id}`
- vmpa `UserDetailPage.vue:48-50`：同样 `route.params.id` → `flags.userId`

更糟的是：**路由变化不会自动驱动 page 重渲**——demo 通过 `useEffect` / `watch` 监听 `id` 变化主动 `fetchUser`，整个流转都在 host 里。

#### 升级 API 雏形

```ts
createConfiguredPage({
  // 选项 A：宿主显式注入
  route: {params: {id: 'u-001'}, query: {role: 'admin'}, path: '/user/u-001'},

  // 选项 B：路由适配器
  routerAdapter: 'react-router-v6' | 'vue-router-v4'
});

// schema 直接写：
{"$": "route.params.id"}
{"when": {"eq": [{"$": "route.query.role"}, "admin"]}}
```

`expression.ts:18` 加 `route` 根；React 端可选 `routerAdapter` 帮宿主从 `useParams()` 抽取并自动随路由变化触发重渲。

#### 双端对称性

**完美对称**。React/Vue 各自有 router hook，提供路由适配器即可。

---

### 🟡 P3：Lifecycle 缺口（数据获取）

#### 卡点

渲染器没有任何"挂载时 fetch"原语。schema 里无法声明"这个页面进来要先 GET /api/users/:id"。

`react.tsx:63 / vue.ts:139` 的 `useEffect/onMounted` 只做内部 schema/registry 加载，业务数据全靠宿主。

#### Demo 中的痛

- rmpa `UserDetailPage.tsx:51-55`：手写 `useEffect(() => store.fetchUser(id), [id])`
- vmpa `UserDetailPage.vue:55-60`：手写 `onMounted + watch(userId, fetch)`

每个页面每个数据源都要手写一遍，且无法做请求级 AOP（loading 标志、错误兜底、并发请求合并）。

#### 升级 API 雏形

```json
{
  "version": 1,
  "name": "user-detail",
  "hooks": {
    "onMount": [
      {"type": "fetchUser", "payload": {"id": {"$": "route.params.id"}}}
    ]
  },
  "components": [...]
}
```

复用 `actions` 的注册机制；`onMount` 在 walker 之前 dispatch。配合 P1 的 middleware，loading/error 变成"一个 middleware 装饰所有 fetch action"——可声明的 AOP。

#### 双端对称性

**完美对称**——onMount 触发点在 `react.tsx:63 / vue.ts:139` 的 useEffect/onMounted 各自调用 dispatchAction。

---

### 🟢 P4：错误边界缺失

#### 卡点

渲染器顶层无 try/catch、无 ErrorBoundary。组件 throw 直接炸整个 page。`react.tsx:131-137` 直接走 createElement，无兜底。

#### Demo 中的痛

本次 demo **没踩到这一条**——antd / tdesign 组件成熟，没炸。但生产里**自定义组件 throw → 整个 page 黑屏**，比 React/Vue 默认体验更差（因为渲染器隐藏了组件树边界，开发者很难定位是哪个 schema 节点导致的）。

#### 升级 API 雏形

```json
{
  "fallback": {"name": "ErrorFallback", "props": {"message": "页面加载失败"}},
  "components": [
    {
      "name": "RiskyChart",
      "errorFallback": {"name": "Empty"}
    }
  ]
}
```

#### 双端对称性

**对称简单**：React 用 `class ErrorBoundary extends Component`；Vue 用 `onErrorCaptured`。

---

## ✅ 已支持但需要复述：flags 权限门

`render.json:39` 的：
```json
{"when": {"eq": [{"$": "flags.role"}, "admin"]}}
```

实测有效——删除按钮严格按 URL `?role=admin` 出现/消失。**6 条里现有架构唯一无需升级就能 hold 的**。`expression.ts` 的 condition DSL（`eq / neq / gt / gte / lt / lte / and / or / not / exists` 共 10 个操作符）足够表达"基于权限/feature flag 的可见性"。

这一条不在升级清单里，只是作为现有能力的正向验证。

---

## 升级落地顺序

### 第一步：P1 Action middleware（独立、收益快）

**预计工作量**：1-2 PR，~50 行核心代码 + 测试

完成后：
1. demo 里的 `withTracking` HOF 删掉
2. 改用：
   ```ts
   actionMiddlewares: [trackingMiddleware, errorBoundaryMiddleware]
   ```
3. **可见的"边界往里收"**——业务代码减少，schema 表达力不变

### 第二步：P2 Route 根 + P3 Lifecycle 钩子（一并改）

**预计工作量**：2-3 PR，expression.ts + react/vue.ts mount 钩子 ~80 行

完成后：
1. demo 里 `useParams() / useRoute() + useEffect/onMounted/watch` 全部删掉
2. schema 加 `hooks.onMount` 声明 fetchUser
3. **"路由参数 → fetch → 渲染"成为纯 schema 可表达流**

### 第三步：P0 State + Events（大改，分阶段）

**预计工作量**：3-5 PR，react.tsx / vue.ts setup 重写 ~150 行 + 新增 store 适配器抽象

阶段拆分：
1. **3a. Events 透传**：先解决参数丢失（`expression.ts` 加 `$event` 根 + walker 改 dispatch wrapper）。这一步独立有用——不用先做完 reactive state 也能解锁 onChange 类回调。
2. **3b. Store 适配器接口**：定义 `interface StateAdapter { getSnapshot(): T; subscribe(cb): () => void }`，React 用 `useSyncExternalStore`，Vue 用 `computed`。
3. **3c. demo 改造**：rmpa/vmpa user-detail 改用新 API，删掉 `useMemo + version` 重建模式，验证输入流畅度。

### 第四步：P4 错误边界（生产可靠性）

**预计工作量**：1 PR，~30 行

并行可做。

---

## 双端对称性矩阵

| 缺口 | API 是否对称 | 实现差异 | 改动复杂度 |
|---|---|---|---|
| P1 Action middleware | ✅ 完全 | 无（walker 改一处） | 低 |
| P2 Route 根 | ✅ 完全 | router 适配器各端实现 | 低 |
| P3 Lifecycle | ✅ 完全 | useEffect / onMounted | 中 |
| P4 错误边界 | ✅ 接口对称 | ErrorBoundary / onErrorCaptured | 低 |
| P0 State 响应式 | ⚠️ schema 对称 | **实现差异大**——React 用 useSyncExternalStore，Vue 直接吃 reactive；store 适配器接口要兼顾两端 | **高** |
| P0 Events 参数 | ✅ 完全 | 无 | 低 |

---

## 验收标准

每个升级落地后，**回到 demo 验证"宿主代码减少"**：

| 升级项 | 应该删除的 demo 代码 |
|---|---|
| P1 完成 | rmpa/vmpa 的 `withTracking` HOF（共 ~30 行） |
| P2 完成 | rmpa 的 `useParams()` / vmpa 的 `useRoute()` 转 flags 逻辑（共 ~10 行） |
| P3 完成 | rmpa 的 `useEffect(fetchUser)` / vmpa 的 `onMounted+watch`（共 ~15 行） |
| P0 完成 | rmpa/vmpa 的 `useMemo([store.version])` 重建模式 + FormField 直连 store 的 hack（共 ~80 行） |
| P4 完成 | （本次 demo 未踩到） |

**全部完成的最终状态**：UserDetailPage 宿主壳应该只剩"挂载 renderer + ErrorBoundary"两件事，~30 行；schema 完整描述路由→数据→交互→反馈的完整流。

---

## 附录：demo 文件索引

### rmpa（React 端）
```
examples/rmpa/
├── src/pages/user-detail/
│   ├── entry.tsx                       入口挂载
│   ├── router.tsx                      /user/:id 路由
│   ├── views/UserDetailPage.tsx        宿主壳（含 withTracking、useMemo 重建）
│   ├── render.json                     ⚠️ 与 vmpa 逐字一致
│   └── components/
│       ├── FormField.tsx               直连 store 旁路双向绑定
│       ├── Section.tsx                 antd Card 包装
│       ├── Banner.tsx                  antd Alert 包装
│       └── ActionButton.tsx            antd Button 包装
├── src/stores/user-detail.ts           zustand + version fingerprint
├── src/mocks/handlers.ts               扩展 GET/PUT/DELETE /api/users/:id
└── project.config.ts:55                注册 user-detail 页
```

### vmpa（Vue 端）
```
examples/vmpa/
├── src/pages/user-detail/
│   ├── entry.ts                        入口挂载
│   ├── router.ts                       /user/:id 路由
│   ├── views/UserDetailPage.vue        宿主壳（含 withTracking、computed 重建）
│   ├── render.json                     ⚠️ 与 rmpa 逐字一致
│   └── components/
│       ├── FormField.vue               直连 pinia store 旁路双向绑定
│       ├── Section.vue                 自实现卡片（避免移动 UI 桌面表单冲突）
│       ├── Banner.vue                  自实现 alert
│       └── ActionButton.vue            tdesign-mobile-vue Button 包装
├── src/stores/user-detail.ts           pinia + version fingerprint
├── src/mocks/handlers.ts               扩展 GET/PUT/DELETE /api/users/:id
└── project.config.ts:50                注册 user-detail 页
```

### 本次 demo 还顺手修的事
- `examples/rmpa/public/mockServiceWorker.js`：rmpa 模板从未跑过 `msw init`，导致 MSW worker 注册 404。本次补上 + 把 `msw.workerDirectory` 写进 package.json 让后续升级 msw 时 postinstall 自动同步。

---

**文档维护**：每个升级 PR 落地后，在对应章节加一条 `✅ 已落地 (PR #N, YYYY-MM-DD)` 的脚注，并把 demo 里删掉的代码量更新到「验收标准」表里。
