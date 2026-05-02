# 🎨 `@lhx-kit/renderer`

> 配置驱动 UI 渲染器。支持 Vue3 和 React 双绑定。
>
> 给它一个 JSON schema，它吐出一个可渲染的组件。

:::tip 核心定位
把**"一个页面的 layout + visibility + data binding"** 固化成声明式结构——改文案 / 开关 / 布局不用改代码、不用发版。
:::

---

## 一、🎯 为什么需要这个

### 1.1 痛点

电商 / 内容 / 运营类产品的真实生存状态：

- 📅 产品经理每周改 3 次首页楼层顺序
- 🧪 A/B 实验要同时跑"有优惠券"和"无优惠券"两版
- 🎊 春节 / 618 / 双 11 需要整体换一套布局（但不能重新发版）
- 🛡️ 金融 / 合规要求某些模块按地区 / 风控等级显示不同内容

**传统做法**：每次改动 → 改代码 → PR → CI → 发版。整个链路几小时到几天。

### 1.2 lhx-kit 的思路

:::info 核心洞察
把**结构性变化**（组件有哪些、按什么顺序、在什么条件下可见、传什么 props）从代码里抽出来，变成 **JSON**。

运行时由渲染器解读 JSON，组件库里查对应 component 实现。
:::

```text title="代码 vs 配置的分工"
代码里只写:
  ├─ 静态组件实现 (<Banner>, <ProductList>)
  └─ 少量业务 action (goToCart, trackEvent)

JSON 里决定:
  ├─ 页面有哪些组件
  ├─ 组件间的嵌套关系、插槽
  ├─ 哪些 props 从 state / 服务端 / 实验里来
  ├─ 条件可见、for 循环展开
  └─ 事件触发哪个 action
```

---

## 二、🧪 设计权衡

### 2.1 为什么不用 JSX-in-JSON

```json title="❌ 朴素思路：直接 JSON 描述 DOM"
{
  "type": "div",
  "className": "container",
  "children": [
    {"type": "span", "children": "Hello"}
  ]
}
```

| 问题 | 说明 |
| --- | --- |
| 🌐 每个平台要写自己的渲染器 | Web / 小程序 / Native 各自实现 |
| 🧩 无法引用业务组件 | `<Banner>` 需要用户先注册组件类，渲染器必须知道注册表 |
| 🎨 和设计稿距离远 | 设计师："这里是个 Banner"；开发："这里是个 div 嵌套 span" |

### 2.2 为什么不用模板引擎（Handlebars / Mustache）

```handlebars title="❌ 模板引擎路径"
{{#if showBanner}}
  <img src="{{bannerUrl}}" />
{{/if}}
{{#each products}}
  <div>{{this.name}}</div>
{{/each}}
```

| 问题 | 说明 |
| --- | --- |
| 🔄 全量 re-render | 状态变化 → 重算字符串 → innerHTML 重写 |
| 📈 性能差 | 每次都要全量 patch |
| 🎯 事件绑定困难 | 字符串里没有 React/Vue 的事件系统 |
| 🧩 不易组件化 | 嵌套插槽 / 作用域插槽实现复杂 |

### 2.3 最终选择：组件树 + 表达式

```json title="✅ lhx-kit 的 schema 结构"
{
  "components": [
    {
      "name": "Banner",
      "props": {"image": {"$": "state.bannerUrl"}},
      "when": {"exists": {"$": "flags.showBanner"}}
    },
    {
      "name": "ProductList",
      "for": {"in": {"$": "state.products"}, "as": "item"},
      "props": {"data": {"$": "item"}},
      "events": {
        "click": {"type": "goToDetail", "payload": {"id": {"$": "item.id"}}}
      }
    }
  ]
}
```

:::info 三个关键设计
1. **组件名**（`"name": "Banner"`）指向用户预先注册的组件实现——渲染器不关心具体框架
2. **表达式用 `{"$": "path.to.value"}` 声明**——不用 eval，不依赖 Function 构造器，**CSP 友好**
3. **props / when / for / events 是同一套表达式系统**——学一次会所有
:::

---

## 三、🧮 核心算法

### 3.1 Walker — 组件树遍历 + 表达式求值

