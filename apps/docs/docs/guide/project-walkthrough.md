# 🛠️ 完整搭建流程：从零到一个可发布的 monorepo

> 这一篇把 **lhx-kit 从空仓库到正式发布 + AI 自动化运行**的全过程总结下来，当作"照这个抄一遍就能跑起来一个同级项目"的复盘手册。
>
> 如果你只想用 lhx-kit 本身，看 [快速开始](./getting-started) 就够了。本篇面向**想复制这套工程化方案到自己项目**的开发者。

---

## 🗺️ 全流程地图

```
0. 前置决策 ──▶ 1. 本地脚手架 ──▶ 2. Monorepo 结构 ──▶ 3. 质量基线
                                                              │
                                                              ▼
8. AI 自动流 ◀── 7. 文档站 ◀── 6. 发布流水线 ◀── 5. CI 流水线 ◀── 4. 核心包代码
```

我们一段一段讲，每段都列**做什么 / 为什么这么做 / 坑在哪**。

---

## 0️⃣ 前置决策：选什么工具栈

在写第一行代码前，先把**高影响面**的选择一锤定音。否则改起来要伤筋动骨。

| 决策 | lhx-kit 的选择 | 主要理由 |
| --- | --- | --- |
| 包管理器 | **pnpm 9.x** | Monorepo 原生支持、硬链接节省空间、比 yarn berry 的 PnP 稳 |
| 构建工具 | **Vite 6 + Rolldown**（Vite 8 准备中）| 开发冷启动毫秒级，Rolldown 替 Rollup 性能再翻倍 |
| 语言 | **TypeScript 5.x** | 必选，别想了 |
| Lint / 格式化 | **Biome** | 比 ESLint+Prettier 快约 100 倍，单二进制零心智成本 |
| 文档站 | **Rspress** | Vite 系，Rspack 底子，比 Docusaurus 快数倍 |
| 版本管理 | **Changesets** | Monorepo 版本治理金标准 |
| 发布凭据 | **npm Trusted Publishing（OIDC）** | 零 secret，官方推荐 |
| AI 自动流 | **GitHub Models** | 公开仓库免费，无需 API key |

**两个看起来诱人但我们不选的组合**：

- ❌ Turborepo + yarn：pnpm 原生 monorepo 支持够用，Turborepo 增加一层缓存复杂度对小项目收益不大
- ❌ changesets + NPM_TOKEN 传统方案：2024 年后 npm 官方主推 OIDC，token 方案维护成本高且更不安全

---

## 1️⃣ 本地脚手架：初始化仓库

### Step 1.1 创建仓库骨架

```bash
mkdir lhx-kit && cd lhx-kit
git init
pnpm init
```

编辑 `package.json`，加以下关键字段：

```json
{
  "name": "lhx-kit",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "engines": {
    "node": ">=18.18.0",
    "pnpm": ">=9.0.0"
  },
  "pnpm": {
    "supportedArchitectures": {
      "os": ["darwin", "linux", "win32"],
      "cpu": ["x64", "arm64"],
      "libc": ["glibc", "musl"]
    }
  }
}
```

> ⚠️ `supportedArchitectures` 是 CI 跨平台的关键，详见 [CI 策略](../engineering/ci-strategy)。少了它 Windows CI 会疯狂报 `Cannot find module @rollup/rollup-win32-x64-msvc`。

### Step 1.2 pnpm workspace

根目录建 `pnpm-workspace.yaml`：

```yaml
packages:
  - 'packages/*'
  - 'apps/*'
  - 'examples/*'
```

### Step 1.3 基础配置文件

| 文件 | 作用 |
| --- | --- |
| `tsconfig.base.json` | 所有包继承的 base TS 配置 |
| `biome.json` | 统一 lint + format |
| `commitlint.config.cjs` | Conventional Commits 规则 |
| `lint-staged.config.cjs` | pre-commit 只跑 staged 文件 |
| `.gitignore` | Node + pnpm 标准忽略 |
| `Makefile` | 命令聚合入口 |

