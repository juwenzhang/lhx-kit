# @lhx-kit/offline

> 📦 Offline packaging pipeline for Hybrid App WebView containers.
> Produces a `manifest.json` + `.zip` that ships with your App; pages load **0-latency** from local disk.

[![npm](https://img.shields.io/npm/v/@lhx-kit/offline?color=0c9)](https://www.npmjs.com/package/@lhx-kit/offline)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[中文文档](./README.zh-CN.md)

---

## Install

```bash
pnpm add -D @lhx-kit/offline
```

Normally you don't import this directly — `@lhx-kit/cli` invokes it via `lhx-cli offline build`.

---

## Quick usage

### Via CLI (recommended)

```bash
lhx-cli offline build --hybrid-type=test
```

### Programmatic

```ts
import {buildOfflinePackage, normalizeOfflineConfig} from '@lhx-kit/offline';

const config = normalizeOfflineConfig({
  packageName: 'my-app',
  version: '1.0.0',
  pages: [
    {name: 'home', route: '/', file: 'index.html'}
  ]
});

const result = await buildOfflinePackage({
  projectRoot: process.cwd(),
  config,
  zip: true
});

console.log(result.zipPath);         // → dist-offline/my-app-1.0.0.zip
console.log(result.manifestPath);    // → dist-offline/manifest.json
console.log(result.validation.valid); // → true
```

---

## Output layout

```text
dist-offline/
├── manifest.json              # container entry: page list + asset hashes + rollback policy
├── files/                     # what WebView actually loads
│   ├── home/
│   │   ├── index.html         # CDN URLs stripped for offline-safe loading
│   │   └── assets/…
│   └── shared/
│       └── assets/…
└── my-app-1.0.0.zip           # single-shot package
```

---

## Algorithm

1. 🔍 **Walk** `dist/` recursively
2. 🚫 **Filter** via `buildOfflineFileFilter`:
   - whitelisted page dirs + shared dir + top-level files → include
   - everything else → exclude
3. 🔐 **SHA-256** each file (streaming, fixed memory)
4. 📝 **Generate** `manifest.json` with `schemaVersion: '1.0.0'`
5. 📂 **Copy** to `files/` (not symlink — container sandbox needs real files)
6. 🌐 **Strip CDN URLs** from each HTML so offline WebView never hits network
7. 🗜️ **Zip** via `adm-zip` (pure JS, no native binding)

See [Offline overview](https://juwenzhang.github.io/lhx-kit/offline/overview) for the full flow.

---

## Key features

### 🛡️ Per-file SHA-256

Each asset in `manifest.json` has:

```json
{
  "path": "home/index.html",
  "size": 676,
  "hash": "ab12cd34…",
  "contentType": "text/html"
}
```

The container validates these hashes after download, preventing corrupted installs.

### 🌐 HTML CDN URL strip

If your build uses `@lhx-kit/vite-plugin`'s CDN feature, the HTML contains:

```html
<!-- lhx-kit: CDN loader -->
<script>var plan = {entries:[{urls:["https://cdn.jsdelivr.net/…"]}]}; …</script>
<!-- /lhx-kit: CDN loader -->
```

The offline builder rewrites this to:

```html
<!-- lhx-kit: CDN loader -->
<script>var plan = {entries:[{urls:[]}]}; …</script>
<!-- /lhx-kit: CDN loader -->
```

Empty `urls` array makes the loader skip DNS lookups and go straight to `loadLocalFallback`. No 5-second timeout per URL. **0 network requests** in offline container.

### 📋 Whitelist filter semantics

```ts
defineOfflineConfig({
  whitelistPages: ['home'],              // only this page into offline pkg
  excludeFilenames: ['mockServiceWorker.js'],   // MSW never ships
  excludePaths: ['analytics/'],          // custom prefix exclusion
});
```

Rules:

| Path shape | Decision |
| --- | --- |
| `shared/...` | ✅ always include (vendor chunks) |
| `<whitelisted-page>/...` | ✅ include |
| `<other-page>/...` | ❌ exclude (avoid mixing pages) |
| top-level file (favicon etc.) | ✅ include unless explicitly excluded |

---

## Public API

| Export | Purpose |
| --- | --- |
| `OfflineConfigSchema` | Zod schema for config |
| `normalizeOfflineConfig(input)` | Parse + fill defaults |
| `generateOfflineManifest(config, buildDir)` | Return manifest object |
| `writeOfflineManifest(manifest, outDir)` | Persist to disk |
| `buildOfflinePackage(opts)` | End-to-end: manifest + copy + zip |
| `inspectOfflinePackage(outDir)` | Validate existing package |
| `formatBytes(bytes)` | Pretty byte formatter |

---

## Dependencies

| Dep | Why |
| --- | --- |
| `adm-zip` ^0.5.16 | Pure-JS zip, no native binding (Docker-friendly) |
| `fs-extra` ^11.2.0 | `readdir {withFileTypes}` + convenience APIs |
| `zod` ^3.24.1 | Config validation |

---

## When to use

✅ Use when:

- Mobile Hybrid Apps (Taobao / JD / banks / Meituan-style containers)
- Strict audit requirements (every release is an immutable zip)
- Deep network degradation scenarios

❌ Skip for:

- Pure Web sites — browser cache + CDN suffices
- PWA — Service Worker covers it
- Electron / Tauri — they have their own packagers

---

## Docs

- 📦 [Offline overview](https://juwenzhang.github.io/lhx-kit/offline/overview)
- 🌐 [Why CDN URLs are stripped](https://juwenzhang.github.io/lhx-kit/guide/cdn#七-离线场景)

## License

[MIT](./LICENSE) © luhanxin