```ts title="packages/renderer/src/walker.ts" showLineNumbers
export function walkComponents(
  list: ComponentSchema[] | undefined,
  ctx: EvalContext,
  keyPrefix = ''
): RenderNode[] {
  if (!list) return [];
  const out: RenderNode[] = [];

  list.forEach((node, index) => {
    // Step 1: 求值 when，假则跳过
    if (!evaluateCondition(node.when, ctx)) return;

    // Step 2: 如果有 for，展开数组
    if (node.for) {
      const listValue = resolveValue(node.for.in, ctx);
      if (!Array.isArray(listValue)) return;
      const name = node.for.as ?? 'item';

      listValue.forEach((item, i) => {
        const childCtx = {...ctx, [name]: item};
        if (name === 'item') childCtx.item = item;
        out.push(renderSingle(
          node,
          childCtx,
          `${keyPrefix}${node.id ?? node.name}:${index}:${i}`
        ));
      });
      return;
    }

    // Step 3: 普通单节点
    out.push(renderSingle(
      node,
      ctx,
      `${keyPrefix}${node.id ?? node.name}:${index}`
    ));
  });

  return out;
}
```

输出 `RenderNode[]`，和具体框架无关：

```ts title="RenderNode 结构"
interface RenderNode {
  name: string;                              // 组件名
  key: string;                               // 稳定 key
  props: Record<string, unknown>;            // 已求值的 props
  children: RenderNode[];                    // 默认插槽
  slots: Record<string, RenderNode[]>;       // 具名插槽
  events: Record<string, ActionExpr>;        // 原始 action（框架绑定层转换）
  source: ComponentSchema;                   // 原始 schema
}
```

### 3.2 Expression — 沙盒化的路径求值

:::danger 为什么不用 new Function
- **CSP 违规**：生产 CSP 通常禁 `unsafe-eval`
- **安全风险**：JSON 可能来自服务端 / CMS / 运营，`new Function` 让他们任意执行代码
:::

**我们的做法**：只支持"根路径 + 属性访问"：

```ts title="packages/renderer/src/expression.ts"
const ROOTS = ['state', 'props', 'flags', 'env', 'item', 'data'] as const;

export function lookupPath(path: string, ctx: EvalContext): unknown {
  const parts = path.split('.').filter(Boolean);
  if (parts.length === 0) return undefined;

  const [head, ...rest] = parts;
  let current: unknown;

  if (ROOTS.includes(head)) {
    current = ctx[head];
  } else {
    // 隐式 state lookup（常见场景）
    current = ctx.state?.[head] ?? ctx.data?.[head];
  }

  for (const segment of rest) {
    if (current == null) return undefined;
    current = current[segment];
  }

  return current;
}
```

:::tip 有意的限制
如果你需要**复杂逻辑**，把它放进 state 里作为预计算的字段。

不让 JSON 变成"另一门编程语言"。
:::

### 3.3 Condition — 结构化布尔表达式

```json title="condition schema 示例"
{
  "and": [
    {"gte": [{"$": "user.age"}, {"$literal": 18}]},
    {"eq":  [{"$": "flags.region"}, {"$literal": "CN"}]},
    {"not": {"exists": {"$": "state.disabled"}}}
  ]
}
```

支持的操作符：

| 操作符 | 语义 |
| --- | --- |
| `and` | 所有子条件为真 |
| `or` | 任意子条件为真 |
| `not` | 取反 |
| `eq` / `neq` | 深等于 / 深不等于 |
| `gt` / `gte` / `lt` / `lte` | 数值比较 |
| `exists` | 值不是 null / undefined |

:::info 为什么不提供字符串表达式
`"user.age >= 18 && flags.region === 'CN'"` 这种写法好处是短，但：

- **CSP 问题**同上
- **可维护性**：结构化 JSON 可以被校验、diff、可视化编辑；字符串表达式需要完整 parser 才能做上面任何一件事
:::

### 3.4 Merge Schema — 多源合并

`mergeSchema(base, patches)` 支持三种 op：

```json title="patch 格式"
[
  {"$op": "set",    "$path": "components[0].props.title", "value": "New Title"},
  {"$op": "insert", "$path": "components", "index": 1, "value": { /* new component */ }},
  {"$op": "remove", "$path": "components[2]"}
]
```

**合并顺序**：

```text
base → variant patches → options.patches → remote patches
```

每一层都可以修正前面的结果。

:::tip 典型用法
- **base** = 主 schema（在仓库里）
- **variant** = 实验组 patch（从 feature flag 拉）
- **remote** = 运营后台实时 patch（运营改了按钮文案，下次刷新生效）
:::

### 3.5 Variant — 根据 ctx 选一组 patches

