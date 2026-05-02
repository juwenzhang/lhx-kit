# @lhx-kit/config

## 1.0.0

## 0.0.3

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
