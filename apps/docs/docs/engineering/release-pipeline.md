# 🚀 发布流水线：Changesets + npm Trusted Publishing

> lhx-kit 是一个包含 8 个可发布包的 monorepo，从 2026 年 5 月起采用 **Changesets + GitHub Actions + npm Trusted Publishing（OIDC）** 这一套组合拳做发布。本篇把每一步都讲透，并给出可直接复用的配置和故障排查表。

---

## 📦 全景：一次完整的发布经过了什么

```
   开发者                             GitHub                              npm
──────────────────────────────────────────────────────────────────────────────
feat: xxx  ──┐
             ├─▶ push master ─▶ Release workflow 跑
pnpm changeset  (生成 .changeset/*.md)     │
git add .changeset/ && commit              │
                                           ▼
                                   ┌───────────────────┐
                                   │ changesets/action │
                                   └───────┬───────────┘
                                           │ 有 pending changeset？
                                           │
                      ┌────────────────────┴────────────────────┐
                      │                                         │
                      ▼                                         ▼
        有 → 开 "Version Packages" PR          无 → 直接执行 pnpm release
          ├─ 消费 .changeset/*.md                ├─ pnpm -r build
          ├─ bump package.json version           ├─ changeset publish
          ├─ 更新 CHANGELOG.md                   │    ├─ 按 package.json 版本号
          └─ 生成 lockfile 更新                  │    ├─ 向 npm 出示 OIDC token
                      │                          │    └─ npm 换短期凭据 → publish
                      ▼                          ▼
       人工 review / merge PR ──▶ 再次触发 Release ──▶ 走右边分支 → 发布完成
                                                        │
                                                        ▼
                                                 包页面显示 ✓ Provenance 徽章
```

**这套模型的关键在于"两阶段"**：
1. **Version PR 阶段**——自动化只做"算版本号 + 写 CHANGELOG"，**不发布**；人工 review 合并后才进入下一阶段。
2. **Publish 阶段**——发布是 PR 合并后再次触发的同一 workflow，这一次没有 pending changeset 所以走 publish 分支。

为什么分两阶段？**因为 monorepo 里误发一个包的代价 ≫ 少按一个按钮的代价**。

---

## 🧩 配置 1：Changesets 本身

### 1.1 `.changeset/config.json`

```json
{
  "$schema": "https://unpkg.com/@changesets/config@latest/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [["@lhx-kit/*"]],
  "linked": [],
  "access": "public",
  "baseBranch": "master",
  "updateInternalDependencies": "patch",
  "ignore": []
}
```

重点字段：

| 字段 | 值 | 为什么 |
|---|---|---|
| `fixed` | `[["@lhx-kit/*"]]` | **所有 `@lhx-kit/*` 包始终用同一个版本号**。改了 cli 也会把 runtime/offline 一起 bump。好处：用户安装任何一个包，搭配的其他包版本天然匹配 |
| `access` | `public` | scoped 包默认是 private（会上传失败），必须显式声明 public |
| `baseBranch` | `master` | 部分团队用 main，按实际写 |
| `commit` | `false` | 让 `changesets/action` 统一处理 commit，不让 CLI 自己提 |
| `updateInternalDependencies` | `patch` | 内部 workspace 包升级时，依赖它的包也自动 patch——保证 workspace-range 被正确展开 |

### 1.2 `package.json` 的 scripts

```json
{
  "scripts": {
    "changeset": "changeset",
    "version": "changeset version && pnpm install --lockfile-only",
    "release": "pnpm -r --filter='./packages/*' build && changeset publish"
  }
}
```

**`version` 脚本里为什么要跟一个 `pnpm install --lockfile-only`**？因为 `changeset version` 改了 `package.json` 的版本号后，`pnpm-lock.yaml` 里的 workspace 交叉引用版本号会过时，必须同步刷一次 lockfile 否则下次 `--frozen-lockfile` 的 CI 会挂。这是被多个团队踩过的坑，写进 SETUP 文档做成默认。

### 1.3 开发流程

