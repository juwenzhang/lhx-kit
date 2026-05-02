# lhx-kit Project Overview

A lhx-kit project is a Vite-powered **multi-page application (MPA)** driven by a
single source of truth — `project.config.ts` — and three collaborating
`@lhx-kit/*` packages.

## Mental Model

```text
project.config.ts         ←—— edit this to add pages / flip features
      │
      ▼
@lhx-kit/config       parse + zod validate + env merge
      │
      ▼
@lhx-kit/vite-plugin  generate per-page HTML + chunking + CDN rewrite
      │
      ▼
Vite → dist/<page>/    one folder per page, each with its own index.html
      │
      ▼
@lhx-kit/offline      (optional) bundle pages into hybrid .zip packages
```

## Files That Matter (in priority order)

| File | Owned by | What edits do |
| --- | --- | --- |
| `project.config.ts` | developer | Declare pages, env overrides, CDN, offline, mobile. Changes here drive **everything**. |
| `offline.config.ts` | developer | Only read when `offline.enabled = true`. Hybrid manifest + rollback + prefetch rules. |
| `vite.config.ts` | developer | Thin wrapper that calls `lhxKit()`. Usually doesn't need edits. |
| `package.json` | developer | Scripts call `vite build` / `lhx-cli offline build` / `lhx-cli dev`. |
| `.env.*` | developer | Per-env secrets — resolved by `@lhx-kit/config#resolveEnv` and injected into the runtime. |

## Command Cheatsheet

```bash title="Dev / build"
pnpm dev                 # serve all pages (port auto-picks; open /home/, /dashboard/, ...)
pnpm build               # build every page to dist/<page>/
pnpm preview             # preview the built dist/

lhx-cli add page foo     # AST-safe: inserts a new `pages.foo` block into project.config.ts
lhx-cli doctor           # sanity-check environment, configs, plugin wiring
lhx-cli info             # print resolved env + active features

lhx-cli offline build --hybrid-type=test    # bundle into dist-offline/<ts>_<type>_v<ver>.zip
lhx-cli offline inspect <zip>               # dump manifest + sha256 without extracting
```

## Debugging Rules of Thumb

1. **Build output wrong / missing pages** — inspect `project.config.ts`. If a
   page isn't listed under `pages`, the plugin won't emit it.
2. **Env vars undefined at runtime** — env is double-filtered: both `envPrefix`
   in `project.config.ts` AND Vite's built-in `VITE_` prefix must match.
3. **CDN import failing** — check `cdn.entries[].onerror` fallback chain and
   confirm the package is in `cdn.entries` (otherwise Vite bundles it normally).
4. **Offline zip missing files** — `whitelistPages` decides which pages enter
   the zip. Omitted pages are silently skipped.

## When Asked to Add Something

- **Adding a page** → prefer `lhx-cli add page <name>` over hand-editing; it
  handles AST insertion + new folder + router stub.
- **Adding an optional feature (offline / mobile / cdn)** → flip the flag in
  `project.config.ts`; the plugin auto-wires.
- **Adding a CDN dependency** → add entry under `cdn.entries`; set
  `aliasGlobals` if the runtime global name differs from the npm package name
  (e.g. `react-router-dom` → `ReactRouterDOM`).

## What This Project Is NOT

- Not a SPA. Every page has its own `index.html` + hydration boundary.
- Not SSR / SSG. Render happens in the browser after bundle loads.
- Not a framework lock-in. Both Vue 3 and React 19 templates are first-class.
