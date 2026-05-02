---
'@lhx-kit/cli': minor
'@lhx-kit/skills': minor
---

Add `lhx-cli add package <name>` to scaffold a new publishable workspace
under `packages/<name>` inside a pnpm monorepo.

- New `add package` kind in `@lhx-kit/cli` creates package.json,
  tsconfig.json, tsup.config.ts, src/index.ts, README.md, README.zh-CN.md,
  and LICENSE — a minimal but correct TypeScript library ready for
  `pnpm install` + `pnpm build` + changeset-driven publishing.
- Walks up from cwd looking for `pnpm-workspace.yaml` + `packages/` to
  validate it's running in a monorepo root; prints an advisory message
  with alternative commands when it isn't.
- Auto-detects the npm scope from the root `package.json` (falls back to
  `@lhx-kit`), so forks of the monorepo scaffold with their own scope
  without any CLI flag.
- Intentionally does NOT create `CHANGELOG.md` (owned by Changesets) or
  a `tests/` directory (kept minimal; users add when needed).
- `@lhx-kit/skills` gains a new `create-package` knowledge module with
  the full walkthrough, manual fallback, and post-scaffold checklist.
  Install it into any AI assistant via `lhx-cli skills add create-package`.
- `SkillManifestSchema` gains an optional `command` field so
  behaviour-type skills can declare the canonical CLI invocation; AI
  agents reading the manifest now know to prefer the CLI over hand
  editing. Existing `add-page` and `offline-packaging` skills were
  backfilled; knowledge-only skills (troubleshooting, mobile-adaptation,
  etc.) correctly leave the field undefined.
