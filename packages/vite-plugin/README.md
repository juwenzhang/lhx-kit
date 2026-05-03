# @lhx-kit/vite-plugin

> ⚡ Vite plugin that turns `project.config.ts` into a production-grade MPA build pipeline.
> Per-page output, family-grouped chunks, CDN import rewriting, local vendor fallback, gzip + brotli pre-compression — all out of the box.

[![npm](https://img.shields.io/npm/v/@lhx-kit/vite-plugin?color=0c9)](https://www.npmjs.com/package/@lhx-kit/vite-plugin)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[中文文档](./README.zh-CN.md)

---

## Install

```bash
pnpm add -D @lhx-kit/vite-plugin
```

> Peer: `vite ^5 || ^6 || ^7`. Requires Node.js `>= 18.18.0`.

## Usage

```ts title="vite.config.ts"
import {defineConfig} from 'vite';
import {lhxKit} from '@lhx-kit/vite-plugin';

export default defineConfig({
  plugins: [lhxKit()]
});
```

**That's it.** The plugin reads `project.config.ts` from the project root and configures:

- `build.rollupOptions.input` — one entry per `pages.<name>`
- `resolve.alias` — from `aliases` field
- `define` — from `envs.<mode>`
- `manualChunks` — family-grouped vendor chunks
- `output.experimentalMinChunkSize` — sub-10KB chunks auto-merged

---

## What it does

### 🏗️ MPA orchestration

```text
project.config.ts
    ↓ (config hook)
.lhx-kit/pages/home.html  ← intermediate HTML per page
.lhx-kit/pages/about.html
    ↓ (rollup)
    ↓ (generateBundle hook)
dist/
├── home/index.html
├── home/assets/…
├── about/index.html
├── about/assets/…
└── shared/assets/…         ← chunks used by 2+ pages
```

### 🎯 Chunk strategy

Two layers:

```ts
// Layer 1: family grouping
{
  react: ['react', 'react-dom', 'scheduler'],
  'react-router': ['react-router', 'react-router-dom', 'remix-run-router'],
  vue: ['vue', 'vue-demi'],
  'vue-state': ['pinia', 'vue-router']
}

// Layer 2: sub-10KB auto-merge
output.experimentalMinChunkSize = 10 * 1024
```

Result: a default React MPA goes from 13 → 10 chunks, all above 1 KB.

See [Performance deep-dive](https://juwenzhang.github.io/lhx-kit/guide/performance) for the full reasoning.

### 🌐 CDN externalization (opt-in)

Declare in `project.config.ts`:

```ts
cdn: {
  enabled: true,
  entries: [
    {
      name: 'vue',
      globalVar: 'Vue',
      urls: ['https://cdn.jsdelivr.net/npm/vue@3/dist/vue.global.prod.js']
    }
  ]
}
```

Plugin will:

1. **Rewrite** `import {ref} from 'vue'` → `const {ref} = window.Vue`
2. **Inject** a classic `<script>` loader in each HTML (ES5 IIFE, no bundler deps)
3. **Emit** a local vendor fallback to `shared/vendor/vue.js` (used when all CDN URLs fail)
4. **Support** `aliasGlobals` / `initScript` for framework swap (e.g. Preact replacing React)

Full walkthrough: [CDN deep-dive](https://juwenzhang.github.io/lhx-kit/guide/cdn).

### 🗜️ Pre-compression (default on)

Every `.js / .css / .html / .svg / .json` over 1 KB gets:

- `foo.js.gz` — gzip level 9
- `foo.js.br` — brotli quality 11 (best)

Configure nginx with `gzip_static on; brotli_static on;` to serve these directly.

### 🧹 Production sensible defaults

```ts
target: 'es2018'                 // modern output, smaller minified size
assetsInlineLimit: 8 * 1024      // inline small assets as data URI
cssCodeSplit: true               // per-chunk CSS
esbuild.drop: ['debugger']
esbuild.pure: ['console.log', 'console.debug', 'console.trace']
```

User's `vite.config.ts` can still override any of these.

---

## Plugin hooks

| Hook | Enforce | Role |
| --- | --- | --- |
| `config` | `pre` | Translate project.config.ts → UserConfig |
| `resolveId` / `load` | – | `@lhx-kit/virtual:config` virtual module |
| `transform` | – | Rewrite bare imports (CDN active) |
| `generateBundle` | `post` | Reorganize per-page, inject CDN loader |
| (compress plugin) | `post` | Emit `.gz` / `.br` siblings |

Read the full source in [`src/plugin.ts`](./src/plugin.ts).

---

## Options

```ts
lhxKit({
  root?: string,              // override project root
  mode?: string,              // override env mode
  pages?: string[],           // explicit page list (usually via --page)
  intermediateDir?: string,   // default '.lhx-kit/pages'
  outputLayout?: 'per-page' | 'flat',  // default 'per-page'
  sharedDir?: string,         // default 'shared'
  cleanUrls?: boolean,        // dev: /home → home.html, default true
  compress?: false | {threshold?, extensions?}  // default on
})
```

---

## Dependencies

| Dep | Why |
| --- | --- |
| `@lhx-kit/config` | Load project.config.ts |
| `@lhx-kit/runtime` | CDN loader source generator |
| `vite` (peer) | Host build tool |

**Only 2 internal deps**. No lodash / glob / chokidar bloat.

---

## Docs

- ⚡ [Vite plugin implementation details](https://juwenzhang.github.io/lhx-kit/runtime/vite-plugin)
- 🧠 [Performance decisions](https://juwenzhang.github.io/lhx-kit/guide/performance)
- 🌐 [CDN externalization](https://juwenzhang.github.io/lhx-kit/guide/cdn)

## License

[MIT](./LICENSE) © luhanxin

<!-- lhx-readme-footer:begin -->

---

## 📦 Install

```bash
npm install @lhx-kit/vite-plugin
# or
pnpm add @lhx-kit/vite-plugin
```

![npm](https://img.shields.io/npm/v/%40lhx-kit%2Fvite-plugin.svg) 
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
