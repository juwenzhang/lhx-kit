# Renderer Schema (JSON → UI)

`@lhx-kit/renderer` turns a JSON schema into React or Vue components. It is
**NOT** a replacement for JSX — it's for screens whose structure is driven
by config (admin tables, dynamic forms, server-pushed layouts).

## The Minimum Viable Schema

```json
{
  "type": "Card",
  "props": {"title": "Hello"},
  "children": [
    {"type": "Paragraph", "props": {"text": "World"}}
  ]
}
```

Pass it to a renderer:

```tsx title="React"
import {Renderer, registerComponents} from '@lhx-kit/renderer/react';
import {Card, Paragraph} from './components';

registerComponents({Card, Paragraph});

<Renderer schema={schema} />
```

```vue
<script setup lang="ts">
import {Renderer, registerComponents} from '@lhx-kit/renderer/vue';
import Card from './Card.vue';
import Paragraph from './Paragraph.vue';
registerComponents({Card, Paragraph});
</script>
<template><Renderer :schema="schema" /></template>
```

## Expression Bindings

Schema values prefixed with `$` are live expressions. Three kinds:

| Prefix | Example | Meaning |
| --- | --- | --- |
| `$state.` | `"$state.user.name"` | Read from the renderer's state store |
| `$action.` | `"$action.submit"` | Fire a registered action on event |
| `$when` | `{"$when": "state.showModal"}` | Conditional rendering |

```json title="Reactive form field"
{
  "type": "Input",
  "props": {
    "value": "$state.form.email",
    "onChange": "$action.form.setEmail",
    "placeholder": "Enter email"
  }
}
```

## Variants with `mergeSchema`

When two variants of a screen share 90% of the structure, use a base schema
and override:

```ts
import {mergeSchema} from '@lhx-kit/renderer';

const base = { /* ... */ };
const mobile = mergeSchema(base, {
  props: {columnCount: 1},
  children: [
    /* partial override */
  ]
});
```

`mergeSchema` does a **deep, path-aware merge** — arrays are merged by `id`
(or index fallback), objects are key-merged, primitives are replaced.

## Remote Schema

```ts
import {fetchRemoteSchema} from '@lhx-kit/renderer';
const schema = await fetchRemoteSchema('https://api.example.com/schemas/home');
```

- Uses `@lhx-kit/runtime#request` → axios with retry + timeout
- Caches in-memory by URL + `If-None-Match`
- Validates against zod schema if `validate: true` (lazy-loads zod, ~54KB,
  deferred behind the flag)

## Walker / Traversal

Every op on a schema goes through `walkComponents` — a pre-order BFS visitor:

```ts
import {walkComponents} from '@lhx-kit/renderer';

walkComponents(schema, (node, path) => {
  if (node.type === 'Input') console.log('input at', path.join('.'));
});
```

Use cases:
- Collect all `Image` nodes → preload assets
- Find duplicate `id`s → lint errors
- Transform `type: 'LegacyCard'` → `type: 'Card'` during schema migration

## Pitfalls

:::danger Never put raw JSX inside schema
Schema is JSON. If you need a component with heavy internal JSX, register it
as a leaf component and reference it by `type`. Do NOT stringify JSX.
:::

:::warning Component names must be registered before render
Unregistered `type` values render as `<!-- missing: Foo -->` placeholders.
Register all components at app boot, not lazily inside components.
:::

:::tip Zod validation is opt-in
`validate: true` lazy-loads zod (+54KB gzipped) and runs the schema against
`SchemaNode` zod. Do it in staging; disable in production for LCP. Invalid
schemas fail loudly at boot, not silently during render.
:::

:::info React and Vue adapters are isomorphic
Both adapters consume the SAME schema + registry. You can run the exact
schema across frameworks as long as your registered component APIs match.
:::

## When NOT to Use Schema Rendering

- Static marketing pages (just write JSX/template)
- Highly interactive widgets (game UI, graphics editor)
- Teams unfamiliar with "indirection": schema-driven UIs are 1.5x slower to
  onboard than direct JSX
