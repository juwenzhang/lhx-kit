# 🎯 AI 协作策略：三模型评审 + 受控自动修复

> 在 lhx-kit 仓库里，**6 条 AI workflow 组成了一条完整的"AI 协作流水线"**。本文讲清楚每条 workflow 的边界、选型背后的 trade-off，以及 prompt 设计里容易踩的坑。不是 "怎么接 LLM"，而是 **"多 AI 协作在真实 OSS 项目里怎么落地才不翻车"**。

---

## 🗺️ 全景：6 条 workflow 的分工

```
                 PR 事件                           Issue 事件
┌─────────────────────────────────┬────────────────────────────────┐
│  ai-review-gpt.yaml (GPT-4o)    │  ai-triage.yaml                │
│  → 正确性 / 安全 / 破坏性变更   │  → 新 issue 自动分类 + 欢迎     │
│                                 │                                │
│  ai-review-llama.yaml (Llama)   │  ai-assistant.yaml             │
│  → 跨文件 / 文档 / 命名一致性   │  → @ai-bot 问答                 │
│                                 │                                │
│  ai-review-deepseek.yaml (DS V3)│  ai-summarize.yaml             │
│  → 边界条件 / 推理链 / 测试覆盖 │  → 标签触发长讨论 TL;DR         │
│                                 │                                │
│  ai-autofix.yaml (无 LLM)       │  ai-code-fix.yaml (GPT-4o)     │
│  → @bot-fix-lint 确定性修复     │  → @ai-bot fix 受控代码修改     │
│                                 │                                │
│                                 │  ai-docs-assistant.yaml (GPT-4o)│
│                                 │  → @ai-docs draft / polish     │
└─────────────────────────────────┴────────────────────────────────┘
```

### 能力矩阵

| Workflow | 触发 | 模型 | 写代码? | 开 PR? | 成本 |
|---|---|---|---|---|---|
| `ai-review-gpt` | PR 事件 | `openai/gpt-4o` | ❌ | ❌（只评论） | 🟢 免费 |
| `ai-review-llama` | PR 事件 | `meta/llama-3.3-70b-instruct` | ❌ | ❌（只评论） | 🟢 免费 |
| `ai-review-deepseek` | PR 事件 | `deepseek/deepseek-v3-0324` | ❌ | ❌（只评论） | 🟢 免费 |
| `ai-autofix` | `@bot-fix-lint` | **无 LLM** | ✅ Biome 确定性 | 提交到 PR 分支 | 🟢 免费 |
| `ai-code-fix` | `@ai-bot fix` | `openai/gpt-4o` | ✅ AI 生成 | **Draft** PR | 🟢 免费 |
| `ai-docs-assistant` | `@ai-docs` | `openai/gpt-4o` | ✅ MD 生成 | **Draft** PR | 🟢 免费 |
| `ai-triage` / `ai-assistant` / `ai-summarize` | Issue 事件 | `openai/gpt-4o-mini` | ❌ | ❌ | 🟢 免费 |

**所有 workflow 都跑在 [GitHub Models](https://docs.github.com/en/github-models) 上，公开仓库完全免费、零 API key**。

---

## 🧠 为什么是 GPT-4o + Llama + DeepSeek 三个 reviewer？

### 选型理由

三个 AI 同时 review 的价值**不是三倍覆盖率**，而是 **"跨 publisher 的分歧信号"**：

> 它们各自来自 **OpenAI / Meta / DeepSeek** 三个完全不同的训练 pipeline——不同的预训练语料、不同的 RLHF 策略、不同的推理倾向。
> 当它们对同一行代码给出**相反判断**时，真人 review 就知道"这里值得多看一眼"；
> 当它们**高度一致**时，你对那条建议的信心就该翻倍。

这是一种很低成本的**跨家族集成（cross-family ensemble）**——不需要训练、不需要融合逻辑，让三个模型各自跑，**把"比对"的工作交给人**。

### 三个模型的分工（刻意错位）

为了让三条评论**互补而非重复**，我们给每个模型写了**主题不同**的 system prompt：

| 模型 | 主题 prompt 聚焦 | 输出常见特征 |
|---|---|---|
| **GPT-4o**（generalist） | 正确性、安全、破坏性、verdict | 条理分明的 bullets，verdict 明确 |
| **Llama 3.3 70B**（open weights） | 跨文件架构、文档、命名一致性 | 爱谈 "下游影响" 和 "是否需要改 README" |
| **DeepSeek V3**（reasoning） | 边界条件、推理链、测试覆盖 | "if X then Y" 风格，会找 off-by-one |

**刻意避免重叠**是关键——如果三个模型都盯正确性，你会得到三条几乎一模一样的评论，反而淹没真人 review。

### 为什么不是 4 个、5 个？

- **边际收益递减**：第 4 个模型 70% 的建议会和前三个重叠
- **信号噪声比下降**：PR 评论区出现 4+ 条机器人消息会淹没真人 review
- **三个已经能产出"分歧矩阵"**：OpenAI ↔ Meta、OpenAI ↔ DeepSeek、Meta ↔ DeepSeek 三组比对，足够人类 triage

所以 **"3 正好，4 过多"** 在实操中反复验证过。

### 为什么不用 Claude？

Claude 3.5 Sonnet 的 code review 能力确实最强（2026 年 5 月为止的体验），但：

- 它在 GitHub Models 里**没有免费通道**（catalog 里完全没有 Anthropic）
- 必须配 `ANTHROPIC_API_KEY`，按 token 计费约 $0.03-0.08 一次 review
- 单人 / 小团队的 lhx-kit，**GPT-4o + Llama + DeepSeek 的组合质量完全够用**
- 如果你愿意付费 $5-10/月，可以替换其中一个模型为 Claude 3.5 Sonnet 走 [claude-code-action](https://github.com/anthropics/claude-code-action)

**选型原则**：免费版够用时不上付费版；什么时候真感觉"质量吃亏了"再升级，别提前花钱。

### 为什么不是 Gemini？

早期版本的这套 workflow 里曾经用过 `google/gemini-2.5-flash` 做 second opinion。**2026 年 5 月起 GitHub Models catalog 里不再有任何 Google Gemini 模型**（`gh api /catalog/models` 验证可见）—— 所以我们切到了 Meta Llama 3.3 70B 作为替代。这也是一个提醒：**模型 ID 不是 API 契约**，GitHub Models 的 catalog 会变，workflow 里写死模型 ID 时最好在 PR 描述里解释原因，未来移除才好排查。

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
- `ai-review-gpt` 评论后 → `ai-review-llama` / `ai-review-deepseek` 把它当作 PR 新评论 → 再 review 一次 → 无限循环
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

假设一个 PR 打开，你会在 10~90 秒内依次看到三条 review：

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
│  — 🤖 Llama 3.3 70B second-opinion via GitHub    │
│        Models                                    │
└──────────────────────────────────────────────────┘

   ⬇ 30s

┌──────────────────────────────────────────────────┐
│ 🤖 lhx-kit-bot commented                         │
│                                                  │
│  ## 🧠 Edge cases & invariants                   │
│  - What happens if --watch is passed without     │
│    a matching project.config.ts section?         │
│                                                  │
│  ## 🧪 Test coverage gaps                        │
│  - No test currently asserts ...                 │
│                                                  │
│  ## 🤝 Agreement check                           │
│  - Confirms Llama's point about config bypass    │
│                                                  │
│  — 🤖 DeepSeek V3 reasoning lens via GitHub      │
│        Models                                    │
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
- [🎮 AI 命令使用手册（8 条 workflow 速查）](./ai-commands) — 用户视角的命令速查 / 排错
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
