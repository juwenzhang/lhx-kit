# Changesets

This directory is used by [Changesets](https://github.com/changesets/changesets)
to track version bumps and generate `CHANGELOG.md` files.

## Workflow

### 1. Add a changeset when you make a change

```bash
pnpm changeset
```

Pick the packages you modified, select `patch` / `minor` / `major`, and
write a summary. The CLI writes a markdown file here (e.g.
`.changeset/shiny-birds-dream.md`). **Commit that file** with your PR.

### 2. Version bump happens automatically (in CI)

When a PR lands on `master`, the **Changesets GitHub Action** opens (or
updates) a dedicated "Version Packages" PR that:

- Consumes every pending changeset file in this directory
- Bumps `package.json` versions of affected packages
- Generates/updates `CHANGELOG.md` for each package
- Deletes the consumed changeset files

Merging that PR triggers the release workflow.

### 3. Publishing

See `.github/workflows/release.yaml`. On merge of the "Version Packages"
PR, the action runs `pnpm release` which invokes `changeset publish` →
pushes to npm and creates GitHub releases.

## Config Highlights (`config.json`)

| Field | Value | Why |
| --- | --- | --- |
| `baseBranch` | `master` | This repo's default branch |
| `access` | `public` | Packages published to the public npm registry |
| `changelog` | `@changesets/changelog-github` | Auto-links PRs + contributors |
| `fixed` | all `@lhx-kit/*` | Entire kit ships as ONE version — users install any combination with peace of mind |
| `ignore` | examples + docs | Apps / demos never publish to npm |

## Choosing a bump level

- **patch** — bug fix, internal refactor, docs only
- **minor** — new user-visible feature, new public API
- **major** — breaking change (API removed, signature changed, behaviour flip)

## Escape hatches

- **Skip changeset for this PR** (trivial change, no publish needed)
  — use the `empty changeset` flow: `pnpm changeset --empty`
- **Pre-release train** (beta / next tag on npm) — see
  [Changesets pre-release docs](https://github.com/changesets/changesets/blob/main/docs/prereleases.md)

## When `private: true` is still on every package

Changesets sees `private: true` and **skips publishing** while still
running version bump + CHANGELOG generation. This lets us rehearse the
flow locally; when ready for public release, remove `private: true` from
each `packages/*/package.json`.
