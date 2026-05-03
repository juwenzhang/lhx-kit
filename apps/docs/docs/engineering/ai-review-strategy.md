# 🎯 AI 协作策略：多模型评审 + 受控自动修复

> 在 lhx-kit 仓库里，**5 条 AI workflow 组成了一条完整的"AI 协作流水线"**。本文讲清楚每条 workflow 的边界、选型背后的 trade-off，以及 prompt 设计里容易踩的坑。不是 "怎么接 LLM"，而是 **"多 AI 协作在真实 OSS 项目里怎么落地才不翻车"**。

---

## 🗺️ 全景：5 条 workflow 的分工

```
               PR 事件                       Issue 事件
┌────────────────────────────────┬────────────────────────────────┐
│  ai-review-gpt.yaml (GPT-4o)   │  ai-triage.yaml                │
│  → 通用 review 评论             │  → 新 issue 自动分类 + 欢迎     │
│                                │                                │
│  ai-review-gemini.yaml (Gemini)│  ai-assistant.yaml             │
│  → 跨文件 / 文档视角 review    │  → @ai-bot 问答                 │
│                                │                                │
│  ai-autofix.yaml (无 LLM)      │  ai-summarize.yaml             │
│  → @bot-fix-lint 确定性修复    │  → 标签触发长讨论 TL;DR         │
│                                │                                │
│                                │  ai-code-fix.yaml (GPT-4o)     │
│                                │  → @ai-bot fix 受控代码修改     │
│                                │                                │
│                                │  ai-docs-assistant.yaml (GPT-4o)│
│                                │  → @ai-docs draft / polish     │
└────────────────────────────────┴────────────────────────────────┘
```

### 能力矩阵

| Workflow | 触发 | 模型 | 写代码? | 开 PR? | 成本 |
|---|---|---|---|---|---|
| `ai-review-gpt` | PR 事件 | GPT-4o | ❌ | ❌（只评论） | 🟢 免费 |
| `ai-review-gemini` | PR 事件 | Gemini 2.5 | ❌ | ❌（只评论） | 🟢 免费 |
| `ai-autofix` | `@bot-fix-lint` | **无 LLM** | ✅ Biome 确定性 | 提交到 PR 分支 | 🟢 免费 |
| `ai-code-fix` | `@ai-bot fix` | GPT-4o | ✅ AI 生成 | **Draft** PR | 🟢 免费 |
| `ai-docs-assistant` | `@ai-docs` | GPT-4o | ✅ MD 生成 | **Draft** PR | 🟢 免费 |
| `ai-triage` / `ai-assistant` / `ai-summarize` | Issue 事件 | GPT-4o-mini | ❌ | ❌ | 🟢 免费 |

