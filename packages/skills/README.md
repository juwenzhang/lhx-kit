# @lhx-kit/skills

[中文](./README.zh-CN.md) · English

> Agent-agnostic skill pack for lhx-kit projects. Write once as plain
> Markdown + JSON, install into **any** AI coding assistant.

## Why

Every AI coding assistant (CodeBuddy, Cursor, Claude Code, GitHub Copilot
with instructions files, …) now supports some form of "skills" / "rules" /
"context" — piece of procedural knowledge the agent reads before answering.
Each tool invents its own file format and directory. Authoring the same
knowledge 4 times is wasteful; locking into one vendor is worse.

This package keeps the knowledge in **one canonical form** and uses tiny
adapters to produce the vendor-specific files.

## Install

```bash
pnpm add -D @lhx-kit/skills
```

## Programmatic API

```ts
import {listSkills, installSkills, renderSkill} from '@lhx-kit/skills';

// Enumerate bundled skills
const skills = await listSkills();
skills.forEach(s => console.log(s.manifest.name, '-', s.manifest.title));

// Install into a project
await installSkills(skills, {
  projectRoot: process.cwd(),
  targets: ['codebuddy', 'cursor'],
  skipIfExists: true
});

// Render without writing (dry run / custom writer)
const outputs = renderSkill(skills[0], 'cursor', process.cwd());
outputs.forEach(o => console.log(o.filePath, o.content.length));
```

## Via `lhx-cli`

When `@lhx-kit/cli` is installed:

```bash
lhx-cli skills list                                    # enumerate
lhx-cli skills add add-page configure-cdn              # interactive picker
lhx-cli skills add --all --targets=codebuddy,cursor    # bulk
lhx-cli skills sync                                    # re-render everything
```

## Bundled Skills

| Name | What |
| --- | --- |
| `lhx-project-overview` | Project-wide map (always-apply) |
| `add-page` | How to scaffold a new page |
| `configure-cdn` | Moving vendor deps to CDN with fallback |
| `mobile-adaptation` | rem / postcss-pxtorem / deviceOverrides |
| `offline-packaging` | Hybrid zip + manifest + rollback |
| `renderer-schema` | JSON-driven UI (@lhx-kit/renderer) |
| `chunk-optimization` | Why we don't split react-dom further |
| `troubleshooting` | Diagnostic playbook for common issues |

## Supported Targets

| Target | Output Path | Format |
| --- | --- | --- |
| `codebuddy` | `.codebuddy/skills/<name>/SKILL.md` | YAML frontmatter (`name` + `description`) |
| `cursor` | `.cursor/rules/<name>.mdc` | MDC frontmatter (`description` + `globs` + `alwaysApply`) |
| `claude` | `.claude/skills/<name>/SKILL.md` | YAML frontmatter (`name` + `description`) |
| `plain` | `docs/ai-skills/<name>.md` | Plain Markdown with inline header (no frontmatter) |

## Authoring a New Skill

```text
packages/skills/skills/<kebab-name>/
├── skill.json      # manifest (zod-validated)
└── SKILL.md        # body (plain Markdown; no frontmatter)
```

```json title="skill.json"
{
  "name": "my-skill",
  "title": "My Skill",
  "description": "One paragraph. Agents read this to decide engagement.",
  "version": "0.1.0",
  "tags": ["topic-a", "topic-b"],
  "triggers": ["phrase one", "phrase two"],
  "globs": ["src/**/*.ts"],
  "alwaysApply": false,
  "references": [
    {"title": "Docs", "url": "https://example.com/docs"}
  ]
}
```

The manifest is validated at load time via zod — malformed `skill.json`
fails `pnpm -F @lhx-kit/skills build` with a precise error path.

## Design Principles

- **One source, many formats**. Never hand-write vendor-specific markdown.
- **Agent-first Markdown**. Every skill body reads well to a human too.
- **Safe defaults**. Adapters never overwrite without `--force` from CLI
  (or `skipIfExists: false` in the programmatic API).
- **Extensible**. Add a new target in one file under `src/adapters/`, wire
  it into `adapters` registry in `src/index.ts`, done.

## Not Included (By Choice)

- Team-specific style guides (put those in your own `.cursor/rules/`)
- Domain data models (those are project knowledge, not toolkit knowledge)
- API keys / secrets (never commit; reference env vars instead)

## License

[MIT](./LICENSE) © luhanxin

<!-- lhx-readme-footer:begin -->

---

## 📦 Install

```bash
npm install @lhx-kit/skills
# or
pnpm add @lhx-kit/skills
```

![npm](https://img.shields.io/npm/v/%40lhx-kit%2Fskills.svg) 
![provenance](https://img.shields.io/badge/provenance-verified-brightgreen?logo=npm)

## 📖 Docs & further reading

- 🏠 Project home: <https://juwenzhang.github.io/lhx-kit/>
- 📘 Package docs: [/cli/reference](https://juwenzhang.github.io/lhx-kit/cli/reference), [/guide/architecture](https://juwenzhang.github.io/lhx-kit/guide/architecture)
- 🛠️ Engineering column: [/engineering/overview](https://juwenzhang.github.io/lhx-kit/engineering/overview)
- 💬 Issues & discussions: <https://github.com/juwenzhang/lhx-kit/issues>

## 🤝 Contributing

PRs welcome. Please read [CONTRIBUTING.md](https://github.com/juwenzhang/lhx-kit/blob/master/CONTRIBUTING.md) and run `pnpm changeset` for any user-visible change. First-time contributors: look for labels `good first issue` and `help wanted`.

## 📄 License

[MIT](https://github.com/juwenzhang/lhx-kit/blob/master/LICENSE) © luhanxin

<sub>Part of the [`@lhx-kit`](https://github.com/juwenzhang/lhx-kit) monorepo. Every release is OIDC-signed via npm Trusted Publishing — verify the provenance attestation on the npm package page.</sub>

<!-- lhx-readme-footer:end -->
