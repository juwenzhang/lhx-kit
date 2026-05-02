# @lhx-kit/cli

> ⚙️ **lhx-cli** — scaffold real-world MPA projects in one command.
> Not "hello world + Vite" — a project that ships with routing, state, request, mock, CI, Docker, and everything else your team actually needs on day one.

[![npm](https://img.shields.io/npm/v/@lhx-kit/cli?color=0c9)](https://www.npmjs.com/package/@lhx-kit/cli)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[中文文档](./README.zh-CN.md)

---

## Install

```bash
# Global
pnpm add -g @lhx-kit/cli

# Or run once without installing
pnpm dlx @lhx-kit/cli create my-app
```

> Requires Node.js `>= 18.18.0`.

## Quick start

```bash
lhx-cli create my-app
cd my-app
pnpm install && pnpm dev
```

---

## Commands

| Command | Purpose |
| --- | --- |
| `lhx-cli create <name>` | 🚀 Scaffold a new project |
| `lhx-cli add page <name>` | ➕ Add a page (entry / router / render.json / views) |
| `lhx-cli dev [--page]` | 🧪 Start the Vite dev server |
| `lhx-cli build [--page]` | 🏗️ Production build |
| `lhx-cli info` | 📊 Print project config summary |
| `lhx-cli doctor` | 🩺 Diagnose environment + config |
| `lhx-cli offline <action>` | 📦 Offline packaging (`build\|manifest\|inspect`) |
| `lhx-cli upgrade` | ⬆️ Upgrade project (planned) |

Full reference with all options: [CLI docs](https://juwenzhang.github.io/lhx-kit/cli/reference).

---

## Examples

### Interactive creation

```bash
lhx-cli create my-app
# ? Choose a template          · react-mpa
# ? Which features to enable?  · offline, mock, e2e
# ? Package manager             · pnpm
# ? Initialize git?             · yes
# ? Install dependencies now?   · yes
```

### Non-interactive (CI-friendly)

```bash
lhx-cli create my-app \
  --template=react-mpa \
  --features=offline,e2e,mock \
  --pm=pnpm \
  --yes
```

### Add a page with full scaffold

```bash
lhx-cli add page profile
# ✓ src/pages/profile/entry.tsx
# ✓ src/pages/profile/router.tsx
# ✓ src/pages/profile/render.json
# ✓ src/pages/profile/views/ProfileLanding.tsx
# ✓ src/pages/profile/views/ProfileAbout.tsx
# ✓ project.config.ts patched via AST (ts-morph)
```

### Diagnose config issues

```bash
lhx-cli doctor
# ✅ Node.js 20.18.0
# ✅ pnpm 9.15.0
# ✅ project.config.ts schema
# ❌ LHX_E001: page "profile" declared but src/pages/profile/entry.tsx missing
#    Fix: run `lhx-cli add page profile` or remove from project.config.ts
```

---

## Templates

Ships with two production-ready templates:

| Template | Framework | State | UI | Routing |
| --- | --- | --- | --- | --- |
| 🟢 `vue3-mpa` | Vue 3.5 | Pinia | Vant 4 | vue-router 4 |
| 🔵 `react-mpa` | React 19 | Zustand 5 | Ant Design 5 | react-router 6 |

Both templates include: **ESLint + Prettier + Husky + Commitlint + lint-staged + Vitest + Playwright + MSW + Docker + GitHub Actions**.

---

## Design

### AST-level config mutation

`lhx-cli add page` doesn't use regex or string manipulation. It uses [`ts-morph`](https://ts-morph.com/) to parse `project.config.ts`, find the `pages` property via AST nodes, and insert a new `PropertyAssignment`.

**Result**: your existing comments, indentation, and formatting are **preserved**.

### Local templates (no network)

Templates ship **inside the CLI package** (`packages/cli/templates/`). No runtime GitHub fetch, no registry dependency. Works offline.

### Framework-agnostic `cac` router

~15KB command parser. No eager module loading — `lhx-cli --help` takes <50ms because commands are loaded lazily.

---

## Dependencies

| Dep | Why |
| --- | --- |
| `cac` | Command routing (smallest / fastest CLI framework) |
| `prompts` | Interactive questions |
| `kolorist` | Terminal colors |
| `execa` | Cross-platform subprocess (`pnpm install`, `git init`) |
| `fs-extra` | `copy` / `remove` / `ensureDir` helpers |
| `jiti` | Load user's `project.config.ts` |
| `ts-morph` | AST-level config mutation |
| `giget` | Reserved for future remote templates |
| `@lhx-kit/config` | Config schema + loader |
| `@lhx-kit/offline` | `offline` subcommand implementation |

---

## Docs

- 📖 [CLI command reference](https://juwenzhang.github.io/lhx-kit/cli/reference)
- 🚀 [Getting started](https://juwenzhang.github.io/lhx-kit/guide/getting-started)
- 🧱 [Templates catalogue](https://juwenzhang.github.io/lhx-kit/templates/catalogue)

## License

[MIT](./LICENSE) © luhanxin