> 📖 具体内容可以直接去 [lhx-kit 仓库根目录](https://github.com/juwenzhang/lhx-kit) 抄。

---

## 2️⃣ Monorepo 结构：6 目录分层

```
lhx-kit/
├── apps/        👤 面向用户的最终产物（文档站、dashboard 等）
├── examples/    🧪 集成示例（不发布，当手动冒烟测试用）
├── packages/    📦 可发布的 npm 包（scope: @lhx-kit/*）
├── .github/     🏗️ CI workflows + SETUP 指引 + issue 模板
├── .husky/      🐕 Git 钩子
└── scripts/     🔧 辅助脚本
```

### 为什么区分 apps 和 packages？

- **packages/** 是**发布契约**，改了要写 changeset，用户会直接依赖
- **apps/** 是**产物**，不发布，改了不用 changeset，也不进 `--filter='./packages/*'` 构建范围
- **examples/** 是**示范代码**，用来验证"从用户角度装了包能不能跑"，但**不进 CI 发布门槛**

搞清楚这三者边界，后续很多 workflow filter / changesets 配置都顺了。

---

## 3️⃣ 质量基线：Husky + Biome + Commitlint

### Step 3.1 Biome 统一 lint/format

```bash
pnpm add -D -w @biomejs/biome
```

根目录 `biome.json`：

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2 },
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "organizeImports": { "enabled": true }
}
```

### Step 3.2 Husky + lint-staged + commitlint

```bash
pnpm add -D -w husky lint-staged @commitlint/cli @commitlint/config-conventional
pnpm exec husky init
```

三个钩子：

```bash
# .husky/pre-commit
pnpm exec lint-staged

# .husky/commit-msg
pnpm exec commitlint --edit "$1"

# .husky/pre-push
set -e
echo "🎨 pre-push: biome check..."
pnpm exec biome check .
echo "🔍 pre-push: typecheck..."
pnpm -r --if-present --parallel typecheck
```

> 🔑 **pre-push 一定要加 `set -e`**。不加的话第一步失败后第二步继续跑，最后退 0，推送成功后 CI 挂——本地白忙。

### Step 3.3 commitlint scope 枚举

`commitlint.config.cjs` 里用**警告级（level: 1）**的 scope-enum：

```js
'scope-enum': [
  1,  // 警告不阻断，允许新 scope 自然出现
  'always',
  ['cli', 'runtime', 'renderer', 'offline', 'vite-plugin',
   'docs', 'engineering', 'templates', 'deps', 'ci', 'ai',
   'release', 'repo', /* ... */]
]
```

每次新增模块（比如加了 `ai` 专题）就把 scope 补进去。**level 用 1 不用 2**——硬 enum 阻塞会逼人编造假 scope 绕过。

---

## 4️⃣ 核心包代码：发布前的最后校验

写完每个 `packages/*` 后，**发布前必过的 4 项检查**：

### ✅ 4.1 `package.json#files` 声明白名单

```json
{
  "files": ["dist", "README.md", "LICENSE"],
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts"
}
```

`files` 白名单法**远优于** `.npmignore` 黑名单——不会把 `.env` / `test/` / `src/` 意外发出去。

### ✅ 4.2 `npm pack --dry-run` 验证 tarball 内容

```bash
cd packages/cli
npm pack --dry-run
# 输出会列出将要发布的每个文件。看一遍，确认没奇怪东西。
```

### ✅ 4.3 `publishConfig.access: public`

scoped 包（`@scope/name`）默认是 private 的，第一次发布会 403。必须：

```json
{
  "publishConfig": {
    "access": "public"
  }
}
```

### ✅ 4.4 内部依赖用 `workspace:^`

```json
{
  "dependencies": {
    "@lhx-kit/runtime": "workspace:^"
  }
}
```

Changesets 发布时会自动把 `workspace:^` 替换成真实版本号（比如 `^0.0.3`）写进 tarball 的 `package.json`。**不要手写版本号**，否则每次 bump 都要手动改。

---

## 5️⃣ CI 流水线：`.github/workflows/ci.yaml`

### 核心设计

```yaml
on:
  push:
    branches: [master, main]
    paths:
      - 'packages/**'
      - 'package.json'
      - 'pnpm-lock.yaml'
      - 'biome.json'
      - 'tsconfig.base.json'
      - '.github/workflows/ci.yaml'  # ← 改 workflow 自己也要触发
  pull_request: { ... }
  workflow_dispatch:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true           # 同 PR 新 push 取消旧 run

permissions:
  contents: read                     # 最小权限
```

### 4 个 job 分工

| Job | 做什么 |
| --- | --- |
| `lint` | biome check 全仓 |
| `commitlint` | 只在 PR 触发，扫整段 commits |
| `typecheck-build` | Node 20/22 矩阵，packages 构建 + 全 workspace typecheck |
| `cross-platform` | Ubuntu/macOS/Windows 三平台跑 `pnpm --filter '@lhx-kit/*' build` |

### 容易踩的 2 个坑

1. **`pnpm install --offline` 在 pnpm 9 下不重建 bin symlink** → examples 里 `lhx-cli` command not found。改 `pnpm install --frozen-lockfile --prefer-offline`。
2. **Windows 跑 Rollup 报 `Cannot find module @rollup/rollup-win32-x64-msvc`** → 根 `package.json` 加 `pnpm.supportedArchitectures`（见 Step 1.1）+ `pnpm install --lockfile-only --force` 重写 lockfile。

> 📖 完整分析见 [CI 策略](../engineering/ci-strategy)。

---

## 6️⃣ 发布流水线：Changesets + Trusted Publishing

这是全流程最重的一章。**但配好之后永久免维护**。

### Step 6.1 安装 Changesets

```bash
pnpm add -D -w @changesets/cli @changesets/changelog-github
pnpm exec changeset init
```

### Step 6.2 改 `.changeset/config.json`

```json
{
  "$schema": "https://unpkg.com/@changesets/config@latest/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [["@lhx-kit/*"]],         // ← 8 个包同步版本
  "linked": [],
  "access": "public",
  "baseBranch": "master",
  "updateInternalDependencies": "patch",
  "ignore": []
}
```

### Step 6.3 添加 Release workflow

```yaml
# .github/workflows/release.yaml
name: Release

on:
  push:
    branches: [master]               # ← 没有 paths 过滤！

permissions:
  contents: write
  pull-requests: write
  id-token: write                    # ← OIDC 必需

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
          registry-url: https://registry.npmjs.org

      # 🔑 关键：升级 npm，否则 OIDC publish 会 E404
      - run: npm install -g npm@latest

      - run: pnpm install --frozen-lockfile
      - run: pnpm -r --filter='./packages/*' build

      - uses: changesets/action@v1
        with:
          publish: pnpm release
          version: pnpm run version
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_CONFIG_PROVENANCE: "true"
          # ⚠️ 注意：没有 NPM_TOKEN！
```

### Step 6.4 一次性：首版手动发布

Trusted Publishing **要求包在 npm 上已经存在过一次**。第一次必须手动：

```bash
# 本地 npm login
npm login

cd packages/cli
npm publish --access public
# 重复 8 次
```

### Step 6.5 一次性：在 npm 网页配 Trusted Publisher

对每个已发布包，打开 `https://www.npmjs.com/package/@scope/name/access`：

| 字段 | 值 |
| --- | --- |
| Publisher | GitHub Actions |
| Organization or user | **你的 GitHub 用户名**（不是 npm 用户名） |
| Repository | 仓库短名（不带 URL，不带组织前缀） |
| Workflow filename | `release.yaml`（**注意 .yaml 不是 .yml**） |
| Environment name | *（留空）* |

### Step 6.6 常规工作流

```bash
# 1. 写完 feature
pnpm changeset           # 交互式生成 .changeset/xxx.md
git add .changeset/
git commit -m "feat(cli): add --watch flag"
git push

# 2. Release workflow 自动开一个 "Version Packages" PR

# 3. 人工 review PR → merge

# 4. merge 触发 Release workflow 再跑一次 → publish → 完成
```

### 🚨 这一章最大的坑

**E404 Not Found on npm publish，但 provenance 签名却成功了**——这不是 Trusted Publisher 配错！是 **npm CLI < 11.5.1 不支持 OIDC token 交换端点**。Node 20 默认带的 npm 10.x 就是这种老版本。

解法就是 Step 6.3 里那行 `npm install -g npm@latest`。不加这行，会出现"provenance 成功 / PUT 404"这种极其误导的错误链。

> 📖 完整排查见 [发布流水线](../engineering/release-pipeline)。

---

## 7️⃣ 文档站：Rspress → GitHub Pages

### Step 7.1 新建 `apps/docs/`

```bash
mkdir -p apps/docs/docs
cd apps/docs
pnpm add -D rspress
```

### Step 7.2 `rspress.config.ts` 最小配置

```ts
import {defineConfig} from 'rspress/config';

export default defineConfig({
  root: 'docs',
  base: '/lhx-kit/',                 // ← GitHub Pages 子路径
  lang: 'zh',
  title: 'lhx-kit',
  themeConfig: {
    nav: [ /* 顶栏 */ ],
    sidebar: { '/guide/': [...] }
  }
});
```

### Step 7.3 Docs 部署 workflow

```yaml
# .github/workflows/rspress-docs-ci-cd.yaml
name: Deploy Docs to GitHub Pages

