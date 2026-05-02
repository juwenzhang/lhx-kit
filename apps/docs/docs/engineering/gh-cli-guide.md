# 🔧 GitHub CLI（`gh`）实战手册：仓库管理生产力十倍

> `gh` 是 GitHub 官方命令行工具，一条命令就能完成"打开浏览器 → 点 5 个菜单 → 粘贴 → 确认"的典型 GitHub 操作。lhx-kit 从 2026-05 起把 **gh 作为仓库运维的主要入口**：re-run workflow、批量建 label、查 release、看 Actions 日志……全用 gh。
>
> 本篇按**使用场景**而不是命令字母表来组织，让你像查"工具箱"一样翻。

---

## 🚀 安装

```bash
# macOS
brew install gh

# Linux
# 见 https://github.com/cli/cli/blob/trunk/docs/install_linux.md

# Windows
winget install --id GitHub.cli
```

验证：

```bash
gh --version
# 预期输出: gh version 2.x.x (yyyy-mm-dd)
```

**版本要求**：建议 ≥ 2.40，低版本在 OIDC 和 `ai-inference` action 相关场景有 bug。

---

## 🔑 场景 1：登录与账号管理

### 首次登录

```bash
gh auth login -h github.com
```

交互式问答，按这个答：

| 问题 | 答案 | 为什么 |
|---|---|---|
| What is your preferred protocol for Git operations? | **HTTPS** | gh 本质是 REST API 客户端，选 SSH 后续 API 调用会找不到凭据。你 git remote 还可以保持 SSH，互不影响 |
| Authenticate Git with your GitHub credentials? | **Yes** | 让 gh 顺手管 git 的 HTTPS 凭据（推荐；即使你 remote 是 SSH 也没影响） |
| How would you like to authenticate GitHub CLI? | **Login with a web browser** | 8 位 code 粘贴到 `github.com/login/device` 授权，最快 |

然后会显示：

```
! First copy your one-time code: F515-F4FD
Press Enter to open https://github.com/login/device in your browser...
```

**流程**：
1. 复制那 8 位 code
2. 回车（自动弹浏览器；若被阻止就手动打开 `https://github.com/login/device`）
3. 粘贴 code → Authorize → 终端显示 `✓ Authentication complete.`

### 踩坑：网络抖动

常见报错：

```
failed to authenticate via web browser: Post "https://github.com/login/oauth/access_token": EOF
```

**别慌，先看之前的输出里有没有这两行**：

```
✓ Authentication complete.
✓ Logged in as juwenzhang
```

**出现过就是成功了**，后面的 `EOF` 只是它试图"补充刷新 token"时网络断了，不影响登录状态。跑 `gh auth status` 验证：

```bash
$ gh auth status
github.com
  ✓ Logged in to github.com account juwenzhang (keyring)
  - Active account: true
  - Git operations protocol: https
  - Token: gho_************************************
  - Token scopes: 'gist', 'read:org', 'repo'
```

### 切换账号

```bash
gh auth switch                       # 交互式切换已登录账号
gh auth logout -h github.com -u xxx  # 登出某账号
```

### Token 失效

keyring 里的 token 可能过期或被撤销，表现是：

```
✓ Logged in to github.com account xxx (keyring)
  ✗ Failed to log in to github.com account xxx (keyring)
  - The token in keyring is invalid.
  - To re-authenticate, run: gh auth login -h github.com
```

**解决**：重跑 `gh auth login -h github.com` 覆盖即可，不用先 logout。

---

## ⚙️ 场景 2：Workflow / Actions 运维

### 查最近的运行状态

```bash
# 列出最近 10 次 workflow run（全部 workflow 合起来）
gh run list --limit 10

# 只看某个 workflow
gh run list --workflow=release.yaml --limit 5
gh run list --workflow=ci.yaml --branch=master
```

### 查某次 run 的详情

```bash
# 用 run id（见上一条的输出）
gh run view 12345678

# 看失败 step 的日志（特别适合定位 CI 红灯）
gh run view 12345678 --log-failed

# 下载全部日志 zip
gh run download 12345678 -n logs
```

### Re-run

