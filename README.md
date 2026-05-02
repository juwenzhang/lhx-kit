# lhx-kit

> 🧰 A monorepo-grade toolchain that scaffolds real-world MPA projects. Not "hello world + Vite" — a project that ships with routing, state, request, Mock, CI, Docker, and everything else your team actually needs on day one.

<p align="center">
  <a href="https://juwenzhang.github.io/lhx-kit/"><strong>📖 Documentation</strong></a> ·
  <a href="./README.zh-CN.md"><strong>🇨🇳 中文</strong></a> ·
  <a href="https://github.com/juwenzhang/lhx-kit"><strong>⭐ GitHub</strong></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D18.18-brightgreen" alt="node" />
  <img src="https://img.shields.io/badge/pnpm-%3E%3D9-f69220" alt="pnpm" />
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT" />
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs welcome" />
</p>

---

## ✨ Why lhx-kit

| Pain point | lhx-kit's answer |
| --- | --- |
| 🔀 `webpack.config` + `package.json scripts` + `routes.json` out of sync | Single `project.config.ts` drives CLI + Vite plugin + offline + runtime |
| 🐘 React-dom is 192 KB — "just split it" | Physical impossibility + data to prove it. Instead: family grouping + 10KB minChunkSize + CDN externalization |
| 📱 Mobile adaptation is copy-paste hell | `setupMobile({maxWidth: 750})` + postcss-pxtorem + desktop centering guard |
| 📦 Hybrid App offline packaging has no standard | `lhx-cli offline build` → manifest.json + sha256 + zip |
| 🧪 Setting up ESLint/Prettier/Husky/Vitest/Playwright eats a whole day | Scaffolded project gets all of it, plus Docker + CI, on day one |

---

## 📦 Packages

| Package | Description |
| --- | --- |
| [`@lhx-kit/cli`](./packages/cli) | ⚙️ CLI — create / add / dev / build / doctor / offline |
| [`@lhx-kit/config`](./packages/config) | 🧭 SSOT config loader with zod + jiti |
| [`@lhx-kit/runtime`](./packages/runtime) | 🧩 Browser runtime: request / mobile / logger / auth / mock / env / theme / cdn-loader |
| [`@lhx-kit/renderer`](./packages/renderer) | 🎨 JSON-driven UI renderer for Vue 3 + React |
| [`@lhx-kit/offline`](./packages/offline) | 📦 Offline packaging pipeline for Hybrid Apps |
| [`@lhx-kit/vite-plugin`](./packages/vite-plugin) | ⚡ Vite plugin: MPA orchestration + CDN + chunk strategy |

```text
unkown/
├── apps/
│   └── docs/          📘 Rspress documentation site
├── examples/
│   ├── vmpa/          🟢 Vue3 MPA demo
│   └── rmpa/          🔵 React MPA demo
├── packages/
│   ├── cli/
│   ├── config/
│   ├── runtime/
│   ├── renderer/
│   ├── offline/
│   └── vite-plugin/
├── .github/           🏗️ CI / ISSUE templates / CODEOWNERS / dependabot
├── .husky/            🐕 pre-commit / commit-msg / pre-push hooks
├── .vscode/           🪄 Recommended workspace settings
├── biome.json         🎨 Unified lint + format + organize imports
├── Makefile           🧰 Command aggregator
└── pnpm-workspace.yaml
```

---

## 🚀 Quick start

```bash
# 1. Clone + setup
git clone git@github.com:juwenzhang/lhx-kit.git
cd lhx-kit
make setup                       # pnpm install + pnpm -r build

# 2. Create a new project (outside the repo, or in examples/)
pnpm exec lhx-cli create my-app
cd my-app
pnpm dev

# 3. Explore the existing demos
make dev-vmpa                    # Vue 3 MPA on :4173
make dev-rmpa                    # React MPA on :4174
make docs-dev                    # Documentation site
```

> Requires Node.js `>= 18.18.0`, pnpm `>= 9`.

---

## 📖 Documentation

👉 **https://juwenzhang.github.io/lhx-kit/**

Top reads:

- 🚀 [Getting started](https://juwenzhang.github.io/lhx-kit/guide/getting-started) — 10 min to running
- 🧠 [Architecture overview](https://juwenzhang.github.io/lhx-kit/guide/architecture) — 6-package layered design
- ⚡ [Performance decisions](https://juwenzhang.github.io/lhx-kit/guide/performance) — why we don't split react-dom
- 🌐 [CDN externalization](https://juwenzhang.github.io/lhx-kit/guide/cdn) — the full Preact fallback saga
- 📱 [Mobile adaptation](https://juwenzhang.github.io/lhx-kit/guide/mobile-adaptation) — lib-flexible + desktop guard
- ❓ [FAQ](https://juwenzhang.github.io/lhx-kit/reference/faq) — 19 common questions

---

## 🧰 Development

```bash
make help               # List all available commands

# Quality
make lint               # Biome check
make lint-fix           # Auto-fix
make typecheck          # tsc --noEmit across workspaces
make test               # All unit tests
make check              # lint + typecheck + test (CI bundle)

# Build
make build              # Build every workspace
make build-packages     # Only internal packages
make docs-build         # Build the docs site

# Clean
make clean              # Remove dist/doc_build caches
make reset              # Nuke node_modules + lockfile
```

Full Makefile target list: `make help`.

---

## 🤝 Contributing

PRs are welcome! Please read [`CONTRIBUTING.md`](./CONTRIBUTING.md) for:

- Local dev setup
- Commit message format (Conventional Commits)
- PR checklist

We use:

- 🎨 **Biome** for unified lint + format + organize imports
- 📝 **Commitlint** + **Husky** to enforce commit message conventions
- 🧪 **Vitest** + **Playwright** for tests
- 🏗️ **GitHub Actions** matrix: Node 18/20/22 × Ubuntu/macOS/Windows

By participating you agree to abide by the [Code of Conduct](./CODE_OF_CONDUCT.md).

---

## 🛡️ Security

Please do **not** open public issues for security problems. See [`SECURITY.md`](./SECURITY.md) for private reporting.

---

## 📄 License

[MIT](./LICENSE) © luhanxin

---

<p align="center">
  Built with ❤️ in China · Made for real products, not demos
</p>
