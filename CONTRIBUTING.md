# 🤝 Contributing to lhx-kit

感谢你愿意给 lhx-kit 贡献代码 / 文档 / 反馈！这份指南会带你 15 分钟跑通本地开发环境。

---

## 📋 先决条件

| 工具 | 版本 | 说明 |
| --- | --- | --- |
| Node.js | `>= 18.18.0` | 见 `.nvmrc`。推荐用 `nvm use` / `fnm use` 自动切到 20.18 |
| pnpm | `>= 9` | 必须；`workspace:*` 是 pnpm 专属协议 |
| Git | `>= 2.30` | 提交 hooks 依赖 |
| Make | 任意 | 可选，用于 `make` 命令聚合；没有可以直接用 `pnpm` |

---

## 🚀 本地环境

```bash
# 1. Fork + clone
git clone git@github.com:<your-name>/lhx-kit.git
cd lhx-kit

# 2. 一键安装 + 构建内部包
make setup
# 等价于：
# pnpm install && pnpm -r --if-present build

# 3. 启动任一示例验证
make dev-vmpa     # 或 make dev-rmpa
```

如果你之前跑过，`make reset` 可以核弹级清理并重来。

---

## 🧪 开发工作流

### 修改 `@lhx-kit/config` 源码后 examples 看不到效果

因为 `workspace:*` 只建软链，不自动 build。两种解法：

```bash
# 方案 1：改一次 build 一次
pnpm --filter @lhx-kit/config build

# 方案 2：watch 模式（推荐）
make watch      # 所有内部包并行 tsup --watch
```

### 跑文档站

```bash
make docs-dev
# 访问 http://localhost:3000/lhx-kit/
```

---

## 🎨 代码风格

本仓统一用 **Biome** 做 format + lint + organize imports。

```bash
make lint        # 扫全仓
make lint-fix    # 自动修复
make format      # 仅格式化
```

VSCode 用户：工作区已配置保存自动格式化（见 `.vscode/settings.json`），打开项目时会提示安装 Biome 扩展。

---

## ✅ 提交代码

### 1. 新建分支

```bash
git checkout -b feat/my-feature   # 或 fix/xxx / docs/xxx / chore/xxx
```

### 2. Commit Message 规范

遵循 [Conventional Commits 1.0](https://www.conventionalcommits.org/zh-hans/v1.0.0/)：

```text
<type>(<scope>): <subject>

<body>

<footer>
```

**type** 可选：`feat / fix / docs / style / refactor / perf / test / build / ci / chore / revert`

**scope** 建议：`cli / config / runtime / renderer / offline / vite-plugin / docs / templates / vmpa / rmpa / deps / ci / release / repo`

**示例**：

```text
feat(cli): add `lhx-cli add component` command
fix(vite-plugin): correct chunk ownership for lazy routes
docs(guide): rewrite performance chapter with 10KB threshold rationale
chore(deps): bump vite to 6.0.3
```

commit-msg 钩子会自动校验，不合规直接拒绝。

### 3. Pre-commit / pre-push 钩子

| 钩子 | 做什么 | 大约耗时 |
| --- | --- | --- |
| pre-commit | 对 staged 文件跑 Biome check + auto-fix | < 2s |
| commit-msg | commitlint 校验 | < 100ms |
| pre-push | 所有 workspace tsc --noEmit | 10–30s |

**逃生舱**：`git commit --no-verify` / `git push --no-verify`（应急使用，PR 里不应出现）

### 4. 打开 PR

- PR 标题遵循 commit message 格式
- 填写 PR 模板里的每一项
- 关联对应的 Issue（`Closes #123`）
- 勾选自测清单

### 5. CI 检查

所有 PR 会自动跑：

- 🎨 Biome lint
- 📝 commitlint（对整段 commits）
- 🔧 Node 18 / 20 / 22 矩阵构建
- 🧪 单元测试
- 🚬 CLI smoke
- 🌐 Ubuntu / macOS / Windows 跨平台

全部绿了才能合并。

---

## 📁 目录结构

```text
lhx-kit/
├── apps/
│   └── docs/                  # Rspress 文档站
├── examples/
│   ├── vmpa/                  # Vue3 MPA 示例
│   └── rmpa/                  # React MPA 示例
├── packages/
│   ├── config/                # SSOT 配置加载
│   ├── cli/                   # 脚手架 + 命令入口
│   ├── vite-plugin/           # MPA 构建编排
│   ├── offline/               # 离线打包
│   ├── runtime/               # 浏览器侧运行时
│   └── renderer/              # 配置驱动 UI
├── .github/                   # GitHub 治理（CI / ISSUE / PR 模板）
├── .husky/                    # git hooks
├── .vscode/                   # VSCode 工作区
├── biome.json                 # lint + format 配置
├── commitlint.config.cjs
├── lint-staged.config.cjs
├── Makefile                   # 命令聚合
├── tsconfig.base.json         # 所有包继承
└── pnpm-workspace.yaml
```

---

## 🧪 测试

```bash
make test                     # 所有 workspace
pnpm --filter @lhx-kit/cli test   # 某个包
```

新增功能请补充测试。Vitest 配置见每个包的 `vitest.config.ts`。

---

## 📖 文档

改了 API / 行为 / 配置字段？**同步更新文档**：

- API 参考放到对应包的 overview 文档
- 行为变化 / 决策放到 `apps/docs/docs/guide/`
- 新增常见问题放到 `apps/docs/docs/reference/faq.md`

本地预览：

```bash
make docs-dev
```

---

## 🐛 报 Bug / 提 Feature

- 🐛 [Bug Report](https://github.com/juwenzhang/lhx-kit/issues/new?template=bug_report.yml) — 必须带**最小复现**
- ✨ [Feature Request](https://github.com/juwenzhang/lhx-kit/issues/new?template=feature_request.yml)
- ❓ [Question](https://github.com/juwenzhang/lhx-kit/issues/new?template=question.yml) — 先搜 FAQ

---

## 📜 Code of Conduct

参与本项目即表示你同意遵守 [Code of Conduct](./CODE_OF_CONDUCT.md)。

---

## 📄 License

提交的代码默认以项目 License（MIT）发布。
