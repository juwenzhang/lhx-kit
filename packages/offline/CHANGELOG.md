# @lhx-kit/offline

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

## 1.0.0

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
