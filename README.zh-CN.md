# lhx-kit

> 🧰 一套 monorepo 级工程化工具链，脚手架生成**可上生产**的 MPA 项目。不是"hello world + Vite"，而是第一天就有路由、状态、请求、Mock、CI、Docker、测试的**完整项目**。

<p align="center">
  <a href="https://juwenzhang.github.io/lhx-kit/"><strong>📖 文档</strong></a> ·
  <a href="./README.md"><strong>🇬🇧 English</strong></a> ·
  <a href="https://github.com/juwenzhang/lhx-kit"><strong>⭐ GitHub</strong></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D18.18-brightgreen" alt="node" />
  <img src="https://img.shields.io/badge/pnpm-%3E%3D9-f69220" alt="pnpm" />
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT" />
  <img src="https://img.shields.io/badge/PRs-欢迎-brightgreen" alt="PRs welcome" />
</p>

---

## ✨ 解决了什么

| 传统痛点 | lhx-kit 的答案 |
| --- | --- |
| 🔀 `webpack.config` + `package.json scripts` + `routes.json` 三处不同步 | 一份 `project.config.ts` 驱动 CLI + Vite 插件 + 离线 + 运行时 |
| 🐘 react-dom 192 KB——"那就拆呗" | 物理上拆不开，有数据佐证。改用：家族分组 + 10KB 自动合并 + CDN 外挂 |
| 📱 移动端适配每次都 copy-paste | `setupMobile({maxWidth: 750})` + postcss-pxtorem + 桌面居中护栏 |
| 📦 Hybrid App 离线包没标准 | `lhx-cli offline build` → manifest.json + sha256 + zip |
| 🧪 ESLint/Prettier/Husky/Vitest/Playwright 搭一天 | 脚手架一键生成，外加 Docker + CI |

---

## 📦 包结构

| 包名 | 描述 |
| --- | --- |
| [`@lhx-kit/cli`](./packages/cli) | ⚙️ CLI — create / add / dev / build / doctor / offline |
| [`@lhx-kit/config`](./packages/config) | 🧭 SSOT 配置加载器（zod + jiti） |
| [`@lhx-kit/runtime`](./packages/runtime) | 🧩 浏览器运行时：request / mobile / logger / auth / mock / env / theme / cdn-loader |
| [`@lhx-kit/renderer`](./packages/renderer) | 🎨 JSON 驱动的 Vue 3 + React UI 渲染器 |
| [`@lhx-kit/offline`](./packages/offline) | 📦 Hybrid App 离线打包管线 |
| [`@lhx-kit/vite-plugin`](./packages/vite-plugin) | ⚡ Vite 插件：MPA 编排 + CDN + chunk 策略 |

```text
unkown/
├── apps/
│   └── docs/          📘 Rspress 文档站
├── examples/
│   ├── vmpa/          🟢 Vue3 MPA 示例
│   └── rmpa/          🔵 React MPA 示例
├── packages/
│   ├── cli/
│   ├── config/
│   ├── runtime/
│   ├── renderer/
│   ├── offline/
│   └── vite-plugin/
├── .github/           🏗️ CI / ISSUE 模板 / CODEOWNERS / dependabot
├── .husky/            🐕 pre-commit / commit-msg / pre-push hooks
├── .vscode/           🪄 工作区推荐配置
├── biome.json         🎨 统一 lint + format + organize imports
├── Makefile           🧰 命令聚合器
└── pnpm-workspace.yaml
```

---

## 🚀 快速开始

```bash
# 1. Clone 与准备
git clone git@github.com:juwenzhang/lhx-kit.git
cd lhx-kit
make setup                       # pnpm install + pnpm -r build

# 2. 创建新项目（仓库外、或在 examples/）
pnpm exec lhx-cli create my-app
cd my-app
pnpm dev

# 3. 或看现成的示例
make dev-vmpa                    # Vue 3 MPA，端口 4173
make dev-rmpa                    # React MPA，端口 4174
make docs-dev                    # 文档站
```

> 需要 Node.js `>= 18.18.0`、pnpm `>= 9`。

---

## 📖 文档

👉 **https://juwenzhang.github.io/lhx-kit/**

推荐阅读顺序：

- 🚀 [快速开始](https://juwenzhang.github.io/lhx-kit/guide/getting-started) — 10 分钟跑起来
- 🧠 [架构总览](https://juwenzhang.github.io/lhx-kit/guide/architecture) — 6 个包的分层设计
- ⚡ [性能优化](https://juwenzhang.github.io/lhx-kit/guide/performance) — 为什么不拆 react-dom
- 🌐 [CDN 外挂](https://juwenzhang.github.io/lhx-kit/guide/cdn) — 完整 Preact 踩坑记录
- 📱 [移动端适配](https://juwenzhang.github.io/lhx-kit/guide/mobile-adaptation) — lib-flexible + 桌面护栏
- ❓ [FAQ](https://juwenzhang.github.io/lhx-kit/reference/faq) — 19 个常见问题

---

## 🧰 开发

```bash
make help               # 列出所有命令

# 质量
make lint               # Biome 扫全仓
make lint-fix           # 自动修复
make typecheck          # 全 workspace tsc --noEmit
make test               # 所有单测
make check              # lint + typecheck + test（CI 组合）

# 构建
make build              # 构建所有 workspace
make build-packages     # 仅内部包
make docs-build         # 构建文档站

# 清理
make clean              # 清 dist / doc_build
make reset              # 核弹级：删 node_modules + lockfile
```

完整 Makefile 命令列表：`make help`。

---

## 🤝 贡献

欢迎 PR！请先阅读 [`CONTRIBUTING.md`](./CONTRIBUTING.md)，包括：

- 本地开发环境搭建
- Commit message 规范（Conventional Commits）
- PR checklist

技术栈：

- 🎨 **Biome** — 统一 lint + format + organize imports
- 📝 **Commitlint** + **Husky** — 强制 commit 消息规范
- 🧪 **Vitest** + **Playwright** — 单测 + E2E
- 🏗️ **GitHub Actions** — Node 18/20/22 × Ubuntu/macOS/Windows 矩阵

参与本项目即表示你同意遵守 [行为准则](./CODE_OF_CONDUCT.md)。

---

## 🛡️ 安全

**不要**在公开 Issue 报告安全问题。请按 [`SECURITY.md`](./SECURITY.md) 流程私下联系。

---

## 📄 License

[MIT](./LICENSE) © luhanxin

---

<p align="center">
  用心打磨 ❤️ 专为真实业务设计，不是 demo
</p>
