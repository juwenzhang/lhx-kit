# lhx-kit

> 🧰 A monorepo-grade toolchain that scaffolds real-world MPA projects. Not "hello world + Vite" — a project that ships with routing, state, request, Mock, CI, Docker, offline packaging, AI-powered issue triage and everything else your team actually needs on day one.

<p align="center">
  <a href="https://juwenzhang.github.io/lhx-kit/"><strong>📖 Documentation</strong></a> ·
  <a href="https://juwenzhang.github.io/lhx-kit/guide/project-walkthrough"><strong>🛠️ Full walkthrough</strong></a> ·
  <a href="./README.zh-CN.md"><strong>🇨🇳 中文</strong></a> ·
  <a href="https://github.com/juwenzhang/lhx-kit"><strong>⭐ GitHub</strong></a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@lhx-kit/cli"><img src="https://img.shields.io/npm/v/@lhx-kit/cli.svg?label=%40lhx-kit%2Fcli" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@lhx-kit/cli"><img src="https://img.shields.io/badge/provenance-verified-brightgreen?logo=npm" alt="provenance" /></a>
  <a href="https://github.com/juwenzhang/lhx-kit/actions/workflows/ci.yaml"><img src="https://github.com/juwenzhang/lhx-kit/actions/workflows/ci.yaml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/juwenzhang/lhx-kit/actions/workflows/release.yaml"><img src="https://github.com/juwenzhang/lhx-kit/actions/workflows/release.yaml/badge.svg" alt="Release" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D18.18-brightgreen" alt="node" />
  <img src="https://img.shields.io/badge/pnpm-%3E%3D9-f69220" alt="pnpm" />
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT" />
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs welcome" />
  <img src="https://img.shields.io/badge/npm-Trusted%20Publishing-blue?logo=npm" alt="Trusted Publishing" />
  <img src="https://img.shields.io/badge/AI-GitHub%20Models-5319e7?logo=github" alt="GitHub Models" />
</p>

---

## ✨ Why lhx-kit

| Pain point | lhx-kit's answer |
| --- | --- |
| 🔀 `webpack.config` + `package.json scripts` + `routes.json` out of sync | Single `project.config.ts` drives CLI + Vite plugin + offline + runtime |
| 🐘 React-dom is 192 KB — "just split it" | Physical impossibility + data to prove it. Instead: family grouping + 10KB minChunkSize + CDN externalization |
| 📱 Mobile adaptation is copy-paste hell | `setupMobile({maxWidth: 750})` + postcss-pxtorem + desktop centering guard |
| 📦 Hybrid App offline packaging has no standard | `lhx-cli offline build` → manifest.json + sha256 + brotli + inspect |
| 🧪 Setting up ESLint/Prettier/Husky/Vitest/Playwright eats a whole day | Scaffolded project gets all of it, plus Docker + CI, on day one |
| 🚀 npm publishing needs long-lived `NPM_TOKEN` secrets | **Trusted Publishing** (GitHub OIDC) — zero secrets, every release signed with provenance |
| 🤖 Triaging issues by hand is exhausting | **GitHub Models**-powered triage / Q&A / summarize — free, no API key |

---

## 📦 Packages — all published, all Trusted-Publishing signed

