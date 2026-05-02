# @lhx-kit/tsconfig

[中文](./README.zh-CN.md) · English

> Shared TypeScript configuration presets for the lhx-kit monorepo.
> **Publish-safe**: `extends` uses Node package resolution so configs work
> identically before AND after `npm publish`.

## Why this package exists

A classic mistake in multi-package repos is putting `tsconfig.base.json` at
the repo root and writing:

```json
{"extends": "../../tsconfig.base.json"}
```

This works locally but **breaks the moment you publish**: the relative path
`../../tsconfig.base.json` points outside the package, which doesn't exist
in the consumer's `node_modules/@scope/pkg/`. Result:

```text
error TS5083: Cannot read file '/tsconfig.base.json'.
```

Fix: turn the base config into an npm package. Then every consumer (local
monorepo OR remote npm user) resolves it via Node's module resolution:

```json
{"extends": "@lhx-kit/tsconfig/library.json"}
```

- **Locally** — pnpm symlinks `packages/tsconfig/` into every workspace
  package's `node_modules/@lhx-kit/tsconfig/`. TS resolves the symlink.
- **After publish** — npm installs `@lhx-kit/tsconfig` from the registry;
  resolution goes to `node_modules/@lhx-kit/tsconfig/library.json`. Same
  behaviour.

## Presets

| File | Extends | Purpose |
| --- | --- | --- |
| `base.json` | — | ES2022 target, strict mode, `moduleResolution: "Bundler"`. Foundation for everything else. |
| `library.json` | `base.json` | Adds `rootDir: "src"`, `outDir: "dist"`, declarations + maps. Default choice for `tsup`-based libraries. |
| `react.json` | `library.json` | Adds `jsx: "react-jsx"`, drops default `types: ["node"]`. |
| `vue.json` | `library.json` | Adds `jsx: "preserve"`, drops `types: ["node"]`. |
| `node.json` | `library.json` | Pins to `module: "NodeNext"`, Node-only lib. |

## Usage

### Install

```bash
pnpm add -D @lhx-kit/tsconfig
```

### Consume

```json title="packages/your-package/tsconfig.json"
{
  "extends": "@lhx-kit/tsconfig/library.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"]
}
```

### Override freely

Anything you put under `compilerOptions` wins over the preset:

```json
{
  "extends": "@lhx-kit/tsconfig/library.json",
  "compilerOptions": {
    "target": "ES2020",          // downgrade just this package
    "noUncheckedIndexedAccess": true
  }
}
```

## Verifying publish-safety yourself

```bash
# 1. Pack the configs as they would ship to npm
cd packages/tsconfig && pnpm pack --pack-destination=/tmp
cd ../config        && pnpm pack --pack-destination=/tmp

# 2. Install into a fresh project
cd /tmp && mkdir consumer && cd consumer && npm init -y
npm install /tmp/lhx-kit-tsconfig-*.tgz /tmp/lhx-kit-config-*.tgz

# 3. Read the tsconfig — no TS5083 error proves success
npx tsc --project node_modules/@lhx-kit/config/tsconfig.json --showConfig
```

You should see a resolved config printout, NOT `TS5083: Cannot read file`.

## Why keep a root-level `tsconfig.base.json`

Some tooling (VSCode "Go to Definition", `biome`, `vitest` config) expects
a file at the repo root to anchor project-wide type settings. We keep it —
but it's now a one-line forward:

```json title="/tsconfig.base.json"
{"extends": "./packages/tsconfig/base.json"}
```

So there's still exactly one source of truth: `packages/tsconfig/base.json`.

## Design Principles

- **Every preset is pure JSON**. No build step. No runtime. Ship as-is.
- **Composable via `extends`**. `react.json` → `library.json` → `base.json`
  is a two-hop chain. TS resolves the whole chain in one pass.
- **Small surface**. 5 presets cover every lhx-kit use case. Adding more is
  a single-file PR; don't bloat.
- **`display` field on every preset**. Shows up in VSCode TS-status as
  `@lhx-kit/tsconfig/library` — makes it obvious which preset is active.

## License

[MIT](./LICENSE) © luhanxin
