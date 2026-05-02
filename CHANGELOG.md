# Changelog

所有版本变更会记录在这里。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

---

## [Unreleased]

### 🏗️ Added — 新增

- 根目录工程化配置全家桶
  - `.nvmrc` / `.node-version` — Node 版本锁定到 20.18
  - `.npmrc` — pnpm 行为调优（workspace 优先 / 并发上限 / auto-install-peers）
  - `.editorconfig` — 跨编辑器统一格式约定
  - `biome.json` — 统一 lint + format + organize imports
  - `commitlint.config.cjs` — Conventional Commits 强制校验 + scope 枚举
  - `lint-staged.config.cjs` — staged 文件增量格式化
  - `Makefile` — 常用命令聚合入口
- Husky v9 git hooks：`pre-commit` / `commit-msg` / `pre-push`
- VSCode 工作区：`settings.json` / `extensions.json` / `launch.json`
- GitHub 治理
  - Issue 模板（Bug / Feature / Question / config 链接）
  - Pull Request 模板
  - `CODEOWNERS` / `dependabot.yml` / `FUNDING.yml`
- CI Workflow：Node 18/20/22 × Ubuntu/macOS/Windows 矩阵 + Biome + commitlint + typecheck + tests + CLI smoke
- 社区健康文件：`LICENSE` (MIT) / `CONTRIBUTING.md` / `CODE_OF_CONDUCT.md` / `SECURITY.md`

### 🎨 Changed — 调整

- `package.json` 增加 `packageManager` / `repository` / `homepage` / `license` / `author` / `keywords` 字段
- `rspress-docs-ci-cd.yaml` 升级 pnpm v8 → v9，加 paths 过滤只在文档相关变更时触发

### 📖 Docs

- 完成 15 份文档重写：`index / guide × 5 / runtime × 2 / renderer / offline / cli / templates / reference × 3`
- 全面采用 Rspress directive（`:::tip` / `:::info` / `:::warning` / `:::danger` / `:::details` / `:::code-group`）
- 代码块统一用 `title="..."` + 行高亮 + showLineNumbers

---

## [0.0.0] — 初始版本

初始提交：monorepo 基础结构、6 个内部包、2 个 examples、文档站。
