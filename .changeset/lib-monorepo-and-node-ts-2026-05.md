---
"@lhx-kit/cli": minor
---

feat(cli): lib monorepo per-package README, workspaceOverlay for bundler devDeps, node-ts template, lib wizard branch

- **schema + templates**: add `workspaceOverlay` to feature manifests — always applied to the workspace root; distinguishes between per-package scripts (`packageOverlay`) and workspace-level devDependencies (`workspaceOverlay`) in monorepo templates
- **bundler features** (tsup / rslib / rollup): move all `devDependencies` from `packageOverlay` into `workspaceOverlay` so monorepo member packages no longer carry redundant build-tool deps; scripts (`build`, `dev`) remain in `packageOverlay` and are expanded per-package via `monorepoExpand`
- **lib-monorepo**: add `packages/core/README.md` and `packages/utils/README.md` templates (both packages listed `README.md` in `"files"` but the file was never scaffolded)
- **node-ts template**: new `node-ts` template — minimal Node.js + TypeScript service without a web framework (pino logger, zod env, tsx dev, tsc prod build, multistage Dockerfile, graceful shutdown)
- **wizard**: add library wizard branch — when the chosen template is a library (`lib-single` / `lib-monorepo`), the wizard now prompts for bundler (tsup / rslib / rollup) and output formats (ESM / CJS / UMD) rather than silently auto-injecting defaults; the summary panel reflects the selections