```json title="A/B 实验 schema"
{
  "variants": [
    {
      "when": {"eq": [{"$": "flags.exp"}, {"$literal": "A"}]},
      "base": {"components": [/* 版本 A */]},
      "patches": []
    },
    {
      "when": {"eq": [{"$": "flags.exp"}, {"$literal": "B"}]},
      "base": {"components": [/* 版本 B */]},
      "patches": []
    }
  ]
}
```

`resolveVariant(variants, ctx)` 从上到下找第一个 `when` 为真的条目返回。没匹配返回 `null` → 回落到 `options.schema`。

### 3.6 Registry — 组件注册表

```ts title="src/pages/home/entry.tsx" showLineNumbers
import {createRegistry} from '@lhx-kit/renderer';
import {Banner} from './components/Banner';

const registry = createRegistry();

// 静态注册
registry.register('Banner', Banner);

// 懒加载注册（框架绑定会用 Suspense / async 包裹）
registry.register('ProductList',
  () => import('./components/ProductList')
);
```

渲染时：

```ts
const resolved = await registry.resolve(schema);
// Map<name, Component> — schema 里所有用到的组件
```

### 3.7 Remote — 远端 schema 拉取

```ts title="用法"
import {createConfiguredPage} from '@lhx-kit/renderer/react';

const Page = createConfiguredPage({
  schema,
  registry,
  remote: {
    url: 'https://ops.example.com/schemas/home.json',
    timeoutMs: 3000,
    onDiagnostic: (d) => console.warn('[schema]', d)
  }
});
```

| 特性 | 说明 |
| --- | --- |
| 超时控制 | 原生 fetch + `AbortController` |
| zod 校验 | 远端 schema **始终**校验（独立 entry `@lhx-kit/renderer/schema-zod`） |
| 失败 fallback | 失败时返回 `options.schema` |
| 诊断回调 | 所有错误通过 `onDiagnostic` 上报，不抛异常 |

---

## 四、⚡ zod 为什么懒加载

zod 压缩后 54KB，gzip 12KB，**不小**。

**默认情况下我们不在客户端加载 zod**：

```ts title="packages/renderer/src/react.tsx" showLineNumbers {3-6}
// ...
if (options.validate) {
  // 👇 关键：动态 import，Rollup 会拆到独立 chunk
  const {pageSchema} = await import('./schema-zod');
  const check = pageSchema.safeParse(base);
  // ...
}
```

:::info `validate` 默认 false 的依据
- 📦 **静态 JSON schema**：`import schema from './render.json'` 时已经被 TS 类型检查过（`PageSchema` 类型），运行时 zod 是纯 overhead
- 🌐 **远端 schema**：`fetchRemoteSchema` 内部**始终**校验，和 `validate` 无关
:::

**结果**：

- 用户不设置 `validate: true` → `schema-zod` 被 Rollup 标记为"仅动态 import 可达" → 独立 chunk，默认不加载
- bundle 里只多一个 **1.12KB** 的 dead-path chunk，zod 的 54KB **留在磁盘上不加载**

