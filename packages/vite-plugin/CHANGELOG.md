# @lhx-kit/vite-plugin

## 1.0.0

### Patch Changes

- Updated dependencies []:
  - @lhx-kit/config@1.0.0
  - @lhx-kit/runtime@1.0.0

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

- Updated dependencies []:
  - @lhx-kit/config@0.0.3
  - @lhx-kit/runtime@0.0.3

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
  - @lhx-kit/runtime@0.0.2
