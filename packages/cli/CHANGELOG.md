# @lhx-kit/cli

## 1.2.2

### Patch Changes

- [#38](https://github.com/juwenzhang/lhx-kit/pull/38) [`295f763`](https://github.com/juwenzhang/lhx-kit/commit/295f763ce9f23e177db98f20e572d343927b5512) Thanks [@juwenzhang](https://github.com/juwenzhang)! - - 修复所有模板 README 中文档链接死链（`lhx-kit.dev` → `juwenzhang.github.io/lhx-kit`）
  - 合并 6 个后端模板为 `micro` + `service` 两个统一模板，framework 改为 feature 轴（`framework-express`/`framework-fastify`/`framework-koa`）
  - 精简 CSS styling feature：移除冗余的 `none`/`vue-scoped`/`emotion`
  - `business-mono` 模板移除 turbo 依赖，改用 pnpm workspace 原生命令
  - `codebuddy-skills` feature 自动添加 `@lhx-kit/skills` 依赖
  - 修复 `resolveLhxKitDepsPerPackage` 逐包 npm view 版本解析，支持 monorepo 子包递归
  - 修复 release workflow npm 版本锁死导致引擎不兼容问题
  - 修复 pre-push hook 缺少 build 步骤导致 typecheck 失败

## 1.2.1

### Patch Changes

- [`64406f5`](https://github.com/juwenzhang/lhx-kit/commit/64406f51d0c7ca34154c9c32a2793c29fdf107d3) Thanks [@juwenzhang](https://github.com/juwenzhang)! - refactor(cli): layered `src/` reorganization + extract inline `add` templates · fix(cli/templates): scaffolded MPA projects now self-contain `lhx-cli` · companion: renderer capability boundary plan

  This release bundles three things: a large internal restructure of
  `@lhx-kit/cli`, a small but user-facing template bugfix, and a repo-level
  chore (the renderer upgrade plan).
  **Public CLI surface — every command name, option flag, and behaviour — is
  byte-identical to the previous release.** Verified via `typecheck` + a full
  smoke pass through `examples/{rmpa,vmpa}` (create / dev / build / add page /
  add package / offline / skills). Existing scripts and CI invocations need no
  changes.

  ### Why

  `packages/cli/src/` had grown into a flat 14-file root that mixed
  infrastructure (CLI bootstrap, context, schema), utilities (UI, semver,
  strings), scaffolding (wizard, templates, version-resolver, post-scaffold),
  and integrations (offline adapter) at one level — and `commands/add.ts`
  alone was **1,022 lines** carrying 600+ lines of `{{var}}`-based inline
  template strings inconsistent with the `<%= var %>` engine `create` already
  used.

  ### What changed

  #### 1. Layered directory structure

  ```
  packages/cli/src/
  ├── bin.ts                      87 lines (was 210) — descriptor loop only
  ├── index.ts                    Public entry
  ├── commands/
  │   ├── create.ts
  │   ├── dev-build.ts            dev / build / preview share VITE_SERVER_OPTIONS
  │   ├── doctor.ts
  │   ├── info.ts
  │   ├── offline.ts              + interactive action selector (was in bin.ts)
  │   ├── skills.ts
  │   ├── upgrade.ts
  │   └── add/                    add command split into index + prompts
  │       ├── index.ts
  │       └── prompts.ts
  ├── core/                       App-internal abstractions
  │   ├── command.ts              CommandDescriptor + registerCommands  (NEW)
  │   ├── context.ts              CliContext factory
  │   ├── project.ts              requireProject / project loading
  │   └── schema.ts               TemplateManifest / FeatureManifest / PatchOp zod
  ├── scaffold/                   Project scaffolding pipeline
  │   ├── templates.ts            renderString / copyStubs / renderStubFile
  │   ├── wizard.ts
  │   ├── version-resolver.ts
  │   └── post-scaffold.ts
  ├── adapters/
  │   └── offline.ts              Offline pipeline adapter
  ├── ast/
  │   └── project-config.ts
  └── utils/                      Pure helpers
      ├── ui.ts
      ├── string.ts               toPascal / toCamel / toTitle / toKebab
      └── semver.ts               toCaretMinor (was duplicated)
  ```

  Three-tier rule: `commands/` → `core/` + `scaffold/` + `adapters/` → `utils/`.
  No upward imports. No circular deps.

  #### 2. `bin.ts` slimmed via `CommandDescriptor` (210 → 87 lines)

  Each command now owns its own CLI surface in its own file via:

  ```ts
  export const offlineCommand: CommandDescriptor = {
    name: 'offline [action] [target]',
    description: '...',
    options: [...],
    run: (context, action, target, options) => runOfflineRoute(context, ...)
  };
  ```

  `bin.ts` is now a fixed-order list + `registerCommands(cli, context, COMMANDS)`
  loop. Adding a new command = create one file + add one entry to the array,
  no `cli.command().option().option()....action()` chain to maintain.

  #### 3. `add` templates extracted from inline strings

  All template content for `lhx-cli add page|component|api|service|store|schema|module|package`
  moved out of `commands/add.ts` and into `packages/cli/templates/_add/<kind>/...`.
  Variable syntax unified to `<%= var %>` (matches `templates/_create/`'s engine).
  File-name templating works natively — `<%= Name %>Landing.vue.template` is
  correctly path-substituted by `renderPath`.

  ```
  packages/cli/templates/_add/
  ├── page/{vue,react}/{entry,router,views/<%= Name %>{Landing,About}}.template
  ├── page/render.json.template
  ├── component/{vue,react}/component.{vue,tsx}.template
  ├── api/api.ts.template, service/service.ts.template
  ├── store/{vue,react}/store.ts.template
  ├── schema/schema.json.template, module/module.ts.template
  └── package/{package.json,tsconfig.json,tsup.config.ts,src/index.ts,README*.md,LICENSE}.template
  ```

  #### 4. New helpers in `scaffold/templates.ts`
  - `copyStubs(options)` — bulk copy + render a template directory tree
  - `renderStubFile(stubFile, vars)` — render a single template file
  - `TemplateVariables` widened with `[key: string]: unknown;` index signature
    so caller-supplied variable bags compose freely

  ### Bugfix: scaffolded MPA projects now self-contain `lhx-cli`

  `react-mpa`, `vue3-mpa`, and `business-mono`'s `apps/web` template all
  ship `package.json` scripts that invoke `lhx-cli dev / build / preview /
info / doctor / add`, but **none of them declared `@lhx-kit/cli` in
  `devDependencies`**. A user running `pnpm exec lhx-cli create my-app
&& cd my-app && pnpm dev` would hit `lhx-cli: command not found` unless
  they had also globally installed it — completely defeating the
  "create → install → run" zero-config promise.

  Fix: each affected `package.json.template` now lists
  `"@lhx-kit/cli": "<%= lhxKitVersionRange %>"` immediately before
  `@lhx-kit/config` in `devDependencies`, so `pnpm install` after scaffold
  puts `lhx-cli` in `node_modules/.bin/` automatically. Existing scaffolded
  projects can self-heal by running once:

  ```bash
  pnpm add -D @lhx-kit/cli
  ```

  Templates touched:
  - `packages/cli/templates/react-mpa/files/package.json.template`
  - `packages/cli/templates/vue3-mpa/files/package.json.template`
  - `packages/cli/templates/business-mono/files/apps/web/package.json.template`

  Backend templates (express/koa/fastify-service|micro, node-ts) and
  library templates (lib-single, lib-monorepo) intentionally do not call
  `lhx-cli` and are unchanged.

  ### Companion: `RENDERER-UPGRADE-PLAN.md` (repo root)

  This release is shipped alongside a non-package, repo-level audit of
  `@lhx-kit/renderer`'s capability boundaries. **No `@lhx-kit/renderer` code
  has changed in this release** — the plan exists purely to drive the next
  N renderer PRs.

  The audit was driven by a real-world demo built at
  `examples/{rmpa,vmpa}/src/pages/user-detail/` — a "user detail + edit form"
  page rendered from a single, byte-identical `render.json` schema in both
  React 19 + zustand + antd and Vue 3.5 + pinia + tdesign-mobile-vue. The
  demo intentionally surfaces:

  | Gap                                 | Demo evidence                                               | Plan section |
  | ----------------------------------- | ----------------------------------------------------------- | ------------ |
  | State snapshot at mount (no setter) | `useMemo([store.version])` rebuild on every keystroke       | P0           |
  | Events drop event arguments         | `FormField` bypasses schema, talks to store via direct hook | P0           |
  | Action middleware missing           | host hand-rolls `withTracking` HOF per project              | P1           |
  | Route lookup root absent            | `useParams()` → laundered through `flags.userId`            | P2           |
  | Lifecycle/fetch primitives missing  | host writes `useEffect`/`onMounted+watch` per page          | P3           |
  | Error boundary absent               | unrendered (organic; no demo crash)                         | P4           |

  The plan has a four-step landing order, file-line-cited gap analysis, and
  a "delete-this-from-host" verification matrix per upgrade. See the doc for
  the full picture: [`RENDERER-UPGRADE-PLAN.md`](../RENDERER-UPGRADE-PLAN.md).

  ### Side fix — rmpa MSW worker

  `examples/rmpa/` had never run `npx msw init public/`, so its
  `bootstrap.ts:24` `worker.start()` 404'd at runtime. Initialised now
  - `msw.workerDirectory` recorded in `package.json` so future `msw` upgrades
    auto-sync via `postinstall`. (Private package — does not affect this release.)

  ### Verification
  - `pnpm -F @lhx-kit/cli typecheck` ✅
  - `pnpm -F @lhx-kit/cli build` ✅ (tsup flat ESM output unchanged)
  - `examples/rmpa` & `examples/vmpa` build + dev typecheck ✅
  - All `lhx-cli` commands manually exercised; help/version unchanged

## 1.2.0

### Minor Changes

- [`6d051ca`](https://github.com/juwenzhang/lhx-kit/commit/6d051cadf1d01ec4dee65580c97bb273b99428ff) Thanks [@juwenzhang](https://github.com/juwenzhang)! - feat(cli): backend template DX improvements — nodemon, Redis reconnect, startup logs

  ### nodemon auto-restart

  All backend templates (`express-service`, `koa-service`, `fastify-service`,
  `express-micro`, `koa-micro`, `fastify-micro`, `node-ts`) now ship with:
  - `nodemon.json` + `nodemon.worker.json` (micro templates) for file-watch restarts
  - `dev` script changed from `tsx watch` to `nodemon`
  - `nodemon ^3.1.0` added to devDependencies

  ### Redis reconnect — suppress log spam

  `_features/cache-redis` and all backend templates with cache:
  - `retryStrategy` with exponential back-off (max 8 retries, cap 3 s)
  - `enableOfflineQueue: false` to fail fast on offline queue
  - `on('error')` only logs non-transient errors; ECONNREFUSED is suppressed
    after the first failure and delegated to `retryStrategy` warnings
  - `on('end')` emits a single "permanently unreachable" warning when retries
    are exhausted

  ### Startup access-URL logging

  All server templates log the full access URL on startup:

  ```
  info  local:   http://localhost:3000
  info  health:  http://localhost:3000/health   (service)
  info  livez:   http://localhost:3000/livez    (micro)
  info  readyz:  http://localhost:3000/readyz   (micro)
  ```

  ### business-mono web — lhx-kit MPA architecture

  `apps/web` rewritten from bare Vite SPA to full lhx-kit MPA pattern:
  - `project.config.ts` (pages, proxy, envs, opt-in offline)
  - `vite.config.ts` uses `lhxKit()` + `react()`
  - `src/bootstrap.ts` entry with `setupMobile` / env detection
  - `src/services/http.ts` with `ReturnType<typeof createRequest>` to fix
    TS2883 in pnpm strict-hoisting workspaces
  - `tsconfig.json` path aliases for workspace packages

## 1.1.0

### Minor Changes

- [`1577f89`](https://github.com/juwenzhang/lhx-kit/commit/1577f8927b2ff5fbad77e029fceba97bbcc8912d) Thanks [@juwenzhang](https://github.com/juwenzhang)! - feat(cli): add pm2, db-migrate features + business-mono template using lhx-kit MPA architecture

  ### New features
  - **pm2** — PM2 cluster-mode process manager feature. Adds `ecosystem.config.cjs` with `instances: 'max'`, log files, memory limit. Applies to all 6 service/micro templates and node-ts. Scripts: `start:pm2`, `stop:pm2`, `reload:pm2`, `logs:pm2`.
  - **db-migrate** — Lightweight SQL migration runner using raw `pg`. Adds `src/scripts/migrate.ts` and `migrations/0001_initial.sql` with `-- migrate:up` / `-- migrate:down` blocks. Tracks applied migrations in `_migrations` table. Scripts: `db:migrate`, `db:rollback`, `db:status`.

  ### business-mono redesign
  - **`apps/web` now uses the lhx-kit MPA architecture** (mirrors react-mpa) instead of a bare Vite SPA:
    - `project.config.ts` with `lhx-cli` scripts, `/api` proxy to Express port 3000, pages/aliases config
    - `vite.config.ts` uses `lhxKit()` + `@vitejs/plugin-react`
    - `template.html` (lhx-kit MPA HTML template)
    - `src/bootstrap.ts`, `src/env.d.ts`, MSW mocks, Zustand user store
    - `src/pages/home/` MPA page with entry.tsx, router.tsx, HomeLanding.tsx
    - `src/services/http.ts` (`createRequest` from `@lhx-kit/runtime`)
    - `src/services/example.ts` uses `ApiResponse<T>` from `@<%= packageName %>/types`
    - Offline support commented-in via `project.config.ts` (uncomment + add feature to enable)

  ### Smoke tests in examples/

  All new templates verified in `examples/`:
  - `express-svc-smoke`, `koa-svc-smoke`, `fastify-svc-smoke` — service templates with db-pg + cache-redis
  - `express-micro-smoke`, `koa-micro-smoke`, `fastify-micro-smoke` — micro templates with db-pg
  - `node-ts-smoke` — plain Node.js TypeScript template
  - `business-smoke` — full-stack monorepo with lhx-kit MPA web

- [`1577f89`](https://github.com/juwenzhang/lhx-kit/commit/1577f8927b2ff5fbad77e029fceba97bbcc8912d) Thanks [@juwenzhang](https://github.com/juwenzhang)! - feat(templates): add nodemon auto-restart to all backend templates

  All backend templates (express-service, koa-service, fastify-service,
  express-micro, koa-micro, fastify-micro, node-ts) now ship with:
  - `nodemon.json` — watches `src/`, restarts via `tsx --env-file=.env`
  - `nodemon.worker.json` (micro templates only) — same for the worker process
  - `dev` script changed from `tsx watch` to `nodemon`
  - `dev:worker` script (micro) changed to `nodemon --config nodemon.worker.json`
  - `nodemon ^3.1.0` added to devDependencies

- [`1577f89`](https://github.com/juwenzhang/lhx-kit/commit/1577f8927b2ff5fbad77e029fceba97bbcc8912d) Thanks [@juwenzhang](https://github.com/juwenzhang)! - feat(cli): add koa-service, fastify-service, and 3 microservice templates (express/koa/fastify-micro)

  ### New templates
  - **koa-service** — Koa 2 + TypeScript service with pino logger, zod env, multistage Dockerfile, graceful shutdown; supports `db-pg | db-mysql | db-none` and `cache-redis | cache-none` feature axes
  - **fastify-service** — Fastify 5 + TypeScript service with built-in pino, zod env, same feature axes as koa-service
  - **express-micro** — Express 4 microservice: Redis (ioredis + BullMQ) built-in, `/livez` + `/readyz` health endpoints, BullMQ worker (`src/worker.ts`), k8s Deployment + Service YAML, db feature axis
  - **koa-micro** — Koa 2 microservice with the same micro stack
  - **fastify-micro** — Fastify 5 microservice with the same micro stack

  ### Microservice design decisions
  - **Redis is built-in** for all `*-micro` templates (required by BullMQ); `cache-redis` feature is not applied — REDIS_URL is in the base env schema
  - **`src/db.ts` stub** — present in every micro template; overwritten by `db-pg` or `db-mysql` feature at scaffold time so readiness checks (`/readyz`) always compile cleanly regardless of db selection
  - **BullMQ worker** — `src/worker.ts` is a separate binary; `pnpm dev:worker` and `pnpm start:worker` scripts included
  - **k8s manifests** — `k8s/deployment.yaml` wires liveness (`/livez`) and readiness (`/readyz`) probes; `k8s/service.yaml` exposes ClusterIP port 80

  ### Feature updates
  - `db-pg`, `db-mysql`, `db-none` `appliesTo` extended to include all 3 micro variants

  ### create + wizard
  - **Backend auto-injection** — when no db/cache feature is passed, `db-pg` (and `cache-redis` for non-micro) are injected automatically; preserves explicit `--features` flag
  - **Backend wizard branch** — interactive mode now prompts for Database (pg/mysql/none) and Cache (redis/none, skipped for micro); summary panel reflects selections

- [`1577f89`](https://github.com/juwenzhang/lhx-kit/commit/1577f8927b2ff5fbad77e029fceba97bbcc8912d) Thanks [@juwenzhang](https://github.com/juwenzhang)! - Phase 1 of `expand-cli-template-ecosystem`: shared layer + Biome migration + target/CSS features + interactive wizard + post-scaffold handoff + dynamic version resolution.
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

- [`1577f89`](https://github.com/juwenzhang/lhx-kit/commit/1577f8927b2ff5fbad77e029fceba97bbcc8912d) Thanks [@juwenzhang](https://github.com/juwenzhang)! - feat(cli): lib monorepo per-package README, workspaceOverlay for bundler devDeps, node-ts template, lib wizard branch
  - **schema + templates**: add `workspaceOverlay` to feature manifests — always applied to the workspace root; distinguishes between per-package scripts (`packageOverlay`) and workspace-level devDependencies (`workspaceOverlay`) in monorepo templates
  - **bundler features** (tsup / rslib / rollup): move all `devDependencies` from `packageOverlay` into `workspaceOverlay` so monorepo member packages no longer carry redundant build-tool deps; scripts (`build`, `dev`) remain in `packageOverlay` and are expanded per-package via `monorepoExpand`
  - **lib-monorepo**: add `packages/core/README.md` and `packages/utils/README.md` templates (both packages listed `README.md` in `"files"` but the file was never scaffolded)
  - **node-ts template**: new `node-ts` template — minimal Node.js + TypeScript service without a web framework (pino logger, zod env, tsx dev, tsc prod build, multistage Dockerfile, graceful shutdown)
  - **wizard**: add library wizard branch — when the chosen template is a library (`lib-single` / `lib-monorepo`), the wizard now prompts for bundler (tsup / rslib / rollup) and output formats (ESM / CJS / UMD) rather than silently auto-injecting defaults; the summary panel reflects the selections

### Patch Changes

- [`6e27cd2`](https://github.com/juwenzhang/lhx-kit/commit/6e27cd2a3eec2a6b0a9825faab03c46b0c13f3f3) Thanks [@juwenzhang](https://github.com/juwenzhang)! - Type-safety + lint hygiene sweep — no public API changes:
  - Removed every `any` / `as any` from `packages/*` source. Replaced with `unknown` + typed shape (`viteExports` rolldown probe) and `unknown` → restrictive cast (`UserConfig['build']['rollupOptions']`, `Record<string, unknown>`) for Vite 8 surface that isn't in Vite 5/6/7 typings.
  - Cleared all 33 Biome warnings: `noNonNullAssertion` (replaced `!` with explicit narrowing), `noAssignInExpressions` (extracted regex `.exec` into separate statements), `useTemplate` (string concat → template literals), `useOptionalChain`, `useConsistentArrayType`, unused imports/parameters.
  - Switched `.changeset/config.json` from `fixed` to `linked`: package versions stay aligned, but unchanged packages no longer get re-published with empty changelogs every release.

- Updated dependencies [[`6e27cd2`](https://github.com/juwenzhang/lhx-kit/commit/6e27cd2a3eec2a6b0a9825faab03c46b0c13f3f3)]:
  - @lhx-kit/config@1.1.0
  - @lhx-kit/offline@1.1.0

## 1.0.1

### Patch Changes

- [`d123c02`](https://github.com/juwenzhang/lhx-kit/commit/d123c02e6779b4c0d7a648340fe0f554c2dc5ac5) Thanks [@juwenzhang](https://github.com/juwenzhang)! - chore(repo): 2026-05 AI workflow hardening & tri-model PR review upgrade

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
  - **Shell-metachar-safe commits** — replaced `execSync(\`git commit -m "…"\`)`with`execFileSync('git', ['commit', '-m', …])`so user-supplied
instructions containing backticks /`$(…)` / `$VAR` cannot break
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

  ### 🛡️ Why a patch for _every_ package?

  `@lhx-kit/*` uses a Changesets `fixed` group policy — the 8 packages
  always ship the same version number so users never have to think about
  compatibility between them. Even purely repository-level changes get a
  patch bump on every member so the version and the git history stay
  aligned.

  If you consume only the published tarballs, **there is nothing to do**:
  `pnpm up @lhx-kit/*` or ignore this release entirely.

- Updated dependencies [[`d123c02`](https://github.com/juwenzhang/lhx-kit/commit/d123c02e6779b4c0d7a648340fe0f554c2dc5ac5)]:
  - @lhx-kit/config@1.0.1
  - @lhx-kit/offline@1.0.1
  - @lhx-kit/skills@1.0.1

## 1.0.0

### Minor Changes

- [`e2ad007`](https://github.com/juwenzhang/lhx-kit/commit/e2ad0078b798b242fd126b23d150c4d8f4df609b) Thanks [@juwenzhang](https://github.com/juwenzhang)! - Add `lhx-cli add package <name>` to scaffold a new publishable workspace
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

### Patch Changes

- Updated dependencies [[`e2ad007`](https://github.com/juwenzhang/lhx-kit/commit/e2ad0078b798b242fd126b23d150c4d8f4df609b)]:
  - @lhx-kit/skills@1.0.0
  - @lhx-kit/config@1.0.0
  - @lhx-kit/offline@1.0.0

## 0.0.3

### Patch Changes

- [`db1aaba`](https://github.com/juwenzhang/lhx-kit/commit/db1aaba0251bd77382dc916fdbef628c80f7f24f) Thanks [@juwenzhang](https://github.com/juwenzhang)! - Offline packaging reliability pass + Vite 8 / Rolldown migration fix.

  ## `@lhx-kit/vite-plugin` (fix)

  Fix a P0 silent failure under Vite 8 (Rolldown). The plugin's
  `generateBundle` hook used `delete bundle[from]; bundle[to] = {...}` to
  relocate per-page outputs — Rolldown silently ignores any assignment to
  the `bundle` variable, so per-page HTML (`home/index.html`,
  `settings/index.html`) and page JS chunks were never written to `dist/`,
  producing an offline package that claimed `valid: yes` but contained only
  `shared/` files. Container delivery → white screen.
  - Mutate `asset.fileName` in place instead of reassigning the bundle
    map. Rollup and Rolldown both write to disk using each asset's own
    `fileName`, so the physical layout is correct under both bundlers.
  - Switch bundle iteration to `Object.values()` + `asset.fileName` in
    `patchHtmlReferences`, `patchChunkImports`, `reportOversizedChunks`,
    and the generateBundle CDN-gate loop, because under Rolldown the
    bundle-map key stays frozen at the original path after rename.
  - Add `IS_ROLLDOWN` runtime detection via Vite's `rolldownVersion`
    export and branch config output accordingly:
    - `experimentalMinChunkSize`: dropped under Rolldown (rejected as
      `Invalid key`); kept under Rollup.
    - Minifier options emit `oxc:` under Rolldown and `esbuild:` under
      Rollup — never both — silencing the `esbuild option was deprecated`
      warning on Vite 8.

  See the postmortem at `apps/docs/docs/runtime/rolldown-migration.md`.

  ## `@lhx-kit/offline` (feat)

  Five compatible, non-breaking improvements. `schemaVersion` stays at
  `'1.0.0'` — every new manifest field is optional, so existing hybrid
  containers and ops platforms keep working unchanged.
  - **Parallel hashing** in `generateOfflineManifest` via a small inlined
    concurrency limiter (default 8). Replaces the serial `for...of await`
    loop; large projects see ~5–10x faster manifest builds with
    byte-identical output.
  - **Parallel asset copy** in `copyBuildToOffline` (default concurrency
    16), with directory pre-creation to avoid `mkdir -p` races.
  - **Whole-package SHA-256**: `buildOfflinePackage` streams a hash of the
    produced zip and writes optional `packageHash` / `packageSize` back
    into the on-disk manifest. Ops platforms get a stable version
    identifier without re-hashing the zip themselves. The copy inside the
    zip stays hash-free to avoid a self-referencing loop.
  - **Brotli / gzip sibling resync** after an HTML CDN-URL strip. Fixes a
    real but dormant bug: when CDN + offline are both active, a container
    negotiating `Accept-Encoding: br` would otherwise receive pre-rewrite
    HTML (still containing CDN URLs) and stall on DNS lookups for 5s.
    Only regenerates existing siblings; failure is non-fatal.
  - **Heuristic inspect warnings** via new optional `warnings?: string[]`.
    Soft diagnostics surface suspicious states without flipping `valid`:
    a declared page has no `.js` chunk under its directory (the exact
    Rolldown-silent-fail symptom), `assets.length < 5`, or
    `totalSize < 20KB`.
  - **Tunable concurrency**: new `hashConcurrency` (default 8) and
    `copyConcurrency` (default 16) config fields for `EMFILE`-sensitive
    environments.

  ## `@lhx-kit/cli` (feat)
  - `lhx-cli offline build` / `inspect` print the package hash prefix and
    size (e.g. `sha256:29c7d3d21344… (309 KB)`), and surface offline
    warnings alongside missing files.
  - `offline-adapter` supplies the two new concurrency fields when
    constructing the OfflineConfig (it bypasses `normalizeOfflineConfig`,
    which would otherwise apply the defaults).

- Updated dependencies [[`db1aaba`](https://github.com/juwenzhang/lhx-kit/commit/db1aaba0251bd77382dc916fdbef628c80f7f24f)]:
  - @lhx-kit/offline@0.0.3
  - @lhx-kit/config@0.0.3
  - @lhx-kit/skills@0.0.3

## 0.0.2

### Patch Changes

- [`b7ac617`](https://github.com/juwenzhang/lhx-kit/commit/b7ac617ca9324e67179b31be405eaa1b4b8c66d8) Thanks [@juwenzhang](https://github.com/juwenzhang)! - Initial public release scaffolding.

  ## Added
  - **`@lhx-kit/tsconfig`** — Shared TypeScript configuration presets
    (`base` / `library` / `react` / `vue` / `node` / `app-react` / `app-vue`).
    Consumed via Node package resolution, so `extends` works identically
    before and after `npm publish` (no more `TS5083: Cannot read file
'../../tsconfig.base.json'` in published packages).
  - **`@lhx-kit/skills`** — Agent-agnostic AI coding skill pack. 8 bundled
    skills (project overview / add page / configure CDN / mobile
    adaptation / offline packaging / renderer schema / chunk optimisation /
    troubleshooting). Four adapters emit the right format for each agent:
    CodeBuddy, Cursor, Claude Code, or plain Markdown.
  - **`lhx-cli skills`** subcommand (`list` / `add` / `sync`) — install
    skills into the current project.

  ## Changed
  - **`lhx-cli` version reporting** now reads `@lhx-kit/cli/package.json`
    at runtime. A single `"version"` field feeds `--version`, `--help`
    banner, `lhx-cli info` header, AND the `@lhx-kit/*` dep pins written
    into scaffolded projects. One bump, everything in sync.
  - **Templates (`react-mpa` / `vue3-mpa`)** now `extends
"@lhx-kit/tsconfig/app-react.json"` / `app-vue.json`, and
    `@lhx-kit/*` dependency versions use `<%= lhxKitVersionRange %>` (a
    caret-range derived from the active CLI version). Scaffolded projects
    track whatever CLI they were created with.
  - **LICENSE files** added to every publishable package (previously only
    at repo root). Templates now also emit a `LICENSE` so scaffolded
    projects ship MIT out-of-the-box.

- Updated dependencies [[`b7ac617`](https://github.com/juwenzhang/lhx-kit/commit/b7ac617ca9324e67179b31be405eaa1b4b8c66d8)]:
  - @lhx-kit/config@0.0.2
  - @lhx-kit/offline@0.0.2
  - @lhx-kit/skills@0.0.2
