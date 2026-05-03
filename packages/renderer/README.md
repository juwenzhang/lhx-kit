# @lhx-kit/renderer

> 🎨 JSON config-driven UI renderer. Vue 3 + React bindings.
> Ship page layouts as **JSON**, not code — swap banners / A/B variants / localize copy without redeploying.

[![npm](https://img.shields.io/npm/v/@lhx-kit/renderer?color=0c9)](https://www.npmjs.com/package/@lhx-kit/renderer)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[中文文档](./README.zh-CN.md)

---

## Install

```bash
pnpm add @lhx-kit/renderer
# React
pnpm add react react-dom
# or Vue
pnpm add vue
```

---

## Example

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

### React binding

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

### Vue binding

```ts
import {createConfiguredPage} from '@lhx-kit/renderer/vue';
// …same options shape, just returns a Vue component
```

---

## API

| Export | From | Purpose |
| --- | --- | --- |
| `createConfiguredPage(opts)` | `/react` or `/vue` | Returns a framework-native component |
| `createRegistry()` | `/` | Component name → implementation map |
| `mergeSchema(base, patches)` | `/` | Patch-based merging (`set/insert/remove`) |
| `resolveVariant(variants, ctx)` | `/` | A/B variant selection |
| `walkComponents(list, ctx)` | `/` | Tree walker + prop/when/for eval |
| `fetchRemoteSchema(opts)` | `/` | HTTP fetch with timeout + fallback |
| `pageSchema` (lazy) | `/schema-zod` | zod runtime validator (dynamic import) |

---

## Highlights

### 🛡️ CSP-safe expression language

Instead of `eval` or `new Function`, expressions are structured JSON:

```json
{"$": "state.user.name"}                              // path lookup
{"$literal": "hello"}                                 // literal
{"and": [{"gte": [{"$": "age"}, {"$literal": 18}]}]}  // condition
```

No `unsafe-eval` in CSP needed. Works in every hardened container.

### ⚡ Lazy zod validation

Default: `validate: false`. `zod` (54 KB) is **not in your bundle** unless you opt in:

```tsx
createConfiguredPage({schema, registry, validate: true});
// ↑ triggers `import('./schema-zod')` at runtime
// only then does zod enter the chunk graph
```

For static JSON imported at build time, TypeScript already validates `PageSchema`. Runtime zod is pure overhead.

### 🎯 Multi-source schema merging

```
base schema
   ↓  (variant patches from feature flags)
   ↓  (options.patches from local logic)
   ↓  (remote patches from ops backend)
final rendered tree
```

Each layer can `set / insert / remove` fields in the previous layer.

---

## Dependencies

| Dep | Why |
| --- | --- |
| `zod` ^3.24.1 | Schema validation (lazy loaded) |
| `react` >=18 (peer, optional) | React binding only |
| `vue` >=3 (peer, optional) | Vue binding only |

Core is **pure TS**, no runtime utility libs.

---

## Design

See full deep-dive in [Renderer overview](https://juwenzhang.github.io/lhx-kit/renderer/overview).

Quick algorithm summary:

| Component | File | Algorithm |
| --- | --- | --- |
| **Walker** | `walker.ts` | DFS with `when / for / slots` expansion |
| **Expression** | `expression.ts` | Path lookup only — no function calls |
| **Condition** | `expression.ts` | Structured boolean tree (`and/or/not/eq/...`) |
| **Merge** | `merge.ts` | 3 ops: `set / insert / remove` by `$path` |
| **Variant** | `variant.ts` | First `when`-matching entry wins |
| **Remote** | `remote.ts` | `fetch` + `AbortController` + zod validation |

---

## When **not** to use

⚠️ This package adds complexity. Skip it when:

- Page structure rarely changes
- No A/B testing / runtime config / ops-driven layout
- Deep interactions (forms, drag-drop) — write them in JSX directly

---

## Docs

- 🎨 [Renderer overview](https://juwenzhang.github.io/lhx-kit/renderer/overview)
- 📖 [Full schema reference](https://juwenzhang.github.io/lhx-kit/renderer/overview#七-完整类型约束)

## License

[MIT](./LICENSE) © luhanxin

<!-- lhx-readme-footer:begin -->

---

## 📦 Install

```bash
npm install @lhx-kit/renderer
# or
pnpm add @lhx-kit/renderer
```

![npm](https://img.shields.io/npm/v/%40lhx-kit%2Frenderer.svg) 
![provenance](https://img.shields.io/badge/provenance-verified-brightgreen?logo=npm)

## 📖 Docs & further reading

- 🏠 Project home: <https://juwenzhang.github.io/lhx-kit/>
- 📘 Package docs: [/cli/reference](https://juwenzhang.github.io/lhx-kit/cli/reference), [/guide/architecture](https://juwenzhang.github.io/lhx-kit/guide/architecture)
- 🛠️ Engineering column: [/engineering/overview](https://juwenzhang.github.io/lhx-kit/engineering/overview)
- 💬 Issues & discussions: <https://github.com/juwenzhang/lhx-kit/issues>

## 🤝 Contributing

PRs welcome. Please read [CONTRIBUTING.md](https://github.com/juwenzhang/lhx-kit/blob/master/CONTRIBUTING.md) and run `pnpm changeset` for any user-visible change. First-time contributors: look for labels `good first issue` and `help wanted`.

## 📄 License

[MIT](https://github.com/juwenzhang/lhx-kit/blob/master/LICENSE) © luhanxin

<sub>Part of the [`@lhx-kit`](https://github.com/juwenzhang/lhx-kit) monorepo. Every release is OIDC-signed via npm Trusted Publishing — verify the provenance attestation on the npm package page.</sub>

<!-- lhx-readme-footer:end -->