```bash
# 1. 平常写完 feature 后
pnpm changeset
# 交互式选：哪些包受影响、patch/minor/major、写 summary

# 2. 会生成 .changeset/<随机名>.md
git add .changeset/
git commit -m "feat(cli): add --watch flag"
git push

# 3. master 上的 Release workflow 开出一个 PR 叫 "chore(release): version packages"
#    PR 里可以看到：
#    - package.json 版本号变化
#    - CHANGELOG.md 增量
#    - .changeset/*.md 被删除（消费掉了）
#
# 4. review → merge
# 5. merge 后 Release workflow 再跑一次 → npm publish → 完成
```

---

## 🧩 配置 2：GitHub Actions Release Workflow

这是 lhx-kit 当前真实在用的 `.github/workflows/release.yaml`（删掉了无关注释）：

```yaml
name: Release

on:
  push:
    branches: [master]

# 注意：这个 workflow 不加 paths 过滤——changesets 必须观察每次 push
# 才能判断"现在是要开 Version PR 还是执行 publish"

permissions:
  contents: write       # 推 Version Packages PR + tag
  pull-requests: write  # 开/改 Version Packages PR
  id-token: write       # npm provenance + OIDC 交换

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.REPO_PUSH_TOKEN || secrets.GITHUB_TOKEN }}

      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
          registry-url: https://registry.npmjs.org  # provenance 必需

      - run: pnpm install --frozen-lockfile
      - run: pnpm -r --filter='./packages/*' build

      - uses: changesets/action@v1
        with:
          publish: pnpm release
          version: pnpm run version
          commit: "chore(release): version packages"
          title: "chore(release): version packages"
          createGithubReleases: true
        env:
          GITHUB_TOKEN: ${{ secrets.REPO_PUSH_TOKEN || secrets.GITHUB_TOKEN }}
          NPM_CONFIG_PROVENANCE: "true"
          # ↑ 注意：没有 NPM_TOKEN！走 Trusted Publishing
```

### 关键点

| 设计 | 理由 |
|---|---|
| `permissions.id-token: write` | **必须**——OIDC 的地基。没这个 `npm publish` 会在 OIDC 交换阶段 401 |
| `fetch-depth: 0` | changesets 要根据完整 git log 生成准确 CHANGELOG |
| `token: ${{ secrets.REPO_PUSH_TOKEN || secrets.GITHUB_TOKEN }}` | 默认 `GITHUB_TOKEN` 不能 push 到受保护分支；有 PAT 就用 PAT，fork 场景 fallback 到默认 token |
| `registry-url` | `setup-node` 会写 `.npmrc` 让 npm 知道注册表地址——provenance 签名要用 |
| `--frozen-lockfile` | 确保发布用的依赖树和开发者本地完全一致 |
| **不加 paths 过滤** | Version PR 合并那次 push 只动了 `package.json` / `CHANGELOG.md` / 删 `.changeset/*.md`，任何 paths 过滤都可能漏掉 → 导致"合了 Version PR 但没发布" |

---

## 🔐 配置 3：Trusted Publishing（OIDC 免密发布）

这是本套方案最大的亮点。传统方案用 `NPM_TOKEN` secret，永远面临：

- token 90 天过期要轮换（忘了就 CI 红）
- token 泄漏风险（log / 第三方 action 滥用）
- npm 2024 Q3 起在创建 token 页面**明示警告** CI/CD 应改用 Trusted Publishing
- Granular token 的 "Packages and scopes" 稍有勾漏就 `E404 scope not found`

**Trusted Publishing 用 GitHub OIDC 代替 token**。每次发布时：

```
GitHub Actions runner
  │
  │  issue OIDC id_token：
  │  "我是 github.com/juwenzhang/lhx-kit 仓库
  │   release.yaml 这个 workflow 在跑"
  ▼
npm registry
  │  校验 Trusted Publisher 配置是否匹配
  │  ├─ repo = juwenzhang/lhx-kit  ✓
  │  ├─ workflow filename = release.yaml  ✓
  │  └─ 签发方 = GitHub ✓
  ▼
换发一次性短期凭据 → publish 成功 → 包自动带 provenance 签名
```

