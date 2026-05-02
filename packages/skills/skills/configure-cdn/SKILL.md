# Configure CDN Externals

Moving heavy vendor deps (React, Vue, Zod, Antd, ECharts, …) to a CDN is the
**only real way** to shrink the first-paint payload below ~100KB gzipped. The
lhx-kit plugin handles import rewriting, runtime fallback, and offline mode
safely — but the config has several subtleties that trip up most teams.

## The Config Shape

```ts title="project.config.ts"
import {defineProjectConfig} from '@lhx-kit/config';

export default defineProjectConfig({
  cdn: {
    active: true,                    // ← master switch
    entries: [
      {
        pkg: 'react',
        version: '18.3.1',
        global: 'React',             // window.React after load
        urls: [
          'https://unpkg.com/react@18.3.1/umd/react.production.min.js',
          'https://cdn.jsdelivr.net/npm/react@18.3.1/umd/react.production.min.js'
        ],
        localFallback: 'vendor/react.umd.js'   // last-chance local file
      },
      {
        pkg: 'react-dom',
        version: '18.3.1',
        global: 'ReactDOM',
        urls: ['https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js'],
        aliasGlobals: {'react-dom/client': 'ReactDOM'}   // sub-path import
      },
      {
        pkg: 'vue',
        version: '3.4.21',
        global: 'Vue',
        urls: ['https://unpkg.com/vue@3.4.21/dist/vue.global.prod.js'],
        initScript: 'window.Vue.version;'     // warm-up after load
      }
    ]
  }
});
```

## Critical Rules

### 1. `global` must match the UMD exposed name

For a package whose UMD registers as `window.Foo`, set `global: 'Foo'`. The
plugin rewrites `import x from 'foo'` → `const x = window.Foo` at build time.

### 2. Use `aliasGlobals` for sub-path imports

React 18+ requires `import {createRoot} from 'react-dom/client'` — but the
UMD only exposes `window.ReactDOM`. Map the sub-path:

```ts
{
  pkg: 'react-dom',
  global: 'ReactDOM',
  aliasGlobals: {
    'react-dom/client': 'ReactDOM',
    'react-dom/server': 'ReactDOMServer'
  }
}
```

### 3. `onerror` / multi-URL → automatic fallback chain

List URLs in fallback order. The runtime loader tries them sequentially; on
the last URL's failure it falls back to `localFallback` (a file shipped
inside `public/`). Without any URL succeeding, the page throws early and
`window.__lhxKitCdnError` is set for observability.

### 4. `initScript` for globals that need warm-up

Some libraries (Vue 3 Options API) lazy-initialise static props on first
access. Running a harmless no-op via `initScript` after the UMD loads
sidesteps the "first import is slow" heisenbug.

## When CDN is disabled (offline builds)

The `offline build` pipeline sets `cdn.urls = []` for every entry before
writing the HTML, then appends `localFallback` so the zip ships a fully
self-contained bundle. **No config change needed** — the offline adapter
does this automatically.

## Don't Use CDN For…

| Case | Why |
| --- | --- |
| Small deps (< 20KB gzipped) | Request overhead dominates savings |
| Dev-only deps (Storybook, ESLint) | Never reach the bundle anyway |
| Deps with no UMD build (React 19 currently) | Would require building your own UMD |
| Peer deps deeply entangled with others | Fragile; version drift breaks at runtime |

## Diagnostic Commands

```bash
lhx-cli doctor --check=cdn          # verify each entry resolves at least one URL
lhx-cli info                        # print active CDN entries + global names
```

## Common Failure Modes

:::danger Wrong `global` name
`global: 'react'` (lowercase) instead of `'React'` → `undefined is not a
function` at first render. Check the UMD's `<script>` by opening it in a
browser: look for `window.React = ...`.
:::

:::warning Missing `aliasGlobals` for sub-paths
Symptoms: build succeeds, runtime shows
`Cannot find module 'react-dom/client'`. Every sub-path import of a CDN'd
package needs an alias entry.
:::

:::tip Pin versions
Always specify `version: 'X.Y.Z'` exactly. Both CDN URLs and npm lockfile
must agree — diffing versions at runtime causes hook-mismatch bugs.
:::
