# @lhx-kit/skills

中文 · [English](./README.md)

> lhx-kit 项目的 **AI Agent 中立** 技能包。一次用纯 Markdown + JSON 写完，
> 一键装进任何 AI 编程助手。

## 为什么要这个

现在每个 AI 编程助手（CodeBuddy / Cursor / Claude Code / Copilot instructions 等）
都有自己的 "skill / rule / context" 概念 —— 本质上都是让 agent 回答前先读的
一段"过程性知识"。但每个工具格式不同、目录不同。**同一份知识写 4 遍是浪费，
绑定某一家更糟糕**。

本包把知识保存成**唯一规范形态**（`skill.json` + `SKILL.md`），
靠 adapters 生成各家需要的格式。

## 安装

```bash
pnpm add -D @lhx-kit/skills
```

## 编程 API

```ts
import {listSkills, installSkills, renderSkill} from '@lhx-kit/skills';

// 枚举内置技能
const skills = await listSkills();
skills.forEach(s => console.log(s.manifest.name, '-', s.manifest.title));

// 安装到当前项目
await installSkills(skills, {
  projectRoot: process.cwd(),
  targets: ['codebuddy', 'cursor'],
  skipIfExists: true          // 已存在则跳过；默认 false（覆盖）
});

// 只渲染不落盘（dry-run / 自定义写入）
const outputs = renderSkill(skills[0], 'cursor', process.cwd());
```

## 通过 CLI 使用（已装 `@lhx-kit/cli`）

```bash
lhx-cli skills list                                    # 列出所有
lhx-cli skills add add-page configure-cdn              # 交互式选择
lhx-cli skills add --all --targets=codebuddy,cursor    # 批量装进多个 agent
lhx-cli skills sync                                    # 重新渲染全部
```

## 内置技能清单

| 名称 | 能力 |
| --- | --- |
| `lhx-project-overview` | 项目全景图（always-apply） |
| `add-page` | 如何新增一个页面 |
| `configure-cdn` | 把第三方库移到 CDN + 回落 |
| `mobile-adaptation` | rem / postcss-pxtorem / deviceOverrides |
| `offline-packaging` | 混合离线包 + 清单 + 回滚 |
| `renderer-schema` | JSON 驱动 UI（@lhx-kit/renderer） |
| `chunk-optimization` | 为啥不再进一步拆 react-dom |
| `troubleshooting` | 常见问题排查手册 |

## 支持的目标 Agent

| 目标 | 输出路径 | 格式 |
| --- | --- | --- |
| `codebuddy` | `.codebuddy/skills/<名>/SKILL.md` | YAML frontmatter（`name` + `description`） |
| `cursor` | `.cursor/rules/<名>.mdc` | MDC frontmatter（`description` + `globs` + `alwaysApply`） |
| `claude` | `.claude/skills/<名>/SKILL.md` | YAML frontmatter（`name` + `description`） |
| `plain` | `docs/ai-skills/<名>.md` | 纯 Markdown + 内嵌头部（无 frontmatter） |

## 如何新增 skill

```text
packages/skills/skills/<kebab-name>/
├── skill.json      # 元数据（zod 校验）
└── SKILL.md        # 正文（纯 Markdown，不要加 frontmatter）
```

```json title="skill.json"
{
  "name": "my-skill",
  "title": "我的技能",
  "description": "一段话简介。Agent 读它来决定要不要用这个 skill。",
  "version": "0.1.0",
  "tags": ["话题-a", "话题-b"],
  "triggers": ["触发短语 1", "触发短语 2"],
  "globs": ["src/**/*.ts"],
  "alwaysApply": false,
  "references": [
    {"title": "文档", "url": "https://example.com/docs"}
  ]
}
```

元数据在加载时经 zod 校验 —— 格式不对就在 `pnpm -F @lhx-kit/skills build`
阶段直接挂掉，带精确路径错误信息。

## 设计取舍

- **唯一真源，一生多**：绝不手工维护任何 vendor 格式 markdown
- **Agent 优先，人类也能读**：每份 SKILL.md 没有 frontmatter 魔法时也是可读文档
- **默认安全**：adapter 不会覆盖已存在文件（除非 `--force` / `skipIfExists: false`）
- **易扩展**：新增一个目标 agent = 在 `src/adapters/` 加一个文件，
  在 `src/index.ts#adapters` 注册一下，结束

## 不包含（刻意为之）

- 你们团队的编码规范（放你们自己的 `.cursor/rules/` 去）
- 业务域模型（那是项目知识，不是工具知识）
- API Key / 密钥（永远别提交；用环境变量引用）

## 协议

[MIT](./LICENSE) © luhanxin