### 3.1 一次性配置步骤（npm 网页）

对**每一个** `@lhx-kit/*` 包重复：

1. 登录 `npmjs.com`，打开包页面，例如 `https://www.npmjs.com/package/@lhx-kit/cli/access`
2. 找到 **Trusted Publisher** 区块 → **Add trusted publisher** → 选 **GitHub Actions**
3. 填写：

| 字段 | 值 | 易错点 |
|---|---|---|
| **Publisher** | GitHub Actions | 默认已选 |
| **Organization or user** | `juwenzhang` | 填 GitHub 用户名，不是 npm 用户名 |
| **Repository** | `lhx-kit` | 只填仓库短名，**不带 URL、不带 `/`** |
| **Workflow filename** | `release.yaml` | 只填文件名，不带 `.github/workflows/` 前缀，扩展名是 `.yaml` 不是 `.yml` |
| **Environment name** | *(留空)* | 除非 workflow 里用了 `environment:` 块，否则留空 |

4. 点 **Set up connection**

lhx-kit 需要配 8 个包：`cli`、`config`、`offline`、`renderer`、`runtime`、`skills`、`tsconfig`、`vite-plugin`。

### 3.2 前置条件

**Trusted Publisher 不能用于"从未发布过"的包**。第一次必须用传统方式（本地 `npm publish --access public` 或临时的 NPM_TOKEN）把 0.0.x 推上去；之后切到 Trusted Publishing。

**另一项同等重要的前置条件：npm CLI 必须 ≥ 11.5.1**。

Trusted Publishing 依赖 npm 客户端实现的 OIDC token 交换接口
`POST /-/npm/v1/oidc/token/exchange`。这是 npm 11.5.1 才引入的端点。低于这个版本，publish 时会出现一个**极其误导**的错误链：

1. provenance statement 签名成功（因为那是 sigstore，不经过 npm）
2. 最后 PUT 到 registry 时 `E404 Not Found`
3. 错误描述里写 `'@scope/pkg@x.y.z' is not in this registry`

看起来像"包不存在"或"权限不对"，实际上是**旧版 npm 调不动交换端点**。

#### 为什么 GitHub Actions 默认 npm 版本不够

- `actions/setup-node@v4` 只负责装 Node，**不主动升级 npm**
- Node 20 LTS 默认捆绑 **npm 10.x**
- npm 11.x 要到 Node 23 才是默认

#### 标准修复

在 Release workflow 的 `setup-node` **之后**、`publish` 步骤**之前**加：

```yaml
- name: Upgrade npm to >= 11.5.1 (required for Trusted Publishing)
  run: npm install -g npm@latest
```

跑完一次应该能看到 `npm notice` 改成 11.x。

---

### 3.3 如何确认 OIDC 生效

发布一次看：

- ✅ GitHub Actions 日志里应能看到 `npm notice OIDC token verified` 之类字样
- ✅ npm 包页面的 **Current Tags / Provenance** 处显示绿色勾
- ✅ 页面底部 "Published from github.com/juwenzhang/lhx-kit@<commit sha>"

---

## 🆚 对比：为什么不继续用 Token

| 维度 | NPM_TOKEN (Granular/Automation) | Trusted Publishing (OIDC) |
|---|---|---|
| 配置工作量 | 1 次建 token + 1 次存 secret | 每包 1 次配 Trusted Publisher |
| 到期 | 90 天轮换 | 永不过期 |
| 泄漏风险 | token 一旦泄漏可被滥用整个过期窗口 | 无长期 secret；短期凭据仅在单次 publish 有效 |
| 权限错配 | 容易漏勾 scope → `E404 scope not found` | 字段简单：repo + workflow |
| npm 官方态度 | 2024 Q3 起**主动警告**不推荐 | **首选推荐** |
| provenance 签名 | 可选（`NPM_CONFIG_PROVENANCE=true`） | 自动且天然绑定 workflow 身份 |
| 失败调试 | `E404` / `ENEEDAUTH` 错误语焉不详 | `OIDC token exchange failed` 直接指明问题域 |

