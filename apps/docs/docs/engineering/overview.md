# 🛠️ 工程化专栏总览

> 这一板块不讲 lhx-kit 的运行时或产物，只讲「**把这套东西做出来、测出来、发出去、让别人能装**」背后的工程机制：Git 工作流、Changesets 版本治理、npm 发布、GitHub Actions CI/CD、Trusted Publishing（OIDC 免密发布）、跨平台 lockfile、pre-commit/pre-push 钩子。

这些内容看起来"不写业务代码"，但**在一个多包 monorepo 项目里，它们决定了两件最致命的事**：

1. **能不能稳定发版**——版本号对不对、CHANGELOG 准不准、多包一起跳版本会不会留下半残状态；
2. **别人装上能不能跑**——lockfile 是否跨平台、provenance 签名有没有、publish 凭据会不会泄漏。

做错任何一个，轻则 CI 红 3 天，重则用户 `npm install` 失败、信任崩盘。本专栏把 lhx-kit 真实落地过的每一步都整理成可复用的方案。

---

## 📑 专栏目录

### [🚀 发布流水线：Changesets + npm Trusted Publishing](./release-pipeline)

一条完整的"代码合 master → 自动开版本 PR → 合 PR → 自动发 npm"流水线怎么设计。重点：

- **Changesets "PR-or-publish" 双阶段模型**：为什么不是一键发布，而是先开 Version Packages PR 让人审
- **fixed group 配置**：怎么让 8 个 `@lhx-kit/*` 包始终同步同一个版本号
- **npm Trusted Publishing**：用 GitHub OIDC 替代 `NPM_TOKEN`，从此告别 token 过期和泄漏
- **provenance 签名徽章**：包详情页那个绿色 ✓ 是怎么来的，它证明了什么
- 故障排查表：`E404 scope not found` / `OIDC token exchange failed` / `ENEEDAUTH` 的真实根因

### [⚙️ CI 策略：path filter / 跨平台 lockfile / frozen install / pre-push](./ci-strategy)

GitHub Actions 怎么配才既快又准：

- **`paths` 白名单 vs `paths-ignore` 黑名单**：为什么前者安全，后者会"假绿"
- **`pnpm.supportedArchitectures`**：lockfile 里登记 `linux-x64` / `win32-x64` / `darwin-arm64` 所有平台的原生二进制，避免 CI 在 Windows 上报 `Cannot find module @rollup/rollup-win32-x64-msvc`
- **`--frozen-lockfile` 严格化**：lockfile 是唯一事实来源，CI 永远不改它
- **bin shim 重建坑**：为什么 `pnpm install --offline` 在 pnpm 9 下会导致 `lhx-cli: command not found`
- **husky pre-push + biome**：本地兜底，不让 CI 白花钱

### [🤖 GitHub AI 自动流（零成本）](./ai-automation)

用 GitHub Models 给仓库接三条 AI 自动线——不花钱、不用 API key、10 分钟上线：

- **新 issue 自动分类 + 打标签 + 欢迎评论**（语言自适应）
- **评论 `@ai-bot ...` 触发上下文感知问答**（读 README + issue 上下文）
- **打 `ai-summary` 标签做长讨论 TL;DR**（自动替换旧总结）
- 防死循环 / 防滥用 / 透明性签名的具体实践
- 升级路径：从轻量 → 自动 review → 真改代码（Claude Code Action / Copilot Coding Agent）

### [🔧 GitHub CLI 实战手册](./gh-cli-guide)

按使用场景组织的 `gh` 命令速查，lhx-kit 日常仓库运维 90% 操作不用开浏览器：

- **登录与账号**：HTTPS vs SSH 的选择逻辑、网络抖动报 EOF 时怎么判断真实成功状态
- **Workflow 运维**：查失败日志、re-run 失败的 release、紧急恢复指南
- **PR 管理**：create / checkout / review / auto-merge、Changesets Version PR 的标准流程
- **Issue / Labels / Release / Secrets** 全场景手册，含 lhx-kit 22 个 label 的一键 bootstrap 脚本
- 10 条最常用命令速记，背下来日常够用

