---
'@lhx-kit/cli': patch
'@lhx-kit/config': patch
'@lhx-kit/offline': patch
'@lhx-kit/renderer': patch
'@lhx-kit/runtime': patch
'@lhx-kit/skills': patch
'@lhx-kit/tsconfig': patch
'@lhx-kit/vite-plugin': patch
---

chore(repo): 2026-05 AI workflow hardening & tri-model PR review upgrade

This is a repository-level chore release — **no runtime code inside any
`@lhx-kit/*` package has changed**. Every published package's built
artifacts are byte-identical to the previous version. The patch bump
exists purely to keep the `fixed` group in lock-step and to surface the
following changes in each package's CHANGELOG / npm release notes:

### 🤖 AI collaboration pipeline now battle-tested

After an end-to-end smoke test run, five latent issues were fixed in the
AI workflows and the full 9-workflow suite is now verified operational:

- **Tri-model PR review** — `google/gemini-2.5-flash` no longer exists on
  GitHub Models catalog, so `ai-review-gemini.yaml` was replaced by
  `ai-review-llama.yaml` (`meta/llama-3.3-70b-instruct`) and a third
  reviewer `ai-review-deepseek.yaml` (`deepseek/deepseek-v3-0324`) was
  added. The three reviewers have intentionally-non-overlapping prompt
  focuses (correctness / architecture / reasoning-chain) so cross-model
  agreement / disagreement becomes a useful confidence signal.
- **`@ai-bot` command disambiguation** — `ai-assistant.yaml` now excludes
  `@ai-bot fix …` (which belongs to `ai-code-fix.yaml`), eliminating a
  double-trigger race.
- **AI commits bypass husky hooks** — `ai-code-fix.yaml`,
  `ai-autofix.yaml`, and `ai-docs-assistant.yaml` all use
  `git commit --no-verify` + `git push --no-verify`. The patch they
  produce has already passed explicit `biome` + `typecheck` self-check
  steps; running husky again on the runner was both redundant and prone
  to tripping commitlint on synthesized commit messages.
- **Shell-metachar-safe commits** — replaced `execSync(\`git commit -m "…"\`)`
  with `execFileSync('git', ['commit', '-m', …])` so user-supplied
  instructions containing backticks / `$(…)` / `$VAR` cannot break
  the commit step.
- **Robust docs-draft parser** — `ai-docs-assistant.yaml` previously
  asked the model for a JSON envelope whose `content` field held the
  whole markdown body. JSON escaping was fragile whenever the article
  included nested fenced code. The model now emits a two-part response
  separated by a literal `---8<--- CONTENT BELOW ---8<---` line, so the
  body can contain any character, including triple backticks.

### 📘 Documentation

- Brand-new end-user manual: [`apps/docs/docs/engineering/ai-commands.md`](https://juwenzhang.github.io/lhx-kit/engineering/ai-commands)
  covering all 9 AI workflows with trigger locations, permission model,
  sample interactions, timeouts, and a troubleshooting map.
- [`ai-review-strategy.md`](https://juwenzhang.github.io/lhx-kit/engineering/ai-review-strategy)
  rewritten for the tri-model topology and now explains why Gemini was
  dropped (catalog change) plus why Claude is not wired in (no free tier
  on GitHub Models).
- Root `README.md` / `README.zh-CN.md`, the Rspress navbar/sidebar, and
  the CLI reference were all updated to mention the three-reviewer setup
  and the new manual.

### 🛡️ Why a patch for *every* package?

`@lhx-kit/*` uses a Changesets `fixed` group policy — the 8 packages
always ship the same version number so users never have to think about
compatibility between them. Even purely repository-level changes get a
patch bump on every member so the version and the git history stay
aligned.

If you consume only the published tarballs, **there is nothing to do**:
`pnpm up @lhx-kit/*` or ignore this release entirely.
