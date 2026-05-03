# @lhx-kit/renderer

> 🎨 配置驱动的 UI 渲染器。Vue 3 + React 双绑定。
> 页面布局以 **JSON** 发布——换 banner / A/B 变体 / 多语言文案**无需重新发版**。

[![npm](https://img.shields.io/npm/v/@lhx-kit/renderer?color=0c9)](https://www.npmjs.com/package/@lhx-kit/renderer)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[English](./README.md)

---

## 安装

```bash
pnpm add @lhx-kit/renderer
# React 项目
pnpm add react react-dom
# 或 Vue 项目
pnpm add vue
```

---

## 示例

### Schema

```json title="src/pages/home/render.json"
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

### React 绑定

```tsx
import {createConfiguredPage, createRegistry} from '@lhx-kit/renderer/react';
import schema from './render.json';
import {Banner, ProductList} from './components';

const registry = createRegistry();
registry.register('Banner', Banner);
registry.register('ProductList', ProductList);

const Page = createConfiguredPage({
  schema,
  registry,
  state: {bannerUrl: '/banner.png', products: [...]},
  flags: {showBanner: true},
  actions: {
    goToDetail: ({id}) => navigate(`/detail/${id}`)
  }
});

export default Page;
```

### Vue 绑定

```ts
import {createConfiguredPage} from '@lhx-kit/renderer/vue';
// …选项结构一致，返回一个 Vue 组件
```

---

## API

| 导出 | 来源 | 用途 |
| --- | --- | --- |
| `createConfiguredPage(opts)` | `/react` 或 `/vue` | 返回框架原生组件 |
| `createRegistry()` | `/` | 组件名 → 实现映射 |
| `mergeSchema(base, patches)` | `/` | patch 合并（`set/insert/remove`） |
| `resolveVariant(variants, ctx)` | `/` | A/B 变体选择 |
| `walkComponents(list, ctx)` | `/` | 组件树遍历 + 表达式求值 |
| `fetchRemoteSchema(opts)` | `/` | HTTP 拉取 + 超时 + fallback |
| `pageSchema`（懒加载） | `/schema-zod` | zod 运行时校验器 |

---

## 亮点

### 🛡️ CSP 安全的表达式语言

不用 `eval` 或 `new Function`，表达式是**结构化 JSON**：

```json
{"$": "state.user.name"}                              // 路径查找
{"$literal": "hello"}                                 // 字面量
{"and": [{"gte": [{"$": "age"}, {"$literal": 18}]}]}  // 条件
```

CSP 不需要开 `unsafe-eval`，可在任何严格容器里跑。

### ⚡ zod 懒加载

默认 `validate: false`。`zod`（54 KB）**不会进你的 bundle**，除非显式开启：

```tsx
createConfiguredPage({schema, registry, validate: true});
// ↑ 运行时才触发 import('./schema-zod')
// 此时 zod 才加入 chunk 图
```

对 build 时 import 的静态 JSON，TypeScript 已经校验了 `PageSchema` 类型，运行时 zod 是纯开销。

### 🎯 多源 schema 合并

```
base schema
   ↓  （变体 patches 来自 feature flag）
   ↓  （options.patches 来自本地逻辑）
   ↓  （remote patches 来自运营后台）
最终渲染树
```

每一层都可以 `set / insert / remove` 前一层的字段。

---

## 依赖

| 依赖 | 用途 |
| --- | --- |
| `zod` ^3.24.1 | Schema 校验（懒加载） |
| `react` >=18（可选 peer） | 仅 React 绑定使用 |
| `vue` >=3（可选 peer） | 仅 Vue 绑定使用 |

核心是**纯 TS**，无 runtime 工具库。

---

## 设计

完整算法见 [Renderer 概览](https://juwenzhang.github.io/lhx-kit/renderer/overview)。

算法速查：

| 模块 | 文件 | 算法 |
| --- | --- | --- |
| **Walker** | `walker.ts` | DFS + `when / for / slots` 展开 |
| **Expression** | `expression.ts` | 仅路径查找——不支持函数调用 |
| **Condition** | `expression.ts` | 结构化布尔树（`and/or/not/eq/...`） |
| **Merge** | `merge.ts` | 3 种 op：按 `$path` 的 `set / insert / remove` |
| **Variant** | `variant.ts` | 第一个匹配 `when` 的条目生效 |
| **Remote** | `remote.ts` | `fetch` + `AbortController` + zod 校验 |

---

## 什么时候**不**要用

⚠️ 这个包会增加复杂度，下列场景跳过：

- 页面结构基本不变
- 不做 A/B 测试 / 运行时配置 / 运营后台布局
- 复杂交互（表单、拖拽）——直接写 JSX 更简单

---

## 文档

- 🎨 [Renderer 概览](https://juwenzhang.github.io/lhx-kit/renderer/overview)
- 📖 [完整类型约束](https://juwenzhang.github.io/lhx-kit/renderer/overview#七-完整类型约束)

## License

[MIT](./LICENSE) © luhanxin

<!-- lhx-readme-footer:begin -->

---

## 📦 安装

```bash
npm install @lhx-kit/renderer
# 或
pnpm add @lhx-kit/renderer
```

![npm](https://img.shields.io/npm/v/%40lhx-kit%2Frenderer.svg) 
![provenance](https://img.shields.io/badge/provenance-verified-brightgreen?logo=npm)

## 📖 文档与延伸阅读

- 🏠 项目首页：<https://juwenzhang.github.io/lhx-kit/>
- 📘 相关文档：[CLI 参考](https://juwenzhang.github.io/lhx-kit/cli/reference) · [架构总览](https://juwenzhang.github.io/lhx-kit/guide/architecture)
- 🛠️ 工程化专栏：[/engineering/overview](https://juwenzhang.github.io/lhx-kit/engineering/overview)
- 💬 Issue / 讨论区：<https://github.com/juwenzhang/lhx-kit/issues>

## 🤝 参与贡献

欢迎 PR！请阅读 [CONTRIBUTING.md](https://github.com/juwenzhang/lhx-kit/blob/master/CONTRIBUTING.md)，用户可见变更请用 `pnpm changeset` 声明。新手友好 label：`good first issue` / `help wanted`。

## 📄 License

[MIT](https://github.com/juwenzhang/lhx-kit/blob/master/LICENSE) © luhanxin

<sub>属于 [`@lhx-kit`](https://github.com/juwenzhang/lhx-kit) monorepo。每次发布都经过 npm Trusted Publishing（OIDC）签名——可在 npm 包页面验证 provenance 证明。</sub>

<!-- lhx-readme-footer:end -->
