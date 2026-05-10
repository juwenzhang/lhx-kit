---
'@lhx-kit/cli': patch
---

refactor(cli): layered `src/` reorganization + extract inline `add` templates · fix(cli/templates): scaffolded MPA projects now self-contain `lhx-cli` · companion: renderer capability boundary plan

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

| Gap | Demo evidence | Plan section |
|---|---|---|
| State snapshot at mount (no setter) | `useMemo([store.version])` rebuild on every keystroke | P0 |
| Events drop event arguments | `FormField` bypasses schema, talks to store via direct hook | P0 |
| Action middleware missing | host hand-rolls `withTracking` HOF per project | P1 |
| Route lookup root absent | `useParams()` → laundered through `flags.userId` | P2 |
| Lifecycle/fetch primitives missing | host writes `useEffect`/`onMounted+watch` per page | P3 |
| Error boundary absent | unrendered (organic; no demo crash) | P4 |

The plan has a four-step landing order, file-line-cited gap analysis, and
a "delete-this-from-host" verification matrix per upgrade. See the doc for
the full picture: [`RENDERER-UPGRADE-PLAN.md`](../RENDERER-UPGRADE-PLAN.md).

### Side fix — rmpa MSW worker

`examples/rmpa/` had never run `npx msw init public/`, so its
`bootstrap.ts:24` `worker.start()` 404'd at runtime. Initialised now
+ `msw.workerDirectory` recorded in `package.json` so future `msw` upgrades
auto-sync via `postinstall`. (Private package — does not affect this release.)

### Verification

- `pnpm -F @lhx-kit/cli typecheck` ✅
- `pnpm -F @lhx-kit/cli build` ✅ (tsup flat ESM output unchanged)
- `examples/rmpa` & `examples/vmpa` build + dev typecheck ✅
- All `lhx-cli` commands manually exercised; help/version unchanged
