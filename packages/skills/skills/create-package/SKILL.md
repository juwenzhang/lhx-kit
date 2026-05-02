# Create a New Package in a Monorepo

Scaffold a new publishable workspace under `packages/<name>`. **Prefer the
CLI over hand-editing** — `lhx-cli add package` validates the monorepo
root, enforces kebab-case naming, auto-detects the npm scope from the root
`package.json`, and produces a consistent layout every time.

## The One Command

```bash
lhx-cli add package <name> [options]

# Examples
lhx-cli add package my-lib
lhx-cli add package renderer-plugins --description="Renderer plugin API"
lhx-cli add package legacy-shim --force          # overwrite existing dir
```

Options:
- `--description <text>`    Short description written into `package.json` (default: generic)
- `--force`                 Overwrite `packages/<name>/` if it already exists
- `--yes`                   Non-interactive (name must be passed as CLI arg)

## What the CLI Does (under the hood)

1. **Validates monorepo root** by walking up from cwd looking for
   `pnpm-workspace.yaml` and a sibling `packages/` directory. If not in a
   monorepo, prints a clear error plus alternative commands (`add module`,
   `create`) instead of writing broken files.
2. **Infers the npm scope** by reading the root `package.json#name`:
   - `@lhx-kit` (scoped root) → new package is `@lhx-kit/<name>`
   - unscoped root → falls back to `@lhx-kit/` default
3. **Scaffolds 7 files** under `packages/<name>/`:
   ```text
   packages/my-lib/
   ├── package.json           # ESM, tsup scripts, files allowlist, publishConfig.access=public
   ├── tsconfig.json          # extends @lhx-kit/tsconfig/library.json
   ├── tsup.config.ts         # ESM-only dual-build, dts enabled
   ├── src/
   │   └── index.ts           # starter export: helloXxx() + xxxVersion
   ├── README.md              # install / usage / docs link
   ├── README.zh-CN.md        # 中文版
   └── LICENSE                # MIT
   ```

## What Is NOT Scaffolded (on purpose)

:::warning No CHANGELOG.md
Changesets owns `CHANGELOG.md`. If the CLI wrote one upfront, `changeset
version` would either skip it or append to a stale header. Let the first
`changeset version` run generate it on real release.
:::

:::info No tests/ directory
Kept minimal on purpose. Add Vitest later with `pnpm -C packages/<name>
add -D vitest` and a `test` script — don't front-load decisions the
package may not need.
:::

:::info No CI yaml per package
CI runs `pnpm --filter './packages/*' build` across all workspaces.
Individual CI config per package fragments the matrix for no benefit.
:::

## Layout Rationale

Every choice maps to a concrete lhx-kit convention — see the
[Project walkthrough](https://juwenzhang.github.io/lhx-kit/guide/project-walkthrough)
for the full list. Key points:

| Choice | Why |
| --- | --- |
| `"type": "module"` | All lhx-kit packages are ESM. Mixed CJS/ESM is a support nightmare. |
| `files: ["dist", ...]` whitelist | Safer than `.npmignore` — nothing leaks by accident. |
| `publishConfig.access: public` | scoped packages default to private; forgetting this = E404 on first publish. |
| `tsup` over `tsc` for emit | Faster, single-tool build+dts, source-maps optional. `tsc` still does typecheck. |
| `workspace:*` on `@lhx-kit/tsconfig` | Changesets auto-replaces with real version on publish. |

## After Scaffolding (mandatory follow-ups)

The CLI prints these as the final "next steps" block — walk through them
in order:

1. **Link the new workspace** into the monorepo:
   ```bash
   pnpm install
   ```
2. **Verify the build pipeline** produces `dist/`:
   ```bash
   cd packages/<name> && pnpm build
   ls dist/   # expect: index.js, index.d.ts
   ```
3. **Declare intent with a changeset** before the first release:
   ```bash
   pnpm changeset
   # select <name> → minor (or patch for stub)
   # write a clear summary; it becomes the CHANGELOG entry
   git add .changeset/
   git commit -m "feat(<name>): initial scaffold"
   ```
4. **One-time: configure npm Trusted Publisher** for the new package (if
   your monorepo uses OIDC publishing). Open:
   ```
   https://www.npmjs.com/package/@scope/<name>/access
   ```
   and add a GitHub Actions trusted publisher pointing at your repo +
   `release.yaml` workflow. Matches the rest of the monorepo's publish
   flow — see
   [Release pipeline](https://juwenzhang.github.io/lhx-kit/engineering/release-pipeline).

## Manual Alternative (only if CLI is unavailable)

Create the directory structure shown in "What the CLI Does" section 3,
then copy these minimal file bodies:

### `packages/<name>/package.json`

```json
{
  "name": "@lhx-kit/<name>",
  "version": "0.0.0",
  "description": "...",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "files": ["dist", "README.md", "README.zh-CN.md", "LICENSE", "package.json", "tsconfig.json"],
  "publishConfig": {"access": "public"},
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "devDependencies": {
    "@lhx-kit/tsconfig": "workspace:*",
    "tsup": "^8.3.5",
    "typescript": "^6.0.3"
  }
}
```

### `packages/<name>/tsconfig.json`

```json
{
  "extends": "@lhx-kit/tsconfig/library.json",
  "compilerOptions": {"outDir": "dist", "rootDir": "src"},
  "include": ["src/**/*"]
}
```

### `packages/<name>/tsup.config.ts`

```ts
import {defineConfig} from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'node18'
});
```

## Pitfalls

:::warning Don't run outside the monorepo root
The CLI walks up looking for `pnpm-workspace.yaml` + `packages/` — if you
run inside a regular Vite app, it will print advisory text and exit. Try
`lhx-cli add module <name>` (intra-project module) or `lhx-cli create`
(brand-new project) instead.
:::

:::warning Package names must be kebab-case
Match `[a-z][a-z0-9-]*`. `MyPkg` / `my_pkg` / `my.pkg` all rejected.
:::

:::tip Different scope? Edit the root package.json first
The scaffolder infers the npm scope from the monorepo root `package.json#name`.
If your monorepo is `@acme/root`, the new package becomes `@acme/<name>`
automatically. No CLI flag needed.
:::

:::tip Bump the version BEFORE you publish
Scaffolded at `0.0.0` on purpose — Changesets will bump it on first release.
Don't manually edit `version`; let `changeset version` own it.
:::

## Validation After Adding

```bash
pnpm install                           # link the workspace
pnpm --filter @scope/<name> build       # produce dist/
pnpm --filter @scope/<name> typecheck   # verify TS is clean
npm pack --workspace @scope/<name> --dry-run   # preview publish tarball contents
```

The dry-run output should list exactly the files in your `files` allowlist —
`dist/`, `README.md`, `README.zh-CN.md`, `LICENSE`, `package.json`,
`tsconfig.json`. Anything extra means a stray file slipped past the
whitelist.

## Common Follow-ups After Adding

- **Add a dependency**: `pnpm --filter @scope/<name> add <dep>`
- **Link into another package**: `pnpm --filter @scope/other add @scope/<name>@workspace:^`
- **First release**: merge your feature commits + `.changeset/*.md`, wait
  for the "Version Packages" PR, merge that, then the release workflow
  publishes automatically.