**所有 workflow 都跑在 [GitHub Models](https://docs.github.com/en/github-models) 上，公开仓库完全免费、零 API key**。

---

## 🧠 为什么是 GPT-4o + Gemini 双 reviewer？

### 选型理由

表面答案："多一个视角不容易漏"。**真实答案**更有意思：

> 两个 AI 同时 review 的**最大价值不是两倍覆盖率，而是"分歧信号"**——
> 当它们对同一行代码给出**相反判断**时，真人 review 就知道"这里值得多看一眼"。
> 当它们**高度一致**时，你对那条建议的信心就该翻倍。

这是一种很低成本的**集成学习（ensemble）**——不需要训练，不需要融合逻辑，让两个模型各自跑，**把"比对"的工作交给人**。

### 为什么不是三个或更多？

- **边际收益递减**：第三个模型 70% 的建议会和前两个重叠
- **信号噪声比下降**：PR 评论区出现 3+ 条机器人消息会淹没真人 review
- **两个已经能产出"分歧表"**：三个模型的分歧矩阵反而更难读

所以 **"2 正好，3 过多"** 在实操中反复验证过。如果你真需要多视角，宁可**在系统 prompt 里让一个模型扮演多个角色**，而不是真的拉三个模型。

### 为什么不用 Claude？

Claude 3.5 Sonnet 的 code review 能力确实最强（2026 年 5 月为止的体验），但：

- 它在 GitHub Models 里**没有免费通道**
- 必须配 `ANTHROPIC_API_KEY`，按 token 计费约 $0.03-0.08 一次 review
- 单人 / 小团队的 lhx-kit，**GPT-4o 的质量完全够用**
- 如果你愿意付费 $5-10/月，可以替换 GPT-4o 为 Claude 3.5 Sonnet 走 [claude-code-action](https://github.com/anthropics/claude-code-action)

**选型原则**：免费版够用时不上付费版；什么时候真感觉"质量吃亏了"再升级，别提前花钱。

---

## 🚦 为什么 `ai-autofix` 刻意不用 LLM？

这条 workflow 做的事是 `biome check --write`。**Biome 自己知道每条规则怎么修**，LLM 在这里是**负价值**：

- ❌ **不确定性**：同一份代码，LLM 可能每次修得不一样
- ❌ **幻觉风险**：LLM 可能"顺手"改掉别的东西（你只想格式化，它重命名了变量）
- ❌ **token 消耗**：每次上百 KB 的代码喂进模型，换来 Biome 一秒就能做的事
- ❌ **安全面扩大**：多一个 LLM 调用就多一次 prompt injection 的机会

**原则**：**"能用确定性工具时坚决不用 LLM"**。这是每一条 AI workflow 设计时都应该反问的第一句话。

---

## 🛡️ `ai-code-fix` 的 4 层安全门

让 AI "改代码开 PR" 是整套系统里**最危险**的动作。下面是实际部署的 4 层保护：

### 第 1 层：`author_association` 白名单

```yaml
if: >-
  contains(fromJSON('["OWNER", "MEMBER", "COLLABORATOR"]'),
           github.event.comment.author_association)
```

**路过的陌生人无法触发**。单这一行就拦住了 99% 的滥用。

### 第 2 层：Blocked path 列表

```js
const BLOCKED = [/^pnpm-lock\.yaml$/, /^\.changeset\//, /\/dist\//, ...];
```

模型想改 `pnpm-lock.yaml` 或 `.changeset/*` 时直接拒绝应用，因为：
- lockfile 是 `pnpm install --lockfile-only` 的产物，手改风险极大
- `.changeset/*.md` 是人类签字，AI 不该代签

### 第 3 层：自检（biome + typecheck）+ 一次迭代

```
AI 生成 patch → apply → 跑 biome --write + typecheck
                               ↓ 失败？
              重新喂给模型 → 第 2 次 patch → 再跑自检
                               ↓ 还失败？
              降级成 issue 评论（不 push）
```

这是业界对 AI 代码质量**最有效**的单一缓解措施。失败一次给一次迭代机会，但不无限重试——**两次失败就降级**，避免 workflow 跑偏。

### 第 4 层：Draft PR + 显眼免责

即使自检通过，**永远**开 draft PR：
- 不会触发 ready-for-review 的审阅要求
- 不会自动合并
- PR body 第一行就写 `⚠️ This PR was AI-generated`
- 维护者必须主动标记 ready 才能进入正常流程

**这条的本质**：不管 AI 多自信，最终拍板的必须是人类。

---

## 🧪 prompt 设计的 3 个陷阱

写 AI workflow 时栽过的坑，按频率排序：

### 陷阱 1：期望模型"严格输出 JSON"但没给 schema

❌ **常见写法**：
```
output a JSON patch plan
```
模型会输出：
```
Sure! Here's my patch plan:
```json
{...}
```
Let me know if you need adjustments.
```

✅ **正确写法**（本仓库的 `ai-code-fix.yaml`）：
```
Your output MUST be a single valid JSON object (no prose, no fences) with this exact shape:
{ "plan": string, "files": [{"path": string, "action": "create"|"update", "content": string}], ... }
```

再加一层 **defensive parsing**：
```js
let raw = response.trim();
raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
// 然后才 JSON.parse
```

### 陷阱 2：prompt 里夹 ``` 引号 / markdown 字符

- Action YAML 里 `system-prompt:` 用 `|` multi-line scalar 时，**YAML 缩进敏感**
- 里面的 \` 和 `"` 可以不转义，但 `${{ }}` 仍会被 actions 展开
- 用户 PR title 里带 `"`、`${{`、` ``` ` 都可能破坏整个 prompt

**缓解**：把用户输入放在 prompt **末尾**的 `${{ steps.x.outputs.y }}` 引用，而不是 system prompt 里。

### 陷阱 3：忘记 bot-loop 防护

典型错误：
- `ai-review-gpt` 评论后 → `ai-review-gemini` 把它当作 PR 新评论 → 再 review 一次 → 无限循环
- `ai-triage` 欢迎评论被 `ai-triage` 再次 triage

**三条必配的防护**：
```yaml
# 1. 过滤 bot 触发
github.event.comment.user.type != 'Bot'

# 2. 过滤含 AI marker 的评论体
!contains(github.event.comment.body, '🤖')

# 3. concurrency group + cancel-in-progress
concurrency:
  group: xxx-${{ github.event.issue.number }}
  cancel-in-progress: true
```

---

## 📊 典型 PR 的 AI 反馈流

假设一个 PR 打开，你会在 10~60 秒内看到：

```
┌──────────────────────────────────────────────────┐
│ 💬 @your-name                                    │
│ feat(cli): add --watch flag                      │
│ 3 commits · 5 files changed                      │
└──────────────────────────────────────────────────┘

   ⬇ 15s

┌──────────────────────────────────────────────────┐
│ 🤖 lhx-kit-bot commented                         │
│                                                  │
│  ## 🎯 Verdict                                   │
│  🟡 approve with nits                            │
│                                                  │
│  ## ⚠️ Concerns                                  │
│  - packages/cli/src/commands/dev.ts:42 ...       │
│  ...                                             │
│                                                  │
│  — 🤖 GPT-4o review via GitHub Models            │
└──────────────────────────────────────────────────┘

   ⬇ 20s

┌──────────────────────────────────────────────────┐
│ 🤖 lhx-kit-bot commented                         │
│                                                  │
│  ## 🧭 Cross-file / architectural observations   │
│  - The --watch flag bypasses existing            │
│    project.config.ts validation; see ...         │
│                                                  │
│  — 🤖 Gemini second-opinion via GitHub Models    │
└──────────────────────────────────────────────────┘
```

然后是维护者自己的 review。整个过程**零成本、零配置、零 secret**。

---

## 🔧 触发命令速查

| 场景 | 命令（在对应地方评论） |
|---|---|
| PR 里想让 biome 自动格式化当前分支 | `@bot-fix-lint` |
| issue 里想让 AI 起草代码修复 → 开 draft PR | `@ai-bot fix <具体指令>` |
| issue 里问技术问题 | `@ai-bot <问题>` |
| issue 里想让 AI 起草一篇新文档 | `@ai-docs draft <topic>` |
| issue 里想让 AI 润色已有文档 | `@ai-docs polish apps/docs/docs/<path>` |
| issue 想让 AI 总结长讨论串 | 打标签 `ai-summary` |

详细用法见 [CLI 参考](../cli/reference) 的对应章节。

---

## 🎛️ 调参指南

| 想让 AI 更"谨慎" | 怎么改 |
|---|---|
| 限制它能改的包 | 在 `ai-code-fix.yaml` 的 `BLOCKED` 数组里加 regex |
| 降低模型一次输出的规模 | 调小 `max-tokens`（过长就截断，强制模型简短） |
| 缩小可触发人群 | `author_association` 数组移除 `COLLABORATOR` 只留 `OWNER/MEMBER` |
| 增加自检严格度 | 自检步骤里加 `pnpm test` / `pnpm -r build` |
| 增加迭代次数 | 给 `ai-code-fix` 加第三次 attempt（不推荐，边际收益递减） |

---

## 📚 相关文档

- [🛠️ 工程化总览](./overview)
- [🤖 GitHub AI 自动流基础](./ai-automation) — 最初的 3 条 issue 自动化 workflow
- [🚀 发布流水线](./release-pipeline)
- [⚙️ CI 策略](./ci-strategy)
- [GitHub Models 官方文档](https://docs.github.com/en/github-models)
- [actions/ai-inference](https://github.com/actions/ai-inference)

---

<div style="text-align:center;opacity:0.7;margin-top:2rem">
  本篇对应 lhx-kit 2026-05-03 的 AI workflow 扩展。<br />
  5 条 workflow 共享一个设计哲学：<strong>用确定性解决确定性问题，用 AI 处理不确定性问题，用人审核最终产出。</strong>
</div>