发布失败或 flaky 测试打红，不想 push 一个空 commit 触发——直接 re-run：

```bash
gh run rerun 12345678               # 只重跑失败的 job
gh run rerun 12345678 --failed      # 同上，显式
gh run rerun 12345678 --all         # 整个 run 重跑
```

> ⚠️ **lhx-kit 的 Release workflow 如果因为 npm 问题挂了**（比如当时 npm 版本不够），修复 release.yaml 后**需要 re-run 对应的 run**，不是 push 一个新 commit。因为版本号已经被 Version PR 合并时 bump 了，新 push 不会再次触发 publish。

### 本地跑 workflow（`act`）

gh 本身不跑 workflow，但可以配合 [`act`](https://github.com/nektos/act) 本地模拟。不在本篇范围，有需要搜 "act nektos"。

---

## 🔀 场景 3：Pull Request 管理

### 查 PR 列表 + 详情

```bash
# 所有 open 的 PR
gh pr list

# 只看你自己开的
gh pr list --author @me

# 某个 PR 详情（支持 PR 编号或分支名）
gh pr view 42
gh pr view my-feature-branch
```

### 创建 PR

```bash
# 当前分支发 PR
gh pr create --title "feat(cli): add --watch flag" --body "Fixes #42"

# 指定 base 分支
gh pr create --base master --head feat/watch --title "..." --body "..."

# 跳过 body 编辑（省点事）
gh pr create --fill                  # 用最近的 commit 信息做 title/body
```

### Checkout PR 到本地

```bash
gh pr checkout 42                    # 自动拉 PR 分支并切过去
```

### Merge PR

```bash
gh pr merge 42 --squash              # squash 合并（推荐）
gh pr merge 42 --rebase              # rebase
gh pr merge 42 --merge               # 普通 merge commit
gh pr merge 42 --auto --squash       # 开启 auto-merge，等 CI 绿了自动合
```

### PR Review

```bash
gh pr review 42 --approve --body "LGTM"
gh pr review 42 --request-changes --body "需要修一下 xxx"
gh pr review 42 --comment --body "一些想法..."
```

### Changesets 的 Version Packages PR

lhx-kit 的发布流程关键 PR：

```bash
# 找到它
gh pr list --search "chore(release): version packages"

# 本地 checkout 验证
gh pr checkout <number>
cat packages/*/CHANGELOG.md | head -80  # 看本次变更

# 确认无误后合并（squash 或 merge 都行；lhx-kit 默认 squash）
gh pr merge <number> --squash
# 合并后 Release workflow 会自动触发 publish
```

---

## 🐛 场景 4：Issue 管理

### 批量查询

```bash
gh issue list --state=open --limit 20
gh issue list --label bug
gh issue list --search "performance in:title"
gh issue list --assignee @me
```

### 创建

```bash
gh issue create --title "vite-plugin 的 CDN 配置怎么写" \
                --body  "文档里没找到..." \
                --label question,vite-plugin
```

> 💡 新建的 issue 会触发 **ai-triage** workflow 自动打标签——你手动 `--label` 指定的标签会和 AI 加的标签**并存**（去重）。

### 评论

```bash
gh issue comment 42 --body "@ai-bot 这个问题怎么排查？"
# 会触发 ai-assistant workflow
```

### 打/摘标签

```bash
gh issue edit 42 --add-label ai-summary        # 触发 ai-summarize
gh issue edit 42 --remove-label needs-reproduction
```

### 关闭 / 重开

```bash
gh issue close 42 --comment "v0.0.4 已修复"
gh issue reopen 42
```

---

## 🏷️ 场景 5：Labels 管理

### 列出 + 导出

```bash
gh label list --limit 100

# JSON 格式方便脚本处理
gh label list --limit 100 --json name,color,description > labels.json
```

### 创建 / 更新（幂等）

```bash
# --force 表示"存在就更新颜色/描述，不存在就创建"
gh label create ai-summary --color 8957e5 --description "Trigger AI summary" --force
```

### lhx-kit 的完整 label 矩阵

```bash
# 前置：cd 到仓库根目录（gh 靠 git remote 识别仓库）
cd lhx-kit

# AI 相关（3 个）
gh label create ai-summary         --color 8957e5 --description "Trigger AI to summarize the thread"   --force
gh label create ai-triaged         --color 5319e7 --description "Auto-triaged by AI bot"               --force
gh label create needs-reproduction --color fbca04 --description "Missing or incomplete reproduction steps" --force

# 包 scope（8 个，统一浅蓝）
for p in cli config offline renderer runtime skills tsconfig vite-plugin; do
  gh label create "$p" --color c5def5 --description "Scope: @lhx-kit/$p" --force
done

# 其他 scope
gh label create docs        --color 1d76db --description "Scope: documentation site (apps/docs)" --force
gh label create engineering --color 0e8a16 --description "Scope: CI / release / tooling"         --force
```

### 删除

```bash
gh label delete ai-summary --yes     # --yes 跳过确认
```

### 批量同步（从另一仓库导入）

```bash
# 从 repo-a 导出 → 用 repo-b 导入
gh label list --repo owner/repo-a --limit 100 --json name,color,description \
  | jq -r '.[] | @base64' \
  | while read l; do
      name=$(echo "$l" | base64 -d | jq -r .name)
      color=$(echo "$l" | base64 -d | jq -r .color)
      desc=$(echo "$l" | base64 -d | jq -r .description)
      gh label create "$name" --color "$color" --description "$desc" --repo owner/repo-b --force
    done
```

---

## 🔐 场景 6：Secrets / Variables 管理

> lhx-kit 用 Trusted Publishing 后几乎不需要 secret 了，但偶尔还要配 `REPO_PUSH_TOKEN` 这种。

### 列出

```bash
gh secret list                       # Repository secrets
gh variable list                     # Repository variables（明文可读）

gh secret list --env production      # Environment 级
gh secret list --org juwenzhang      # Organization 级
```

### 写入

```bash
# 从文件读（避免 history 泄漏）
gh secret set REPO_PUSH_TOKEN < /tmp/pat.txt

# 从 stdin（适合 CI 脚本）
echo "$MY_TOKEN" | gh secret set REPO_PUSH_TOKEN

# 从环境变量
gh secret set NPM_TOKEN --body "$NPM_TOKEN_VALUE"

# 环境级
gh secret set MY_SECRET --env production < value.txt
```

### 删除

```bash
gh secret delete REPO_PUSH_TOKEN --yes
```

> ⚠️ **写 secret 的最佳实践**：千万别把 token 直接打在命令行里（`gh secret set xxx --body "ghp_..."`）——shell history 会留痕。用 `< file` 或从 stdin pipe。

---

## 🚀 场景 7：Release 管理

### 列出 Release

```bash
gh release list
gh release list --limit 20
```

### 查看某个 Release

```bash
gh release view v0.0.3               # 指定 tag
gh release view --web                # 在浏览器里打开
```

### 创建 Release

> lhx-kit 用 changesets/action 自动创建 Release，但手动场景也要知道怎么用。

```bash
# 从已有 tag 创建
gh release create v0.0.4 \
  --title "v0.0.4" \
  --notes "## What's changed\n\n- ..." \
  --generate-notes                   # 让 gh 自动从 merged PR 生成 notes

# 附带二进制文件
gh release create v0.0.4 ./dist/my-binary.zip --title "..."

# 草稿 / 预发布
gh release create v0.1.0-beta.1 --prerelease --draft
```

### 下载 Release 资产

```bash
gh release download v0.0.3 -A tar.gz  # 下载 source tarball
gh release download v0.0.3 --pattern "*.zip"
```

### 删除 Release

```bash
gh release delete v0.0.1 --yes --cleanup-tag   # 同时删 git tag
```

---

## 📦 场景 8：Repo / Org 信息

### 查仓库概览

```bash
gh repo view                         # 当前目录对应的仓库
gh repo view juwenzhang/lhx-kit      # 其他仓库
gh repo view --web                   # 浏览器打开
```

### Clone / Fork

```bash
gh repo clone juwenzhang/lhx-kit
gh repo fork juwenzhang/lhx-kit --clone=true
```

### 创建新仓库

```bash
gh repo create my-new-repo --public --source=. --push
# --source=. 表示用当前目录作为初始内容
# --push 表示创建后立即 push
```

### Codespaces

```bash
gh codespace list
gh codespace create --repo juwenzhang/lhx-kit --branch master
gh codespace ssh
```

---

## 🎯 场景 9：GraphQL / API 透传（高级）

当内置命令覆盖不到时，用原始 API：

```bash
# REST
gh api repos/juwenzhang/lhx-kit/issues?state=closed --paginate

# GraphQL
gh api graphql -f query='
  query {
    repository(owner: "juwenzhang", name: "lhx-kit") {
      issues(last: 5) { nodes { number title } }
    }
  }
'
```

lhx-kit 在 `.github/workflows/` 里也大量用 `actions/github-script` 间接调用这些 API——本质都是 GitHub REST/GraphQL。

---

## ⚡ 场景 10：最常用的一分钟速记

```bash
# 看 CI 现在哪个 run 在跑、谁红了
gh run list --limit 5

# CI 红了，看具体失败日志
gh run view <id> --log-failed

# 我的 PR 进度如何
gh pr list --author @me

# 有没有我该 review 的
gh pr list --search "review-requested:@me"

# 紧急触发一次 release（workflow 失败后 re-run）
gh run rerun <id>

# 快速开一个 issue
gh issue create --title "..." --body "..."

# 验证登录状态
gh auth status

# 在浏览器里打开当前仓库 / PR / issue
gh browse
gh pr view 42 --web
gh issue view 10 --web
```

把这 10 条背下来，日常 90% 的 GitHub 操作都不用开浏览器。

---

## 🛡️ 安全与常见坑

| 问题 | 原因 | 解法 |
|---|---|---|
| `gh: not logged in` | 没登录或 token 失效 | `gh auth login -h github.com` |
| `gh label create` 一堆失败 | 用 `&&` 串联遇到非零退出中断 | 改成 `for` 循环或分号 `;` 串联 |
| `gh: no repository found` | 不在 git 仓库目录 | `cd` 到仓库，或加 `--repo owner/name` |
| `could not resolve host: github.com` | 网络 / 代理问题 | `export HTTPS_PROXY=http://...` |
| `gh run rerun` 没反应 | GitHub 策略：>1 hour 的 run 不能 re-run | push 空 commit 或手动 `workflow_dispatch` |
| `gh secret set` 里值带引号或 `$` | Shell 会扩展 | 用 `< file` 方式读，不要直接 `--body "..."` |
| 写 gh 脚本别人运行失败 | Token scope 不同 | 看 `gh auth status` 里 `Token scopes`，脚本文档里标清楚需要什么 scope |

---

## 🚀 在 shell 里进一步提效

### 别名

```bash
# ~/.zshrc 或 ~/.bashrc
alias ghpr='gh pr list --author @me'
alias ghrun='gh run list --limit 10'
alias ghci='gh run view --log-failed'
```

### fzf 集成（交互选 run / PR）

```bash
# 需要先装 fzf: brew install fzf
gh run list --limit 20 --json databaseId,displayTitle,conclusion \
  | jq -r '.[] | "\(.databaseId)\t\(.conclusion // "running")\t\(.displayTitle)"' \
  | fzf | awk '{print $1}' | xargs gh run view
```

### VS Code 集成

GitHub 官方插件 "GitHub Pull Requests and Issues"（ID: `GitHub.vscode-pull-request-github`）本质就是 gh 的 GUI 封装，想用鼠标的时候用它。

---

## 📚 相关

- [🛠️ 工程化总览](./overview)
- [🚀 发布流水线](./release-pipeline)（用到 `gh run rerun` 恢复失败的 release）
- [🤖 AI 自动流](./ai-automation)（用 `gh label create` 批量建 AI workflow 需要的标签）
- [gh 官方文档](https://cli.github.com/manual/)
- [gh GitHub 仓库](https://github.com/cli/cli)

---

<div style="text-align:center;opacity:0.7;margin-top:2rem">
  本篇基于 gh 2.x。部分命令在 1.x 不可用。<br />
  升级：<code>brew upgrade gh</code> 或参照官方安装指南。
</div>