| Package | Version | Description |
| --- | --- | --- |
| [`@lhx-kit/cli`](./packages/cli) | ![npm](https://img.shields.io/npm/v/@lhx-kit/cli.svg) | ⚙️ CLI — create / add / dev / build / doctor / offline |
| [`@lhx-kit/config`](./packages/config) | ![npm](https://img.shields.io/npm/v/@lhx-kit/config.svg) | 🧭 SSOT config loader with zod + jiti |
| [`@lhx-kit/runtime`](./packages/runtime) | ![npm](https://img.shields.io/npm/v/@lhx-kit/runtime.svg) | 🧩 Browser runtime: request / mobile / logger / auth / mock / env / theme / cdn-loader |
| [`@lhx-kit/renderer`](./packages/renderer) | ![npm](https://img.shields.io/npm/v/@lhx-kit/renderer.svg) | 🎨 JSON-driven UI renderer for Vue 3 + React |
| [`@lhx-kit/offline`](./packages/offline) | ![npm](https://img.shields.io/npm/v/@lhx-kit/offline.svg) | 📦 Offline packaging pipeline: concurrent hashing, brotli, inspect |
| [`@lhx-kit/vite-plugin`](./packages/vite-plugin) | ![npm](https://img.shields.io/npm/v/@lhx-kit/vite-plugin.svg) | ⚡ Vite plugin: MPA orchestration + CDN + chunk strategy (Rolldown-ready) |
| [`@lhx-kit/skills`](./packages/skills) | ![npm](https://img.shields.io/npm/v/@lhx-kit/skills.svg) | 🧠 Shared skill registry for CLI prompts |
| [`@lhx-kit/tsconfig`](./packages/tsconfig) | ![npm](https://img.shields.io/npm/v/@lhx-kit/tsconfig.svg) | 🗂️ Shared TS configs for downstream projects |

```text
lhx-kit/
├── apps/
│   └── docs/          📘 Rspress documentation site (publishes to GitHub Pages)
├── examples/
│   ├── vmpa/          🟢 Vue 3 MPA demo
│   └── rmpa/          🔵 React MPA demo
├── packages/          📦 8 publishable workspaces (see table above)
├── .github/
│   ├── workflows/
│   │   ├── ci.yaml                  ✅ Lint / typecheck / build / cross-platform
│   │   ├── release.yaml             🚀 Changesets + Trusted Publishing
│   │   ├── rspress-docs-ci-cd.yaml  📘 Docs site deploy
│   │   ├── ai-triage.yaml           🤖 New-issue auto labels + welcome
│   │   ├── ai-assistant.yaml        💬 @ai-bot Q&A on any issue
│   │   └── ai-summarize.yaml        🏷️ Label-triggered TL;DR
│   └── SETUP.md                     📋 One-time repo setup checklist
├── .husky/             🐕 pre-commit / commit-msg / pre-push hooks (biome + typecheck)
├── .vscode/            🪄 Recommended workspace settings
├── biome.json          🎨 Unified lint + format + organize imports
├── commitlint.config   📝 Conventional Commits + scoped (engineering / ai / ...)
├── Makefile            🧰 Command aggregator
└── pnpm-workspace.yaml 📦 `packages/*` + `apps/*` + `examples/*`
```

---

## 🚀 Quick start (3 minutes)

```bash
# 1. Clone + setup
git clone git@github.com:juwenzhang/lhx-kit.git
cd lhx-kit
make setup                       # pnpm install + pnpm -r build

# 2. Create a new project (outside the repo)
pnpm exec lhx-cli create my-app
cd my-app && pnpm dev

# 3. Or explore the existing demos
make dev-vmpa                    # Vue 3 MPA on :4173
make dev-rmpa                    # React MPA on :4174
make docs-dev                    # Documentation site
```

> Requires Node.js `>= 18.18.0` and pnpm `>= 9`.

---

## 🏗️ How the sausage is made — engineering highlights

This repo is not just a scaffold; it's a **real-world reference project** for how to run a polished open-source JS monorepo in 2026:

### 📦 Release pipeline — zero-secret, provenance-signed
- **Changesets** governs per-package versioning with a `fixed` group that keeps all `@lhx-kit/*` in lock-step
- **npm Trusted Publishing (OIDC)** — no `NPM_TOKEN` secret; GitHub issues a short-lived publish credential per release, and every published tarball carries a sigstore-backed **provenance** attestation
- Read the full playbook: [Release pipeline: Changesets + Trusted Publishing](https://juwenzhang.github.io/lhx-kit/engineering/release-pipeline)

### ⚙️ CI strategy — paths allow-list, cross-platform lockfile, frozen install
- `paths` allow-list on every workflow → docs-only pushes skip CI entirely
- `pnpm.supportedArchitectures` declares Linux/macOS/Windows + glibc/musl → lockfile stores every platform's native binaries → **no more `Cannot find module @rollup/rollup-win32-x64-msvc` on Windows runners**
- `--frozen-lockfile` is universal; pre-push hook runs biome + typecheck locally so CI is strictly a safety net
- Read the full playbook: [CI strategy](https://juwenzhang.github.io/lhx-kit/engineering/ci-strategy)

### 🤖 AI automation — free (GitHub Models), zero API keys
- **ai-triage** — every new issue gets auto-labeled (up to 5 labels), optionally marked `needs-reproduction`, and welcomed in the issue's own language
- **ai-assistant** — comment `@ai-bot <question>` on any issue/PR; the bot reads README + issue context + last 5 comments and replies with grounded answers
- **ai-summarize** — label an issue `ai-summary` and get a structured TL;DR (key points / decisions / open questions / next step)
- All three run on **GitHub Models** (free for public repos, no secret keys), with signature markers to prevent bot-loop-back
- Read the full playbook: [GitHub AI automation (zero-cost)](https://juwenzhang.github.io/lhx-kit/engineering/ai-automation)

### 🎨 Tooling
| Concern | Tool | Notes |
| --- | --- | --- |
| Lint / format / organize imports | 🎨 **Biome** | Single binary, ~100× faster than ESLint+Prettier |
| Commit messages | 📝 **commitlint** | Conventional Commits with a 16-scope enum (cli/runtime/ai/…) |
| Git hooks | 🐕 **Husky** | pre-commit → lint-staged; commit-msg → commitlint; pre-push → biome + typecheck |
| Testing | 🧪 **Vitest** + **Playwright** | Per-package units + cross-browser e2e |
| CI matrix | 🏗️ **GitHub Actions** | Node 20/22 on Ubuntu + cross-platform job on Linux/macOS/Windows |
| Docs | 📘 **Rspress** | Auto-deploys to GitHub Pages on `apps/docs/**` push |

---

## 📖 Documentation

👉 **https://juwenzhang.github.io/lhx-kit/**

### Top reads

- 🚀 [Getting started](https://juwenzhang.github.io/lhx-kit/guide/getting-started) — 10 min to running
- 🛠️ [**Project walkthrough**](https://juwenzhang.github.io/lhx-kit/guide/project-walkthrough) — **from zero to a published package, end to end**
- 🧠 [Architecture overview](https://juwenzhang.github.io/lhx-kit/guide/architecture) — 8-package layered design
- ⚡ [Performance decisions](https://juwenzhang.github.io/lhx-kit/guide/performance) — why we don't split react-dom
- 🌐 [CDN externalization](https://juwenzhang.github.io/lhx-kit/guide/cdn) — the full Preact fallback saga
- 📱 [Mobile adaptation](https://juwenzhang.github.io/lhx-kit/guide/mobile-adaptation) — lib-flexible + desktop guard

### Deep dives by topic

- 🛠️ **[Engineering column](https://juwenzhang.github.io/lhx-kit/engineering/overview)** — Release pipeline · CI strategy · AI automation · (coming) Commit/PR conventions
- 📦 [Offline packaging deep-dive](https://juwenzhang.github.io/lhx-kit/offline/packaging-deep-dive) — compression libs, hashing, algorithms
- 🧩 [Vite plugin internals](https://juwenzhang.github.io/lhx-kit/runtime/vite-plugin) — manifest-driven chunk grouping
- 🔥 [Rolldown migration post-mortem](https://juwenzhang.github.io/lhx-kit/runtime/rolldown-migration) — how Vite 8 broke our `generateBundle`

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
- Commit message format (Conventional Commits, `<type>(<scope>): <subject>`)
- PR checklist
- How to write a changeset (`pnpm changeset`) when your change is user-facing

**Your first PR?** Great issues to start from are labeled [`good first issue`](https://github.com/juwenzhang/lhx-kit/labels/good%20first%20issue) and [`help wanted`](https://github.com/juwenzhang/lhx-kit/labels/help%20wanted).

**Got a question?** Open an issue — the AI triage bot will tag it and a maintainer will follow up. Or drop `@ai-bot <your question>` on any existing issue for an instant answer grounded in the README and current thread.

By participating you agree to abide by the [Code of Conduct](./CODE_OF_CONDUCT.md).

---

## 🛡️ Security

Please do **not** open public issues for security problems. See [`SECURITY.md`](./SECURITY.md) for private reporting.

Every published package carries a **[provenance attestation](https://docs.npmjs.com/generating-provenance-statements)** — you can verify that a given tarball was built by this exact repo at a specific commit by checking the package page on npmjs.com.

---

## 📄 License

[MIT](./LICENSE) © luhanxin

---

<p align="center">
  Built with ❤️ in China · Made for real products, not demos
</p>