on:
  push:
    branches: [master, main]
    paths:
      - 'apps/docs/**'
      - 'pnpm-lock.yaml'
      - '.github/workflows/rspress-docs-ci-cd.yaml'
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - uses: actions/configure-pages@v5
      - run: pnpm install --frozen-lockfile
      - run: pnpm run docs:build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: apps/docs/doc_build

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

### Step 7.4 一次性：仓库开启 GitHub Pages

Settings → Pages → **Source** 选 **GitHub Actions**（不是 Deploy from a branch）。

> 📖 完整细节见 [Rspress 官方文档](https://rspress.dev/)。

---

## 8️⃣ AI 自动流：GitHub Models（零成本）

### Step 8.1 理解 GitHub Models

2024 年底 GitHub 给所有仓库开放的免费 LLM API——workflow 里加一行 `permissions: models: read` 就能用 GPT-4o / Claude / Llama 等模型，**不需要任何 API key**。

### Step 8.2 部署 3 个 workflow

| Workflow | 触发 | 用途 |
| --- | --- | --- |
| `ai-triage.yaml` | 新 issue 打开 | 自动打标签 + 欢迎评论（语言自适应） |
| `ai-assistant.yaml` | 评论 `@ai-bot` | 上下文感知问答（读 README + issue 历史） |
| `ai-summarize.yaml` | 打 `ai-summary` 标签 | 长讨论 TL;DR 总结 |

### Step 8.3 用 `gh` CLI 批量建 label

```bash
# 前置：gh 已登录（HTTPS 协议，详见 AI automation 文档）
gh auth login -h github.com

# AI 相关（3 个）
gh label create ai-summary         --color 8957e5 --description "Trigger AI to summarize the thread" --force
gh label create ai-triaged         --color 5319e7 --description "Auto-triaged by AI bot" --force
gh label create needs-reproduction --color fbca04 --description "Missing or incomplete reproduction steps" --force

# 包 scope（8 个）
for p in cli config offline renderer runtime skills tsconfig vite-plugin; do
  gh label create "$p" --color c5def5 --description "Scope: @lhx-kit/$p" --force
done

# 其他（2 个）
gh label create docs        --color 1d76db --description "Scope: documentation site" --force
gh label create engineering --color 0e8a16 --description "Scope: CI / release / tooling" --force
```

> 📖 完整 prompt 设计、防死循环、配额管理见 [GitHub AI 自动流](../engineering/ai-automation)。

---

## 🎯 项目搭建检查清单

把这个清单过一遍，就能保证你的 monorepo 在 day 1 就是"能打的"：

- [ ] pnpm 9.x + `packageManager` 字段锁定
- [ ] `pnpm.supportedArchitectures` 声明跨平台
- [ ] `pnpm-workspace.yaml` 列全 packages/apps/examples
- [ ] `tsconfig.base.json` + 各包 `extends` base
- [ ] Biome + Husky（pre-commit / commit-msg / pre-push 三件套）
- [ ] commitlint 的 type-enum + scope-enum（level 1）
- [ ] 每个 packages/* 有 `files` / `publishConfig.access` / `main/module/types`
- [ ] `.changeset/config.json` 的 `fixed` 组 + `access: public`
- [ ] `.github/workflows/ci.yaml`（paths 白名单 + 跨平台 matrix）
- [ ] `.github/workflows/release.yaml`（`id-token: write` + `npm install -g npm@latest`）
- [ ] 首版手动 `npm publish` 过每个包
- [ ] npm 网页给每个包配 Trusted Publisher
- [ ] `apps/docs/` + Rspress + GitHub Pages 部署 workflow
- [ ] GitHub 仓库 Settings → Pages → Source 选 "GitHub Actions"
- [ ] 3 个 AI workflow + `gh label create` 批量建 label
- [ ] README + README.zh-CN + SETUP.md + CONTRIBUTING.md

---

## 💡 最后的建议

- **一次搞定工程化，再开始写业务代码**——不要"先写功能再补 CI"，那是在给自己埋雷
- **用 OpenSpec / Changesets 管变更**——它们逼你把"做什么 / 为什么 / 怎么做"写清楚，3 个月后你回来看能立刻捡起上下文
- **工程化投入**看起来慢，**后续每一次发版、每一次 review、每一次 issue 响应都在回本**
- **不要畏惧 Trusted Publishing / OIDC**——看起来复杂，实际上一次配好后比管 token 轻松 10 倍

---

## 📚 延伸阅读

- [🛠️ 工程化总览](../engineering/overview)
- [🚀 发布流水线：Changesets + Trusted Publishing](../engineering/release-pipeline)
- [⚙️ CI 策略](../engineering/ci-strategy)
- [🤖 GitHub AI 自动流](../engineering/ai-automation)
- [🏗️ 架构总览](./architecture)
- [📦 离线打包深度剖析](/offline/packaging-deep-dive)

---

<div style="text-align:center;opacity:0.7;margin-top:2rem">
  本篇对应 lhx-kit 2026-05-02 完整形态：<br />
  8 个已发布包 · 3 条 AI 自动流 · OIDC 零-secret 发布 · 跨平台 CI 绿灯。
</div>
