# @lhx-kit/offline

> 📦 为 Hybrid App WebView 容器生成离线包。
> 产出 `manifest.json` + `.zip`，跟随 App 发布；页面**零延迟**从本地磁盘加载。

[![npm](https://img.shields.io/npm/v/@lhx-kit/offline?color=0c9)](https://www.npmjs.com/package/@lhx-kit/offline)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[English](./README.md)

---

## 安装

```bash
pnpm add -D @lhx-kit/offline
```

通常你不会直接 import——由 `@lhx-kit/cli` 的 `lhx-cli offline build` 调用。

---

## 快速使用

### 通过 CLI（推荐）

```bash
lhx-cli offline build --hybrid-type=test
```

### 编程式

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

## 产物布局

```text
dist-offline/
├── manifest.json              # 容器入口：页面清单 + 文件 hash + 回滚策略
├── files/                     # WebView 实际加载的目录
│   ├── home/
│   │   ├── index.html         # CDN URL 已清空
│   │   └── assets/…
│   └── shared/
│       └── assets/…
└── my-app-1.0.0.zip           # 一步打好的包
```

---

## 算法

1. 🔍 递归遍历 `dist/`
2. 🚫 通过 `buildOfflineFileFilter` 过滤：
   - 白名单 page 目录 + shared 目录 + 顶层文件 → 包含
   - 其他 → 排除
3. 🔐 对每个文件做 SHA-256（流式，内存恒定）
4. 📝 生成 `manifest.json`（`schemaVersion: '1.0.0'`）
5. 📂 拷贝到 `files/`（不用软链——容器沙盒需要真实文件）
6. 🌐 重写每个 HTML 的 CDN URL，让离线 WebView 不发网络
7. 🗜️ 用 `adm-zip` 打包（纯 JS，无 native binding）

完整流程见 [离线打包概览](https://juwenzhang.github.io/lhx-kit/offline/overview)。

---

## 关键特性

### 🛡️ 文件级 SHA-256

`manifest.json` 里每个资源：

```json
{
  "path": "home/index.html",
  "size": 676,
  "hash": "ab12cd34…",
  "contentType": "text/html"
}
```

容器下载完包后根据 hash 校验，防止传输损坏。

### 🌐 HTML CDN URL 清空

如果构建用了 `@lhx-kit/vite-plugin` 的 CDN 功能，HTML 里会包含：

```html
<!-- lhx-kit: CDN loader -->
<script>var plan = {entries:[{urls:["https://cdn.jsdelivr.net/…"]}]}; …</script>
<!-- /lhx-kit: CDN loader -->
```

离线 builder 会重写为：

```html
<!-- lhx-kit: CDN loader -->
<script>var plan = {entries:[{urls:[]}]}; …</script>
<!-- /lhx-kit: CDN loader -->
```

空的 `urls` 数组让 loader 跳过 DNS 查询，直接走 `loadLocalFallback`。**零网络请求**，避免每个 URL 5 秒超时。

### 📋 白名单过滤规则

```ts
defineOfflineConfig({
  whitelistPages: ['home'],                     // 仅此 page 进包
  excludeFilenames: ['mockServiceWorker.js'],   // MSW 永不随包发布
  excludePaths: ['analytics/'],                 // 自定义前缀排除
});
```

规则：

| 路径形状 | 判定 |
| --- | --- |
| `shared/...` | ✅ 总是包含（vendor chunk） |
| `<白名单-page>/...` | ✅ 包含 |
| `<其他-page>/...` | ❌ 排除（避免混合） |
| 顶层文件（favicon 等） | ✅ 包含，除非显式 exclude |

---

## 公开 API

| 导出 | 用途 |
| --- | --- |
| `OfflineConfigSchema` | 配置的 zod schema |
| `normalizeOfflineConfig(input)` | parse + 填默认值 |
| `generateOfflineManifest(config, buildDir)` | 返回 manifest 对象 |
| `writeOfflineManifest(manifest, outDir)` | 持久化到磁盘 |
| `buildOfflinePackage(opts)` | 端到端：manifest + copy + zip |
| `inspectOfflinePackage(outDir)` | 校验已有包 |
| `formatBytes(bytes)` | 字节数格式化 |

---

## 依赖

| 依赖 | 用途 |
| --- | --- |
| `adm-zip` ^0.5.16 | 纯 JS zip，无 native binding（Docker 友好） |
| `fs-extra` ^11.2.0 | `readdir {withFileTypes}` 等便利 API |
| `zod` ^3.24.1 | 配置校验 |

---

## 什么时候用

✅ 适合：

- 移动端 Hybrid App（淘宝 / 京东 / 各家银行 / 美团风格容器）
- 严格审计要求（每次发版一个不可变 zip）
- 弱网 / 完全离线场景

❌ 不适合：

- 纯 Web 站点——浏览器缓存 + CDN 足够
- PWA——用 Service Worker 即可
- Electron / Tauri——有自己的打包器

---

## 文档

- 📦 [离线打包概览](https://juwenzhang.github.io/lhx-kit/offline/overview)
- 🌐 [CDN URL 为什么要清空](https://juwenzhang.github.io/lhx-kit/guide/cdn#七-离线场景)

## License

[MIT](./LICENSE) © luhanxin
