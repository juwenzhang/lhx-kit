---
'@lhx-kit/cli': minor
---

Phase 1 of `expand-cli-template-ecosystem`: shared layer + Biome migration + target/CSS features + interactive wizard + post-scaffold handoff + dynamic version resolution.

- **`templates/_shared/`** — cross-template baseline. Carries `biome.json`, `.editorconfig`, `.npmrc`, `.nvmrc`, `.dockerignore`, `commitlint.config.cjs`, `lint-staged.config.cjs` (now using `biome check --write`), and `.husky/{commit-msg,pre-commit,pre-push}`. Templates opt in via `"extends": "_shared"` in their `template.json`.
- **`templates/_features/`** — cross-template feature catalog. Phase 1 ships:
  - `target-pc` / `target-mobile` / `target-hybrid` (mutex group `target`, default `hybrid`). Hybrid auto-includes the `offline` feature.
  - `css-pre-{less,sass,none}` (mutex `css-preprocessor`, default `less`)
  - `css-atomic-{unocss,tailwind,none}` (mutex `css-atomic`, default `unocss`)
  - `css-styling-{modules,emotion,styled,vanilla-extract,vue-scoped,none}` (mutex `css-styling`, default `modules`; React-only and Vue-only members hard-validated)
  - `codebuddy-skills` (opt-in openspec/+.codebuddy/ scaffold)
- **Schemas** (`src/schema.ts`): zod-validated `FeatureManifest` and `PatchOp` (insert-after / insert-before / replace / append / prepend / merge-imports).
- **Anchor-based source-edit** primitives in `src/templates.ts`. Hard-fails when a feature points at a missing anchor.
- **Biome-only stack** — `vue3-mpa` and `react-mpa` no longer ship `eslint.config.js`, `.prettierrc.json`, or any eslint/prettier devDeps. `lint-staged` calls `biome check --write` on every file pattern.
- **Interactive wizard** (`src/wizard.ts`, uses `@clack/prompts`) — runs whenever `--yes` is absent and any of project name / template / features is missing. Mixed-mode skips supplied steps. Branches by template type, narrows compatibility-incompatible options, supports type-to-filter on long lists, shows a summary before writing.
- **Post-scaffold handoff** (`src/post-scaffold.ts`) — bilingual zh+en footer printed after every successful scaffold. Hardcoded URLs (`https://juwenzhang.github.io/lhx-kit/index.html` + `https://github.com/juwenzhang/lhx-kit/issues`). No telemetry, no version-check ping.
- **Dynamic version resolution** (`src/version-resolver.ts`) — by default, `npm view <pkg> version` is run for each `@lhx-kit/*` dep so generated projects pick up the latest published version of every kit package. Falls back gracefully to the local CLI version when offline. Override with `--lhx-version=local` (skip network) or an explicit range like `--lhx-version=^1.2.0`.
- **New flags**: `--target`, `--css-preprocessor`, `--css-atomic`, `--css-styling`, `--lhx-version`. Inconsistent flag-vs-feature combinations exit 2 with a "did you mean" hint.

**Breaking changes for projects scaffolded via the old CLI**: existing scaffolded projects are NOT auto-migrated. The next `lhx-cli create` produces output with `biome.json` instead of `eslint.config.js` + `.prettierrc.json`, the `_shared/` baseline, and the new feature pipeline. Existing user code is unaffected.
