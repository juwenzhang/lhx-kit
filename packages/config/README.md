# @lhx-kit/config

> 🧭 **Single source of truth** for the entire lhx-kit toolchain.
> Loads and validates `project.config.ts` / `offline.config.ts`; everything else in the monorepo reads the resolved shape.

[![npm](https://img.shields.io/npm/v/@lhx-kit/config?color=0c9)](https://www.npmjs.com/package/@lhx-kit/config)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[中文文档](./README.zh-CN.md)

---

## Install

```bash
pnpm add -D @lhx-kit/config
```

> Requires Node.js `>= 18.18.0`.

## Usage

### Define a project

```ts title="project.config.ts"
import {defineProjectConfig} from '@lhx-kit/config';

export default defineProjectConfig({
  name: 'my-app',
  framework: 'react',
  pages: {
    home: {title: 'Home'}
  },
  envs: {
    dev: {apiBase: '/api'},
    prod: {apiBase: 'https://api.example.com'}
  }
});
```

### Load at runtime

```ts
import {loadProjectConfig, resolveEnv} from '@lhx-kit/config';

const project = await loadProjectConfig(process.cwd());
const env = resolveEnv(project, 'dev');
console.log(env.apiBase);  // '/api'
```

---

## Public API

| Export | Purpose |
| --- | --- |
| `defineProjectConfig(cfg)` | Identity helper for type inference |
| `defineOfflineConfig(cfg)` | Same, for `offline.config.ts` |
| `loadProjectConfig(rootDir)` | Load + validate via `jiti` + `zod` |
| `loadOfflineConfig(rootDir, project)` | Optional offline side |
| `findNearestProjectRoot(startDir)` | Walk up the tree to locate config |
| `resolveEnv(project, mode)` | Mode → env with fallback chain `[prod, staging, test, dev]` |
| `normalizeEnvMode(mode)` | `'production' → 'prod'`, `'development' → 'dev'` |
| `listPages(project, offline?, opts?)` | Filter pages by `offline` flag / name allow-list |
| `getPage(project, name)` | Throws if unknown (lists available names) |
| `resolveAlias(project, name)` | Read one alias from `aliases` map |
| `validateAgainstFilesystem(project, offline)` | Check entry existence, alias targets, prefetch placeholders |
| `extractPlaceholders(input)` | Find `${var}` placeholders used in `apiUrl` |

See [`src/schema.ts`](./src/schema.ts) for the zod types.

---

## Design

### `jiti` for TS config loading

Runtime-loads `.ts / .mjs / .js / .json` without pre-compilation. Options set:

```ts
moduleCache: false      // HMR returns fresh contents
interopDefault: true    // ESM `export default` reads as default
```

### `zod` strict schemas

Every field has a schema. `.strict()` means extra keys **fail** rather than silently pass — protects against typos.

### Env fallback algorithm

```ts
const ENV_FALLBACK_ORDER = ['prod', 'staging', 'test', 'dev'];

resolveEnv(project, 'staging')
  → exact match project.envs.staging ?
  → fall through ENV_FALLBACK_ORDER until found
  → schema guarantees at least one exists
```

### Filesystem validation

`validateAgainstFilesystem(project, offline)` runs **6 checks**:

1. Each page's `entry` file exists
2. Every `alias` target is a real directory
3. `env.apiBase` missing → INFO (not error)
4. `offline.whitelistPages` is a subset of declared pages
5. Each `prefetch.match.page` is a declared page name
6. Every `${var}` in `prefetch.apiUrl` is declared in `keys`

---

## Dependencies

| Dep | Why |
| --- | --- |
| `jiti` ^2.4.2 | TS config loader without build step |
| `zod` ^3.24.1 | Schema + type inference |

**No other runtime dependencies.** ~110 KB unpacked.

---

## Docs

- 📖 [Architecture overview](https://juwenzhang.github.io/lhx-kit/guide/architecture)
- 📝 [Project config reference](https://juwenzhang.github.io/lhx-kit/cli/reference)

## License

[MIT](./LICENSE) © luhanxin
