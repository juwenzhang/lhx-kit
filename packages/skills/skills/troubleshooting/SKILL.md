# Troubleshooting Playbook

Run `lhx-cli doctor` first — it checks the most common issues. If that's
clean, follow the symptom-specific steps below.

## Symptom 1: Dev server exits immediately / port already in use

```bash
# Quick check
lhx-cli doctor

# Common causes
# 1. Port collision
lsof -i :5173            # or whatever port Vite logs
# Kill the offender or change port in project.config.ts

# 2. Stale Vite cache
rm -rf node_modules/.vite

# 3. Broken deps
rm -rf node_modules && pnpm install
```

## Symptom 2: Build succeeds but page is blank

1. Open DevTools → Console. Look for the first error (not cascading ones).
2. If it's `Uncaught ReferenceError: React is not defined` (or similar):
   - CDN is mis-configured. Check `cdn.entries[*].global` spelling.
   - Run `lhx-cli doctor --check=cdn` to verify URLs reachable.
3. If it's `Cannot read properties of undefined (reading 'createRoot')`:
   - Likely `aliasGlobals` missing for `react-dom/client`. See `configure-cdn`.
4. If it's `Loading chunk N failed`:
   - CDN URL unreachable AND no `localFallback`. Add a fallback.
   - Or the build left stale chunks. Clean + rebuild:
     ```bash
     rm -rf dist && pnpm build
     ```

## Symptom 3: Env vars undefined at runtime

Env resolution has **three filters** — all must pass:

```text
.env.* file     →   VITE_* or envPrefix    →   resolveEnv() picks the right env
                         (Vite)                (@lhx-kit/config)
                                                    │
                                                    ▼
                                              import.meta.env.*
```

Checklist:
1. File named correctly? (`.env.development` loads for `vite dev`;
   `.env.production` for `vite build`)
2. Prefix match? Vite only exposes `VITE_*` by default. If you customised
   `envPrefix` in `project.config.ts`, check variable names match.
3. After changing `.env.*`, RESTART dev server. Vite does not hot-reload env.

Verify with:
```bash
lhx-cli info            # prints the resolved env object
```

## Symptom 4: Offline zip is empty or missing pages

1. Did you run `pnpm build` BEFORE `lhx-cli offline build`? The offline
   command does not chain.
2. Check `offline.config.ts#whitelistPages`. Only listed pages enter the zip.
3. Inspect without extraction:
   ```bash
   lhx-cli offline inspect <zip>
   ```
   Look at `pages` — is each expected page present with its assets?
4. If `cdn.entries[*]` has URLs but NO `localFallback`, the HTML will
   reference unreachable CDN resources. Add `localFallback: 'vendor/xyz.js'`
   and drop the file into `public/vendor/`.

## Symptom 5: Hot reload not working

- **Vue template changes don't reload** — check that `vite-plugin-vue` is
  in the plugins list (template handles this, but custom setups sometimes
  drop it).
- **CSS changes cause full reload instead of HMR** — imports must use
  `import './style.css'` syntax; dynamic imports defeat HMR.
- **File changes outside `src/`** — Vite watches `src/` by default. If you
  import from `shared/`, add it to `server.watch.ignored: false` wiring.

## Symptom 6: TypeScript errors in `project.config.ts`

- `defineProjectConfig` not found: check `@lhx-kit/config` is installed.
- Types don't match: run `pnpm run typecheck` to get compiler output; the
  zod schema in `@lhx-kit/config` drives the TS types.
- Red squiggles in VSCode but CLI builds: VSCode TS server out of date.
  Cmd+Shift+P → "TypeScript: Restart TS Server".

## Symptom 7: `lhx-cli add page` fails

1. `Project config not found at project.config.ts` — run from project root.
2. `Failed to parse project.config.ts` — syntax error or the file uses a
   non-default export. The AST writer requires `export default
   defineProjectConfig(...)` at the top level.
3. `Page already exists` — pass `--force` OR delete `src/pages/<name>/`
   first.

## Escalation Path

If the issue is not in this playbook:

1. Collect:
   ```bash
   lhx-cli info > info.txt
   pnpm list --depth=0 > deps.txt
   cat project.config.ts offline.config.ts 2>/dev/null > configs.txt
   ```
2. Check `https://github.com/juwenzhang/lhx-kit/issues` for similar reports.
3. Open an issue with: repro repo + the three files above + node/pnpm/os
   versions.

## Golden Rules

:::tip Always run `doctor` first
`lhx-cli doctor` catches 80% of issues in <5 seconds. Before any deep
investigation, run it.
:::

:::warning Don't clear node_modules prematurely
Nuking `node_modules` "fixes" the symptom but hides the cause. Try to
narrow the actual problem first; reinstall only when evidence points to
dependency corruption.
:::

:::danger Never edit dist/ directly
`dist/` is a build artifact. Patches to it evaporate on the next `pnpm
build`. Fix the source or the config.
:::
