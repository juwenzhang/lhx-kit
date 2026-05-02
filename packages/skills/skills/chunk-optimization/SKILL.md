# Chunk Optimization

lhx-kit's Vite plugin already applies two strategies by default. Before
making changes, understand WHY they exist — most "let's split further" ideas
are negative optimizations under HTTP/2.

## Strategy 1: FAMILY_GROUPS (family vendor bundles)

```ts
const FAMILY_GROUPS = {
  react: ['react', 'react-dom', 'scheduler'],
  vue:   ['vue', '@vue/runtime-core', '@vue/runtime-dom'],
  router: ['react-router', 'react-router-dom', '@remix-run/router']
  // ... more
};
```

Goal: ONE vendor chunk per framework family.

- React stack → `vendor-react.js` (~190KB, ~60KB gzipped)
- Router → `vendor-router.js` (~20KB, ~8KB gzipped)
- Everything else → per-package chunk (antd, echarts, zod, …)

### Why not "one chunk per npm package"?

A vanilla React stack would become 6+ tiny chunks (react, react-dom,
scheduler, react-router, react-router-dom, @remix-run/router). With HTTP/2
multiplexing, the break-even for chunk splitting is ~30–50KB gzipped. Below
that, per-request overhead (TCP framing, HPACK) dominates.

## Strategy 2: `experimentalMinChunkSize: 10 * 1024`

Rollup's option that merges any chunk smaller than 10KB into its static
importer (when safe). This collapses:
- `preload-helper` (1KB) → folded into page entry
- `HomeAbout` (0.5KB) → folded into HomeLanding (same lazy boundary)
- `bootstrap` (3.6KB) → folded into page entry

Result: dropped from ~13 output chunks to ~10 per build, without losing any
caching granularity above 10KB.

Why 10KB specifically?
- TCP `initcwnd = 10` packets ≈ 14KB first-round window
- Below 10KB gzipped, request overhead > bytes saved by splitting
- Above 10KB, independent caching starts paying back

## Can We Split `react-dom` Further?

**No.** Detailed reasons in the perf deep-dive, summarised here:

### react-dom is ONE module in Rollup's view

```text
node_modules/react-dom/cjs/react-dom-client.production.js
  → 524KB CJS, single `module.exports`, pre-bundled by Meta release tooling
```

Rollup's `manualChunks` operates at module granularity. You cannot split a
single module into multiple chunks. **N=1 → M ≤ 1**.

### Even if you could, the reconciler internals reflect on each other

`createRoot`, `render`, `flushSync` share fiber scheduler + reconciler +
commit phase internally. Removing any API doesn't shrink the graph. This is
a runtime architecture property, not a build-tool limitation.

### Forced splitting would make things WORSE

4x 48KB chunks vs 1x 192KB chunk:
- Same total bytes (marginally worse after 3x chunk boilerplate overhead)
- TCP can only push ~14KB in the first round regardless of chunk count
- 3 extra HPACK headers = ~1-2KB overhead × 3
- Import resolution waits on the slowest chunk arriving

## Real Ways to Reduce the 192KB

| Tactic | Savings | Risk |
| --- | --- | --- |
| **Move React to CDN (`cdn.entries`)** | 100% of 192KB off first-party bundle | Requires UMD availability |
| **Switch to Preact** | ~180KB (→ ~10KB) | React API edges diverge |
| **Switch to Solid/Svelte** | ~190KB | Ecosystem re-learning |
| **Server-side streaming (not lhx-kit today)** | First-paint unblocks before bundle arrives | Requires SSR infra |

## Don't Touch These Defaults Unless...

- **You have a real measurement**. "Feels slow" is not data. Run Lighthouse
  or WebPageTest with 3G throttle.
- **You understand HTTP/2 vs HTTP/1.1 trade-offs**. If the target audience
  runs behind HTTP/1.1 proxies, more chunks = waterfall. Stick to defaults.
- **You control the runtime (e.g. custom WebView)**. WebViews sometimes have
  eager prefetch policies that benefit from more (smaller) chunks.

## Checklist When Someone Asks "Why So Many JS Files"

1. Count chunks. If < 15, you're already at the sane floor. Stop.
2. Find the biggest chunk. Unless it's >100KB gzipped, don't split.
3. If it IS >100KB, is it a single vendor? Consider CDN externals.
4. Is it user code? Look for accidental imports pulling in large deps
   (moment, lodash all, antd full). Treeshake selectively.

## Diagnostic Commands

```bash
pnpm build -- --mode=production
# Build output shows per-chunk size + gzip size; look for outliers

lhx-cli doctor --check=bundle
# flags suspicious patterns: > 100KB lazy chunks, cross-page duplication
```