:::tip 这也是 [性能章节](../guide/performance#65-为什么还剩-5-个-sub-10kb-chunk) 保留那个 sub-10KB chunk 的原因
合进主 bundle 就失去了 lazy 效果。
:::

---

## 五、🟢 Vue3 绑定

```ts title="src/pages/home/entry.ts" showLineNumbers
import {createApp} from 'vue';
import {createConfiguredPage} from '@lhx-kit/renderer/vue';
import schema from './render.json';
import {registry} from './registry';

const Page = createConfiguredPage({
  schema,
  registry,
  state: {bannerUrl: '/banner.png'},
  flags: {showBanner: true},
  actions: {
    goToDetail: (payload) => router.push(`/detail/${payload.id}`)
  },
  validate: false
});

createApp(Page).mount('#app');
```

**内部实现**：

- `defineComponent` + `h()` 函数式渲染
- slots 通过 Vue 原生 `slots` API 传递
- 事件转成 Vue kebab-case（`{click: ...}` → `onClick`）
- `<Suspense>` 包裹 lazy component

---

## 六、🔵 React 绑定

```tsx title="src/pages/home/entry.tsx" showLineNumbers
import {createRoot} from 'react-dom/client';
import {createConfiguredPage} from '@lhx-kit/renderer/react';
import schema from './render.json';
import {registry} from './registry';

const Page = createConfiguredPage({
  schema,
  registry,
  state: {bannerUrl: '/banner.png'},
  flags: {showBanner: true},
  actions: {
    goToDetail: (payload) => navigate(`/detail/${payload.id}`)
  },
  validate: false
});

createRoot(document.getElementById('app')!).render(<Page />);
```

**内部实现**：

- `useState` 存 schema state
- `useEffect` 处理 remote fetch / patches merge 的异步流
- 事件转成 React camelCase（`{click: ...}` → `onClick`）
- slots 映射成 props（React 没有 named slots 概念）：`<Comp headerSlot={[node1, node2]}>`

---

## 七、📋 完整类型约束

```ts title="packages/renderer/src/schema.ts（简化版）" showLineNumbers
type PageSchema = {
  components: ComponentSchema[];
  meta?: Record<string, unknown>;
};

type ComponentSchema = {
  id?: string;
  name: string;                              // 注册表 key
  props?: Record<string, ValueExpr>;
  children?: ComponentSchema[];
  slots?: Record<string, ComponentSchema[]>;
  events?: Record<string, ActionExpr>;
  when?: ConditionExpr;
  for?: {in: ValueExpr; as?: string};
};

type ValueExpr =
  | unknown
  | {$: string}                              // 路径求值
  | {$literal: unknown};                     // 字面量

type ConditionExpr =
  | boolean
  | {and: ConditionExpr[]}
  | {or: ConditionExpr[]}
  | {not: ConditionExpr}
  | {eq: [ValueExpr, ValueExpr]}
  | {gt: [ValueExpr, ValueExpr]}
  /* ... */;

type ActionExpr =
  | {type: string; payload?: Record<string, ValueExpr>}
  | ActionExpr[];
```

---

## 八、📂 就近约定：render.json

从 0.1 版起，renderer schema **不放在** `src/schemas/`，而是和页面代码同目录：

```text title="就近放置" {4}
src/pages/home/
├── entry.tsx
├── router.tsx
├── render.json        👈 这里
└── views/
```

`lhx-cli add page <name>` 会自动生成这一份 render.json 模板。页面代码直接 `import schema from './render.json'`。

:::tip 为什么就近
- 🎯 改页面 schema 不用跳到 `src/schemas/` 再改
- 🔍 同一个 PR 里的文件聚集在一起，review 更轻松
- 📦 页面删除时，schema 一起删（不会残留）
:::

---

## 九、📦 依赖清单

| 依赖 | 在哪用 | 为什么 |
| --- | --- | --- |
| `zod` | `schema-zod.ts` | 运行时校验；懒加载，默认不进 bundle |
| `react` / `vue` | peer dependencies | 渲染目标框架，用户项目自己带 |

:::info 就这两个
renderer 核心是 pure TS，不依赖任何 runtime 工具库。
:::

---

## 十、🚫 什么时候**不**要用

:::warning 下面场景用普通 JSX / SFC 更合适
- **页面结构稳定 / 几乎不改**：普通组件更直接
- **团队不打算做运营化 / A/B / 远端下发**：直接写 JSX 更简单
- **超复杂逻辑**（嵌套路由、表单验证、拖拽排序）：硬塞 JSON 会让结构膨胀
:::

lhx-kit 的 `validate: false` 默认 + 懒加载设计就是表达这个态度：**renderer 是可选能力，不用也没成本**。

---

## 十一、🏗️ 架构设计回顾

```text
┌──────────────────────────────────────────────────┐
│                 用户代码                          │
│                                                  │
│  createConfiguredPage({schema, registry, ...})   │
└──────────────────────┬───────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────┐
│              @lhx-kit/renderer                   │
│                                                  │
│  1. resolveVariant(variants, ctx)                │
│     └─ 选一组 base + patches                     │
│  2. mergeSchema(base, [variant, local, remote])  │
│     └─ 多源合并                                   │
│  3. registry.resolve(schema)                     │
│     └─ 组件名 → Component 实例                    │
│  4. walkComponents(schema.components, ctx)       │
│     └─ RenderNode 树                             │
│  5. framework binding                            │
│     └─ React createElement / Vue h()            │
└──────────────────────────────────────────────────┘
```

---

## 十二、📖 相关资源

- 示例代码：`examples/vmpa/src/pages/*/render.json`
- [⚡ 性能决策](../guide/performance#65-为什么还剩-5-个-sub-10kb-chunk)
- [📖 CLI 参考 - add page](../cli/reference#add)