### [📝 Commit / PR 规范（规划中）](#)

- Conventional Commits 的真实价值：不是好看，而是让 changesets / semantic-release 能机读
- commitlint 在 PR 里的落地方式
- 分批次 commit 的反模式与正模式

---

## 🗺️ 工程化全景图

```
┌─────────────────────────────────────────────────────────────────┐
│                         开发者本地                              │
│                                                                 │
│  editor → git commit → husky hook                               │
│    ├── lint-staged (biome --write / biome check)                │
│    └── commitlint (Conventional Commits)                        │
│                                                                 │
│  git push → husky pre-push                                      │
│    ├── biome check .                                            │
│    └── pnpm -r --if-present typecheck                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         GitHub Actions                          │
│                                                                 │
│  ┌───────────┐  ┌───────────┐  ┌──────────────┐                 │
│  │  CI       │  │  Docs     │  │  Release     │                 │
│  │ (ci.yaml) │  │ (rspress) │  │ (changesets) │                 │
│  └─────┬─────┘  └─────┬─────┘  └──────┬───────┘                 │
│        │ paths:       │ paths:        │ 无 paths                │
│        │ packages/**  │ apps/docs/**  │ (总是跑)                │
│        ▼              ▼               ▼                         │
│  • biome check  • rspress build • changeset status              │
│  • typecheck    • pages deploy  • 有 pending → 开 Version PR    │
│  • pnpm build                   • 无 pending → changeset publish│
│  • 跨平台矩阵                           │                       │
│                                         ▼                       │
│                                  ┌──────────────┐               │
│                                  │   npm        │               │
│                                  │  registry    │               │
│                                  │ OIDC publish │               │
│                                  │ + provenance │               │
│                                  └──────────────┘               │
└─────────────────────────────────────────────────────────────────┘
```

每条线都有自己的触发条件、失败处理策略。下两篇分别拆解。

---

## 📏 几个贯穿的原则

这些是写下来的软规则，专栏其他文档都会反复引用：

### 1. **Lockfile 是唯一事实来源**
CI 永远 `--frozen-lockfile`。lockfile 不对 = CI 红 = 必须在本地 `pnpm install` 提交新 lockfile，而不是让 CI 悄悄改。

### 2. **能用配置解决，不用 token**
npm Trusted Publishing（OIDC）、GitHub OIDC、GitHub Environment 审批——这些免密机制永远优先于 `NPM_TOKEN`、`PAT`。少一个 secret = 少一个泄漏点。

### 3. **"版本号"是团队契约，不是自动化产物**
Changesets 的 Version PR 阶段是**刻意的**——版本号、CHANGELOG 必须有人看一眼再合。全自动 `semantic-release` 式发布看起来酷，但 monorepo 场景下误发几率显著上升。

### 4. **paths 白名单，不用 paths-ignore**
白名单 = 漏列一个路径 = CI 不跑（可以补）；黑名单 = 漏列一个路径 = CI 错跑（可能错误打绿）。两害相权取其轻。

### 5. **examples/* 不是发布契约**
它们是给新人看的样本，不是给 CI 做契约的。examples 坏了修，但不能因此阻塞 packages 发布。

---

## 🧭 适合谁读

- **想搭 monorepo 发布流水线的开发者**：直接抄本专栏 3 个 workflow
- **刚接触 Changesets 的人**：本专栏解释了"为什么分 Version PR 和 publish 两阶段"的底层逻辑
- **被 `NPM_TOKEN` 烦过的人**：Trusted Publishing 是终极解药
- **自己项目 CI 一会儿跑一会儿不跑的人**：看 CI 策略那篇的 paths filter 部分

不适合——想学"怎么写 TypeScript / Vite 插件"的读者，那是 [Runtime](/runtime/overview) 和 [Vite 插件实现详解](/runtime/vite-plugin) 的范畴。

---

<div style="text-align:center;opacity:0.7;margin-top:2rem">
  专栏持续更新中；建议收藏。<br />
  发现过期 / 错误？点每页底部的 📝 编辑此页 提 PR。
</div>
