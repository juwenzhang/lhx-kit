# Offline Hybrid Packaging

The offline pipeline turns a built `dist/` into a single `.zip` file that a
mobile app's WebView loads from local filesystem. Every zip ships with a
`manifest.json` (sha256-pinned), rollback hints, and prefetch rules.

## Quick Start

```bash
# 1. Enable in project config
# project.config.ts →  offline: {enabled: true}

# 2. Configure offline.config.ts (see "Config" below)

# 3. Build normally
pnpm build

# 4. Package
lhx-cli offline build --hybrid-type=test     # outputs dist-offline/<ts>_test_v<ver>.zip

# 5. Inspect (no extraction)
lhx-cli offline inspect dist-offline/20260501_17777_test_v0.1.0.zip
```

## Config: `offline.config.ts`

```ts title="offline.config.ts"
import {defineOfflineConfig} from '@lhx-kit/config';

export default defineOfflineConfig({
  enabled: true,

  // The version embedded in the zip filename + manifest.json
  versions: {
    test: '0.1.0',
    prod: '0.1.0'
  },

  // Only these pages enter the zip; unlisted ones are silently excluded.
  whitelistPages: ['home', 'dashboard'],

  // Rollback policy the WebView shell enforces when checksum mismatches
  rollback: {
    strategy: 'previous',     // 'previous' | 'none' | 'prompt'
    keepN: 3                  // retain N older zips for rollback slots
  },

  // Optional: warm the WebView cache on first launch
  prefetch: {
    resources: ['/home/assets/vendor-react-*.js'],
    maxBytes: 500_000,        // safety cap to avoid pathological prefetch
    timeoutMs: 2000
  }
});
```

## Zip Filename Convention

```text
dist-offline/<YYYYMMDD>_<ts>_<hybrid-type>_v<version>.zip
dist-offline/20260501_1777675366_test_v0.1.0.zip
```

Components (left → right):
- `YYYYMMDD` — build date in UTC+0 for global team reproducibility
- `ts`        — Unix seconds; guarantees filename uniqueness even with two builds in the same day
- `hybrid-type` — `test` | `prod` | custom from `--hybrid-type=<name>`
- `version`   — picked from `versions[hybrid-type]` in config

## Manifest Structure

```json title="manifest.json (inside the zip)"
{
  "name": "my-app",
  "version": "0.1.0",
  "hybridType": "test",
  "buildTime": "2026-05-01T08:29:00Z",
  "pages": {
    "home": {
      "index": "home/index.html",
      "assets": ["home/assets/home-ABC123.js", "shared/assets/vendor-react-DEF456.js"],
      "sha256": "a7bd..."
    }
  },
  "rollback": {"strategy": "previous", "keepN": 3},
  "prefetch": ["/home/assets/vendor-react-*.js"]
}
```

## What the Pipeline Does

1. **Copy** `dist/` → a temp workspace.
2. **Filter** pages based on `whitelistPages`. The per-page folder AND the
   shared `shared/` payload (only the chunks referenced by surviving pages)
   are kept; everything else is discarded.
3. **Rewrite HTML** to drop external CDN URLs; inline the local fallback
   scripts referenced via `localFallback`. The zip MUST be self-contained.
4. **Hash** every asset file with streaming sha256 (memory-safe for large
   bundles). Collect into `manifest.json#pages.<name>.sha256`.
5. **Zip** via `adm-zip` at max compression. No file should exceed ~30MB
   uncompressed; if you hit that, check for leaked source-maps.

## Why adm-zip (not yauzl / jszip)?

- Synchronous API — fits the CLI's straight-line control flow
- Cross-platform pure JS (no `zip` binary needed on Windows CI)
- Battle-tested at 2M+ weekly downloads
- Output zip is `STORE+DEFLATE` only; always readable by `unzip` / `7z`

## Common Commands

```bash
lhx-cli offline build --hybrid-type=prod --version=1.2.3
lhx-cli offline build --hybrid-type=test                 # uses versions.test
lhx-cli offline inspect <zip>                            # dumps manifest
lhx-cli offline inspect <zip> --verify-sha               # recompute + compare
lhx-cli offline inspect <zip> --extract /tmp/extracted   # unzip for debugging
```

## Pitfalls

:::warning Build FIRST, package second
`offline build` does NOT run `vite build` for you. If you forget, you'll zip
stale/empty `dist/`. Run `pnpm build && lhx-cli offline build` together.
:::

:::danger CDN URLs must have localFallback for offline
A `cdn.entries[*]` without `localFallback` will fail at runtime inside the
zip (no network). The offline adapter logs a warning but doesn't abort; read
the console output carefully.
:::

:::tip Keep old zips during rollout
With `rollback.keepN: 3`, the shell app can atomically swap to the previous
zip when a new one fails its sha256 check. Don't set `keepN: 0` — you'll
have no safety net.
:::

:::info Reproducible builds
Same source + same lockfile + same `hybrid-type`/`version` → bitwise-identical
zip (modulo `buildTime`). Pin your toolchain versions in CI.
:::

## When Offline Is NOT a Fit

- Single-page internal admin dashboards (just ship a URL)
- Content sites (CDN + HTTP/2 is enough)
- Apps that hit backend APIs on every interaction (you'd still need the network)

Offline shines when: poor network regions, WebView-in-native-app, cache-first
UX expectations.
