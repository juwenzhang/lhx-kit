# lhx-kit

> 🧰 一个能直接上手的 Monorepo 级 MPA 工具链。不是"hello world + Vite"——是**第一天就带着路由、状态、请求、Mock、CI、Docker、离线打包、AI issue 处理**齐活的真实项目脚手架。

<p align="center">
  <a href="https://juwenzhang.github.io/lhx-kit/"><strong>📖 文档</strong></a> ·
  <a href="https://juwenzhang.github.io/lhx-kit/guide/project-walkthrough"><strong>🛠️ 完整搭建流程</strong></a> ·
  <a href="./README.md"><strong>🇺🇸 English</strong></a> ·
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

## ✨ 为什么选 lhx-kit

| 痛点 | lhx-kit 的答案 |
| --- | --- |
| 🔀 `webpack.config` / `package.json scripts` / `routes.json` 互相失联 | 一个 `project.config.ts` 统领 CLI + Vite 插件 + 离线 + 运行时 |
| 🐘 React-dom 192 KB——"拆一下不就行了" | 物理上拆不了，附数据证明。真正做法：家族分组 + 10KB minChunkSize + CDN 外挂 |
| 📱 移动端适配全靠抄来抄去 | `setupMobile({maxWidth: 750})` + postcss-pxtorem + 桌面端居中守卫 |
| 📦 Hybrid App 离线包没统一标准 | `lhx-cli offline build` → manifest.json + sha256 + brotli + inspect |
| 🧪 配 ESLint/Prettier/Husky/Vitest/Playwright 一整天就没了 | 脚手架出来的项目一次性带齐，还顺手给你 Docker + CI |
| 🚀 npm 发包必须配长期 `NPM_TOKEN` | **Trusted Publishing**（GitHub OIDC）——零 secret，每次发布都带 provenance 签名 |
| 🤖 手动处理 issue 累到怀疑人生 | 免费 **GitHub Models** 驱动的 issue 自动分类 / 问答 / 总结 |
| 👀 PR review / autofix / 文档起草都要花大价钱买 SaaS | 内置 **三模型 PR 评审**（GPT-4o + Llama 3.3 + DeepSeek V3）· `@bot-fix-lint` 自动修复 · `@ai-bot fix` 带门禁的代码修复 · `@ai-docs` 文档助手 —— 全部跑在免费的 GitHub Models |
| 🧩 在 monorepo 里新建一个子包全靠复制粘贴 | `lhx-cli add package <name>` 自动识别 monorepo 根、生成 tsup + tsconfig + README 骨架，配套 `create-package` skill，AI agent 也能一行指令搞定 |

---

## 📦 包 — 全部已发布，全部带 Trusted Publishing 签名