**一句话**：新项目没理由再用 token。旧项目走兼容路线可以，迁移成本极低（本专栏示例就是从 token 迁 OIDC 的真实过程）。

---

## 🔧 故障排查表

| 症状 | 真实根因 | 解法 |
|---|---|---|
| `E404 Not Found - PUT ... scope not found` | ① 包从未发布过 ② Granular token 漏勾 `@lhx-kit` scope | 先手动首发；或去 token 页面重配 Packages and scopes |
| `ENEEDAUTH` | NPM_TOKEN 丢了或失效 | 旧路线：换 token；新路线：切 OIDC |
| `OIDC token exchange failed` | Trusted Publisher 配的 workflow filename 与实际不符（常见 `.yml` vs `.yaml`）/ repo 名拼错 / environment 填了但 workflow 没定义 | 回 npm 网页改 Trusted Publisher 字段 |
| `403 Resource not accessible by integration` | workflow 没开 `permissions: contents: write / pull-requests: write` | 在 release.yaml 顶层加上 |
| Version Packages PR 一直不开 | 没有 pending `.changeset/*.md` | `pnpm changeset` 生成 changeset 并 commit |
| `Failed to find where HEAD diverged from "master"` | master 上还没有 initial commit | 先 push 一次 initial commit |
| Version PR 合并后 publish 没跑 | workflow 加了 paths 过滤，漏了 `package.json` / `CHANGELOG.md` | 去掉 paths，Release workflow 必须对 master 每次 push 都跑 |
| npm 网页搜索框搜不到刚发的 scope | **不是 bug**，registry 和搜索索引是两套系统 | 等 6–24h，或给别人直接发 `https://www.npmjs.com/package/<name>` |
| 包里多了意外文件 | `package.json` 里没声明 `files` 字段 | 显式列 `["dist", "README.md", "LICENSE"]`，别靠 `.npmignore` |

---

## 🧪 发布前自检清单

在合 Version PR 之前用这个清单过一遍：

- [ ] CHANGELOG 里每一条都是"用户视角"描述，不是 commit message 堆砌
- [ ] 版本号升级级别合理（breaking change 有没有被误写成 patch？）
- [ ] 本地跑一遍 `pnpm -r --filter='./packages/*' build` 全部 pass
- [ ] `package.json#files` 声明的文件确实被 build 产出（用 `npm pack --dry-run` 验证）
- [ ] 新增公开 API 有 TSDoc 注释 / 文档更新
- [ ] 如果 breaking，reference/migration.md 加迁移指引

---

## 💡 一些延伸约定

- **永远不手改 `package.json#version`**——让 changesets 管。人工改最容易出"版本倒退"或"CHANGELOG 不对齐"。
- **永远不手改 `CHANGELOG.md`**——同上。
- **changeset 的 summary 要人读得懂**——它会原样进 CHANGELOG，别写 "fix bug" 这种废话。
- **breaking change 单独开 changeset**——一条 changeset 一件事，合并时好切分。
- **跨包改动的 changeset 要勾全**——比如改了 vite-plugin 的公开类型但没勾 cli，cli 依赖的类型不匹配上线就会挂。

---

## 📚 相关文档

- [🛠️ 工程化总览](./overview)
- [⚙️ CI 策略](./ci-strategy)
- [📦 离线打包深度剖析](/offline/packaging-deep-dive)
- [npm 官方文档：Trusted Publishing](https://docs.npmjs.com/trusted-publishers)
- [Changesets 官方文档](https://github.com/changesets/changesets)

---

<div style="text-align:center;opacity:0.7;margin-top:2rem">
  本篇对应 lhx-kit 2026-05-02 发布治理升级。<br />
  历史上的 NPM_TOKEN 方案保留在 git 历史里，有需要可回溯。
</div>
