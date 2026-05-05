# `_shared/` — cross-template base layer

Files in this directory are inherited by every top-level template that declares
`"extends": "_shared"` in its `template.json`. The merge engine copies
`_shared/files/` first, then template-specific `files/`, then features (in
priority order).

## Override semantics

For most files, the **template wins** when both `_shared/files/<path>` and
`<template>/files/<path>` exist — the template-specific copy replaces the
shared one byte-for-byte.

Two exceptions:

1. **`.gitignore`** is appended, not replaced. The shared base provides the
   universal rules (`node_modules`, `dist`, `.DS_Send`, etc.); templates and
   features can append framework-specific lines (e.g. vue3-mpa adds the
   `unplugin-auto-import` artifact paths).

2. **`package.json`** is deep-merged — see `mergePackageJson` in
   `packages/cli/src/templates.ts`. Shared files contribute the husky/biome
   devDeps; template files add framework deps; features overlay UI / DB / CSS
   deps.

## What lives here

| File | Purpose |
|---|---|
| `.editorconfig` | Editor consistency baseline (LF, 2-space, trim trailing) |
| `.nvmrc` | Node version pin (`20.11.0`) |
| `.npmrc` | pnpm install behavior |
| `.dockerignore` | Universal Docker context exclusions |
| `.gitignore` | Universal git ignore base |
| `biome.json` | Code-quality config — Biome lints + formats TS/JS/JSON |
| `commitlint.config.cjs` | Conventional commits |
| `lint-staged.config.cjs` | Calls `biome check --write` on staged files |
| `.husky/{commit-msg,pre-commit,pre-push}` | Git hooks calling commitlint / lint-staged / `biome check .` |

## What does NOT live here

- Framework deps (Vue / React / Express ...) — those belong in the template's
  own `files/package.json.template`
- Source code — only configuration and ignore files belong in `_shared/`
- ESLint / Prettier configs — lhx-kit is Biome-only