| 包 | 版本 | 简介 |
| --- | --- | --- |
| [`@lhx-kit/cli`](./packages/cli) | ![npm](https://img.shields.io/npm/v/@lhx-kit/cli.svg) | ⚙️ CLI —— create / **add package** / add route|store|mock / dev / build / doctor / offline / skills |
| [`@lhx-kit/config`](./packages/config) | ![npm](https://img.shields.io/npm/v/@lhx-kit/config.svg) | 🧭 SSOT 配置加载器（zod + jiti） |
| [`@lhx-kit/runtime`](./packages/runtime) | ![npm](https://img.shields.io/npm/v/@lhx-kit/runtime.svg) | 🧩 浏览器运行时：request / mobile / logger / auth / mock / env / theme / cdn-loader |
| [`@lhx-kit/renderer`](./packages/renderer) | ![npm](https://img.shields.io/npm/v/@lhx-kit/renderer.svg) | 🎨 配置驱动 UI 渲染器（Vue 3 + React 双端） |
| [`@lhx-kit/offline`](./packages/offline) | ![npm](https://img.shields.io/npm/v/@lhx-kit/offline.svg) | 📦 离线打包：并发哈希、brotli、inspect |
| [`@lhx-kit/vite-plugin`](./packages/vite-plugin) | ![npm](https://img.shields.io/npm/v/@lhx-kit/vite-plugin.svg) | ⚡ Vite 插件：MPA 编排 + CDN + chunk 策略（兼容 Rolldown） |
| [`@lhx-kit/skills`](./packages/skills) | ![npm](https://img.shields.io/npm/v/@lhx-kit/skills.svg) | 🧠 共享技能注册表 —— AI agent 和 CLI 跑**同一份**代码路径（create-package / add-route …） |
| [`@lhx-kit/tsconfig`](./packages/tsconfig) | ![npm](https://img.shields.io/npm/v/@lhx-kit/tsconfig.svg) | 🗂️ 下游项目共享的 TS 配置 |

```text
lhx-kit/
├── apps/
│   └── docs/          📘 Rspress 文档站（自动部署到 GitHub Pages）
├── examples/
│   ├── vmpa/          🟢 Vue 3 MPA 示例
│   └── rmpa/          🔵 React MPA 示例
├── packages/          📦 8 个可发布 workspace（见上表）
├── .github/
│   ├── workflows/
│   │   ├── ci.yaml                  ✅ Lint / typecheck / 构建 / 跨平台
│   │   ├── release.yaml             🚀 Changesets + Trusted Publishing
│   │   ├── rspress-docs-ci-cd.yaml  📘 文档站部署
│   │   ├── ai-triage.yaml           🤖 新 issue 自动打标签 + 欢迎
│   │   ├── ai-assistant.yaml        💬 评论 @ai-bot 触发问答
│   │   ├── ai-summarize.yaml        🏷️ 打 ai-summary 标签触发 TL;DR
│   │   ├── ai-review-gpt.yaml       👀 PR 评审 —— GPT-4o（正确性 + 安全）
│   │   ├── ai-review-llama.yaml     👀 PR 评审 —— Llama 3.3 70B（架构 + 文档）
│   │   ├── ai-review-deepseek.yaml  👀 PR 评审 —— DeepSeek V3（推理链 + 边界条件）
│   │   ├── ai-autofix.yaml          🔧 @bot-fix-lint → Biome 确定性修复（不走 LLM）
│   │   ├── ai-code-fix.yaml         🛠️ @ai-bot fix → 带门禁的 AI 补丁 → 自检 → Draft PR
│   │   └── ai-docs-assistant.yaml   📝 @ai-docs draft/polish —— README/文档助手
│   └── SETUP.md                     📋 一次性仓库配置清单
├── .husky/             🐕 pre-commit / commit-msg / pre-push 钩子（biome + typecheck）
├── .vscode/            🪄 推荐的工作区设置
├── biome.json          🎨 统一 lint + format + organize imports
├── commitlint.config   📝 Conventional Commits + 16 个受控 scope
├── Makefile            🧰 命令聚合器
└── pnpm-workspace.yaml 📦 `packages/*` + `apps/*` + `examples/*`
```

---

## 🚀 3 分钟上手

```bash
# 1. 克隆 + 初始化
git clone git@github.com:juwenzhang/lhx-kit.git
cd lhx-kit
make setup                       # pnpm install + pnpm -r build

# 2. 在仓库外新建一个项目
pnpm exec lhx-cli create my-app
cd my-app && pnpm dev

# 3. 或者直接跑示例
make dev-vmpa                    # Vue 3 MPA 跑在 :4173
make dev-rmpa                    # React MPA 跑在 :4174
make docs-dev                    # 文档站

# 4. 在本 monorepo 里新建一个子包
pnpm exec lhx-cli add package my-utility   # 自动识别 monorepo 根、
                                           # 生成 tsup + tsconfig + README 骨架
                                           # （CLI 和 create-package skill 走同一条代码路径）
```

> 需要 Node.js `>= 18.18.0` 和 pnpm `>= 9`。

---

## 🏗️ 工程化亮点 —— 一个 2026 年开源 monorepo 的参考答案

这个仓库不只是个脚手架，更是一份 **真实落地的 JS Monorepo 工程化范本**：

### 📦 发布流水线 —— 零 secret、每版都带 provenance 签名
- **Changesets** 管每个包的版本号；`fixed` 组策略让 8 个 `@lhx-kit/*` 永远同步同一版本
- **npm Trusted Publishing（OIDC）** —— 不需要 `NPM_TOKEN`；每次发布由 GitHub 出示 OIDC 身份证换取一次性发布凭据，产物自动带 sigstore 签名的 **provenance 证明**
- 完整手册：[发布流水线：Changesets + Trusted Publishing](https://juwenzhang.github.io/lhx-kit/engineering/release-pipeline)

### ⚙️ CI 策略 —— paths 白名单、跨平台 lockfile、frozen install
- 所有 workflow 都用 `paths` 白名单 → 改文档不触发 CI
- `pnpm.supportedArchitectures` 声明 Linux/macOS/Windows + glibc/musl → lockfile 里登记每个平台的原生二进制 → **Windows runner 再也不会报 `Cannot find module @rollup/rollup-win32-x64-msvc`**
- `--frozen-lockfile` 贯穿；本地 pre-push 钩子跑 biome + typecheck，CI 只做兜底
- 完整手册：[CI 策略](https://juwenzhang.github.io/lhx-kit/engineering/ci-strategy)

### 🤖 AI 自动流 —— 免费（GitHub Models），零 API key

全部 8 条 workflow 基于 `actions/ai-inference@v1` + `permissions: models: read`，不依赖任何外部 API key，也不依赖付费 SaaS：

**Issue 生命周期**
- **ai-triage** —— 新 issue 自动打标签（最多 5 个）+ body 太短自动打 `needs-reproduction` + 语言自适应欢迎评论
- **ai-assistant** —— 在任意 issue/PR 评论 `@ai-bot 问题`，机器人读 README + issue 上下文 + 最近 5 条评论后给出扎实答案
- **ai-summarize** —— 给 issue 打 `ai-summary` 标签，自动生成结构化 TL;DR（要点 / 决议 / 待办 / 下一步）

**PR 生命周期**
- **ai-review-gpt** —— GPT-4o 专注正确性、安全、破坏性变更
- **ai-review-llama** —— Meta Llama 3.3 70B 专注架构、文档、命名一致性
- **ai-review-deepseek** —— DeepSeek V3 专注边界条件、推理链、测试覆盖 —— 三个独立的视角分别来自 OpenAI / Meta / DeepSeek 三条不同的训练 pipeline
- **ai-autofix** —— 在 PR 评论 `@bot-fix-lint` → 直接跑 `biome check --write`，**整个链路不经过 LLM**（确定性强，安全可预期）
- **ai-code-fix** —— 评论 `@ai-bot fix <提示>` → 4 层门禁（actor 权限 + 文件白名单 + diff 大小上限 + 人工 label）→ AI 补丁 → 自检（typecheck + lint + test）→ 失败自动迭代一次 → 开 **Draft PR**（绝不直接推 main）

**文档工作流**
- **ai-docs-assistant** —— `@ai-docs draft <主题>` 脚手架一个新 MD；`@ai-docs polish <路径>` 原地润色现有文档——都走 Draft PR

8 条 workflow 都带签名 marker 防机器人互相无限唤醒。完整手册：[GitHub AI 自动流（零成本）](https://juwenzhang.github.io/lhx-kit/engineering/ai-automation) · [AI 评审策略](https://juwenzhang.github.io/lhx-kit/engineering/ai-review-strategy)

### 🎨 工具选型
| 关注点 | 工具 | 备注 |
| --- | --- | --- |
| Lint / 格式化 / import 排序 | 🎨 **Biome** | 单二进制，比 ESLint+Prettier 快 ~100 倍 |
| Commit message | 📝 **commitlint** | Conventional Commits，16 个受控 scope（cli/runtime/ai/…） |
| Git 钩子 | 🐕 **Husky** | pre-commit → lint-staged；commit-msg → commitlint；pre-push → biome + typecheck |
| 测试 | 🧪 **Vitest** + **Playwright** | 单元 + 跨浏览器 e2e |
| CI matrix | 🏗️ **GitHub Actions** | Node 20/22 on Ubuntu + 跨平台 job 覆盖 Linux/macOS/Windows |
| 文档 | 📘 **Rspress** | 改 `apps/docs/**` 自动部署到 GitHub Pages |

---

## 📖 文档

👉 **https://juwenzhang.github.io/lhx-kit/**

### 推荐阅读

- 🚀 [快速开始](https://juwenzhang.github.io/lhx-kit/guide/getting-started) —— 10 分钟跑起来
- 🛠️ [**完整搭建流程**](https://juwenzhang.github.io/lhx-kit/guide/project-walkthrough) —— **从零到发布包的全路径深度总结**
- 🧠 [架构总览](https://juwenzhang.github.io/lhx-kit/guide/architecture) —— 8 包分层设计
- ⚡ [性能优化决策](https://juwenzhang.github.io/lhx-kit/guide/performance) —— 为什么 react-dom 不能拆
- 🌐 [CDN 外挂方案](https://juwenzhang.github.io/lhx-kit/guide/cdn) —— Preact fallback 整套逻辑
- 📱 [移动端适配](https://juwenzhang.github.io/lhx-kit/guide/mobile-adaptation) —— lib-flexible + 桌面端守卫

### 专题深度文章

- 🛠️ **[工程化专栏](https://juwenzhang.github.io/lhx-kit/engineering/overview)** —— 发布流水线 · CI 策略 · AI 自动流 · (规划中) Commit/PR 规范
- 📦 [离线打包深度剖析](https://juwenzhang.github.io/lhx-kit/offline/packaging-deep-dive) —— 压缩库、哈希、算法对比
- 🧩 [Vite 插件实现详解](https://juwenzhang.github.io/lhx-kit/runtime/vite-plugin) —— manifest 驱动的 chunk 分组
- 🔥 [Rolldown 迁移记](https://juwenzhang.github.io/lhx-kit/runtime/rolldown-migration) —— Vite 8 如何打破我们的 `generateBundle`

---

## 🧰 开发

```bash
make help               # 列出所有可用命令

# 质量
make lint               # Biome 检查
make lint-fix           # 自动修复
make typecheck          # 全 workspace tsc --noEmit
make test               # 全部单测
make check              # lint + typecheck + test（CI 三合一）

# 构建
make build              # 所有 workspace
make build-packages     # 只构建内部包
make docs-build         # 构建文档站

# 文档维护
make sync-readmes       # 重新生成所有 @lhx-kit/* 包 README 的 managed footer（幂等）

# 清理
make clean              # 清除 dist / doc_build 缓存
make reset              # 清除 node_modules + lockfile
```

完整 Makefile：`make help`。

---

## 🤝 参与贡献

欢迎 PR！请先阅读 [`CONTRIBUTING.md`](./CONTRIBUTING.md)：

- 本地开发环境搭建
- Commit 格式（Conventional Commits, `<type>(<scope>): <subject>`）
- PR 检查清单
- 用户可见变更需要写 changeset（`pnpm changeset`）

**第一次提 PR？** 可以从带 [`good first issue`](https://github.com/juwenzhang/lhx-kit/labels/good%20first%20issue) 或 [`help wanted`](https://github.com/juwenzhang/lhx-kit/labels/help%20wanted) 标签的 issue 入手。

**有问题？** 开个 issue，AI 机器人会先做分类，维护者紧接着跟进。你也可以在任意已有 issue 里评论 `@ai-bot <你的问题>` 得到基于 README 和当前讨论的即时回复。

参与即表示你同意 [行为准则](./CODE_OF_CONDUCT.md)。

---

## 🛡️ 安全

**不要**在公开 issue 里报告安全问题。请阅读 [`SECURITY.md`](./SECURITY.md) 了解私下报告渠道。

每个已发布的包都带 **[provenance 证明](https://docs.npmjs.com/generating-provenance-statements)** —— 你可以在 npmjs.com 的包页面上校验某个 tarball 确实是本仓库在某个 commit 上构建的。

---

## 📄 License

[MIT](./LICENSE) © luhanxin

---

<p align="center">
  在中国用 ❤️ 构建 · 为真实产品而生，不是演示
</p>
