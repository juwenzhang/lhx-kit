# 📦 `@lhx-kit/offline`

> 把 `dist/` 里的页面按白名单打成 zip + manifest，被 Hybrid App 容器解压后加载，**完全离线运行**。

---

## 一、🎯 问题域

### 1.1 Hybrid App 的痛点

```text title="传统 H5 在 App 内嵌的体验"
用户点 App 里某个 H5 入口
   ↓
进入 WebView
   ↓
加载 HTML (2s)
   ↓
并行加载 JS/CSS (5s)
   ↓
React hydration
   ↓
首屏可见 (7s+) 😭
```

### 1.2 纯 Service Worker 不够

| 方案 | 问题 |
| --- | --- |
| 浏览器缓存 | 第一次仍然慢 |
| Service Worker 预缓存 | 第一次仍然慢；SW 本身有注册延迟 |
| CDN + 预压缩 | 网络差时还是要等 |

### 1.3 离线包方案

```text title="有离线包的体验"
App 启动
   ↓ (后台下载离线包)
用户点 H5 入口
   ↓
容器从本地磁盘加载 HTML/JS/CSS (0.1s)
   ↓
React hydration
   ↓
首屏可见 (0.2s) 🎉
```

:::tip lhx-kit 的定位
帮你生成一个**符合主流 hybrid 容器约定**的离线包。具体容器实现由移动端团队负责。
:::

---

## 二、🔄 整体流程

```text
┌─────────────────────────────────────────────┐
│ 1. lhx-cli build                             │
│    ↓                                         │
│    产出 dist/ (per-page 目录结构)            │
│    ├── home/index.html                       │
│    ├── home/assets/*.js                      │
│    ├── settings/...                          │
│    └── shared/...                            │
└─────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────┐
│ 2. lhx-cli offline build                     │
│    ↓                                         │
│    读 offline.config.ts                      │
│    扫 dist/，按白名单过滤                    │
│    sha256 每个文件                           │
│    生成 manifest.json                        │
│    拷贝到 dist-offline/files/                │
│    重写 HTML：清空 CDN URL                   │
│    AdmZip 打包                               │
└─────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────┐
│ 3. dist-offline/                             │
│    ├── manifest.json                         │
│    ├── files/                                │
│    └── <pkg>-<v>.zip                         │
└─────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────┐
│ 4. 上传 zip 到离线运维系统                    │
│    App 后台拉取 → 解压 → WebView 加载        │
└─────────────────────────────────────────────┘
```

---

## 三、⚙️ 配置：`offline.config.ts`

```ts title="offline.config.ts" showLineNumbers
import {defineOfflineConfig} from '@lhx-kit/config';

export default defineOfflineConfig({
  enabled: true,

  // 至少一个
  versions: {
    test: '0.1.0',
    prod: '0.1.0'
  },

  // 页面白名单
  whitelistPages: ['home'],

  // 预热规则（容器启动后异步拉取）
  prefetch: [
    {
      name: 'user-profile',
      match: {page: 'home'},
      apiUrl: '/api/user/${userId}',
      keys: ['userId'],
      maxAge: 3600,
      priority: 'high'
    }
  ],

  rollback: {strategy: 'previous'},

  metadata: {channel: 'default'}
});
```

### 字段语义

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `enabled` | `boolean` | 离线开关；false 时 CLI 直接跳过 |
| `versions.test` / `versions.prod` | `string` | **至少一个**；`--hybrid-type=test\|prod` 决定取哪个 |
| `whitelistPages` | `string[]` | 哪些 page 进离线包 |
| `prefetch` | `PrefetchRule[]` | 容器启动后异步预热的 API 请求列表 |
| `rollback.strategy` | `'previous' \| 'none'` | 校验失败时用上一版 / 直接走在线 |
| `metadata` | `Record<string, unknown>` | 透传到 manifest.metadata，运维系统读 |
| `outDir` | `string` | 输出目录，默认 `<project.outDir>-offline` |

---

## 四、🧮 关键算法

### 4.1 白名单过滤：`buildOfflineFileFilter`

```ts title="packages/offline/src/index.ts" showLineNumbers
function buildOfflineFileFilter(config: OfflineConfig) {
  const pageDirs = new Set(config.pages.map(p => p.name));
  const sharedDir = (config.sharedDir || 'shared').replace(/^\/+|\/+$/g, '');
  const excludeFilenames = new Set(
    (config.excludeFilenames ?? []).map(n => n.toLowerCase())
  );
  const excludePaths = (config.excludePaths ?? []).map(p => p.replace(/^\/+|\/+$/g, ''));

  return (relPath: string) => {
    const normalized = relPath.split('\\').join('/').replace(/^\/+/, '');
    const base = normalized.split('/').pop() ?? normalized;

    // 黑名单优先
    if (excludeFilenames.has(base.toLowerCase())) return false;
    for (const prefix of excludePaths) {
      if (prefix && (normalized === prefix || normalized.startsWith(prefix + '/'))) {
        return false;
      }
    }

    // 白名单判断
    if (normalized.includes('/')) {
      const firstSegment = normalized.split('/')[0];
      if (firstSegment === sharedDir) return true;     // shared 永远进包
      if (pageDirs.has(firstSegment)) return true;      // 白名单 page
      return false;                                      // 其他 page 目录，丢掉
    }

    // 顶层文件（favicon 等）一律进包
    return true;
  };
}
```

:::info 四条规则
- 🟢 `shared/` 目录永远被包含（否则白名单页面的 vendor chunk 就丢了）
- 🟢 白名单页面目录全量进包
- 🔴 其他 page 目录被排除（避免把未白名单的 page 也打进来）
- 🟢 顶层文件（favicon / robots.txt）默认进包
:::

### 4.2 默认排除项

```ts title="OfflineConfigSchema 默认值"
excludeFilenames: ['mockServiceWorker.js']
```

:::warning 为什么默认排除 MSW
- MSW 的 service worker 只在 dev 环境有意义
- 离线包里带上会导致 fetch 被拦截，API 请求挂掉
- vite 把 `public/` 里的文件自动拷进 `dist/`，MSW 也被拷了
- 必须在打包时主动排除
:::

### 4.3 sha256 指纹：流式 hash

```ts title="packages/offline/src/index.ts"
async function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}
```

:::info 为什么用流式
| 方式 | 问题 |
| --- | --- |
| `readFile` 全量读 | 大文件（图片 / 字体 MB 级）占内存 |
| 流式读 | 内存占用恒定 ~64KB |

Node.js 原生 API，无额外依赖。
:::

**用途**：

- 🛡️ 容器下载后校验（防止传输损坏）
- 🔄 增量更新：对比两次 manifest 的 hash，只传变化的文件（未来能力）

### 4.4 manifest 结构

```json title="manifest.json"
{
  "schemaVersion": "1.0.0",
  "packageName": "rmpa",
  "version": "0.1.0",
  "generatedAt": "2026-05-02T06:28:15.000Z",
  "basePath": "/",
  "pages": [
    {"name": "home", "route": "/", "file": "index.html"}
  ],
  "prefetch": [],
  "rollback": {"strategy": "previous"},
  "metadata": {"channel": "default"},
  "totalSize": 461824,
  "assets": [
    {
      "path": "home/index.html",
      "size": 676,
      "hash": "ab12cd34...",
      "contentType": "text/html"
    },
    {
      "path": "shared/assets/vendor-react-elAOjG93.js",
      "size": 192054,
      "hash": "...",
      "contentType": "application/javascript"
    }
  ]
}
```

:::tip `schemaVersion: '1.0.0'` 是字面值
给容器一个稳定协议号。任何 breaking change 都必须升版本号，保证向后兼容。
:::

### 4.5 HTML 的 CDN URL 置空：`stripCdnUrlsFromHtml`

```ts title="离线 WebView 的痛点"
// 离线 WebView 里网络不可达
// 但 HTML 里还有 <script src="https://cdn.jsdelivr.net/...">
// 浏览器会：
//   1. DNS 查询失败 (2~5s 超时)
//   2. onerror 触发 → _failUrl 降级链
//   3. 每个 URL 都耗时几秒
// 最终即使降级成功，首屏也慢 10s+
```

**解决方案**：

```ts title="packages/offline/src/index.ts::stripCdnUrlsFromHtml" showLineNumbers
async function stripCdnUrlsFromHtml(htmlPath: string) {
  let html = await readFile(htmlPath, 'utf8');
  const start = html.indexOf('<!-- lhx-kit: CDN loader -->');
  const end = html.indexOf('<!-- /lhx-kit: CDN loader -->');
  if (start < 0 || end < 0) return;

  const before = html.slice(0, start);
  const block  = html.slice(start, end);
  const after  = html.slice(end);

  // Step 1: 清空所有 "urls":[...] 数组
  const blockNoUrls = block.replace(/"urls":\s*\[[^\]]*\]/g, '"urls":[]');

  // Step 2: 删除所有 <script src="https://..."> 标签
  const blockNoTags = blockNoUrls.replace(
    /<script\s+src="https?:[^"]*"[^>]*><\/script>\s*/g,
    ''
  );

  await writeFile(htmlPath, before + blockNoTags + after);
}
```

**效果**：

```text title="重写前"
<!-- lhx-kit: CDN loader -->
<script>var plan = {entries:[{urls:["https://cdn.jsdelivr.net/..."]}]};</script>
<script src="https://cdn.jsdelivr.net/..." onerror="..."></script>
<!-- /lhx-kit: CDN loader -->
```

```text title="重写后"
<!-- lhx-kit: CDN loader -->
<script>var plan = {entries:[{urls:[]}]};</script>
<!-- /lhx-kit: CDN loader -->
```

离线 WebView 加载 HTML 后，loader 发现 `urls` 数组空 → 直接 `loadLocalFallback` → dynamic import 本地 vendor chunk → **零网络请求**成功。

### 4.6 AdmZip 打包

```ts title="packages/offline/src/index.ts"
const zip = new AdmZip();
zip.addLocalFile(manifestPath);
zip.addLocalFolder(filesDir, 'files');
zip.writeZip(`${packageName}-${version}.zip`);
```

:::info 为什么选 adm-zip
| 方案 | 问题 |
| --- | --- |
| Node 原生 `zlib` | 只做压缩，不能打 zip 格式 |
| `archiver` | 流式 API，功能重 |
| `jszip` | 浏览器设计，Node 性能一般 |
| **`adm-zip`** ✅ | 纯 JS 实现，无 native binding，Docker 友好 |

性能：打一个 450KB 的包 < 200ms，完全够用。
:::

### 4.7 Rollback 策略（容器侧行为约定）

```ts
rollback: {strategy: 'previous' | 'none'}
```

:::warning 这不是构建时做的事
是**容器运行时**读 manifest 后的行为约定：

| strategy | 行为 |
| --- | --- |
| `'previous'` | 当前包校验失败 / prefetch 失败 → 容器回退到上一版离线包 |
| `'online'` | 跳过离线，直接走网络（首次启动或所有版本都坏了时用） |

lhx-kit 只负责**把这个字段写进 manifest**，具体执行逻辑在 hybrid 容器里（一般由移动端团队实现）。
:::

### 4.8 Prefetch 规则

```ts title="prefetch 规则示例"
{
  name: 'user-profile',
  match: {page: 'home'},                 // 触发场景
  apiUrl: '/api/user/${userId}',         // 要预热的 API
  keys: ['userId'],                      // ${} 变量声明
  maxAge: 3600,                          // 缓存时效（秒）
  priority: 'high'                       // 调度优先级
}
```

**配置校验**（`@lhx-kit/config::validateAgainstFilesystem`）：

```ts title="校验逻辑"
// 1. apiUrl 里的 ${var} 必须在 keys 数组里声明
const placeholders = extractPlaceholders(rule.apiUrl);
for (const ph of placeholders) {
  if (!rule.keys?.includes(ph)) {
    throw new Error(`apiUrl uses \${${ph}} but keys doesn't declare it`);
  }
}

// 2. match.page 必须是 project.config.pages 里存在的 name
if (rule.match?.page && !project.pages[rule.match.page]) {
  throw new Error(`Unknown page: ${rule.match.page}`);
}
```

---

## 五、📟 CLI 入口

```bash title="离线相关命令"
# 完整流程
lhx-cli offline build --hybrid-type=test

# 只生成 manifest.json
lhx-cli offline manifest

# 校验已有离线包
lhx-cli offline inspect dist-offline

# 对比两个包（规划中）
lhx-cli offline diff old.zip new.zip
```

### `inspect` 做什么

```text
┌──────────────────────────────────────┐
│ 读 manifest.json                      │
│   ↓                                  │
│ 逐个 fs.existsSync 校验文件是否在     │
│   ↓                                  │
│ 重算每个文件的 sha256                  │
│   ↓                                  │
│ 和 manifest 里声明的 hash 对比         │
│   ↓                                  │
│ 报告：                                │
│   - 丢失 / 损坏的文件                  │
│   - 体积 > 200KB 的文件（提示优化）    │
│   - 总大小、页面数、资源数             │
└──────────────────────────────────────┘
```

---

## 六、📁 完整目录产物

```text title="dist-offline/"
dist-offline/
├── manifest.json                     # 容器入口
│
├── files/                            # 解压后 WebView 加载这里
│   ├── home/
│   │   ├── index.html                # CDN URL 已清空
│   │   └── assets/
│   │       ├── home-*.js
│   │       └── HomeLanding-*.js
│   └── shared/
│       └── assets/
│           ├── vendor-react-*.js
│           └── ...
│
└── 20260501_1777675366_test_v0.1.0.zip
    ▲
    └── 文件名格式: YYYYMMDD_timestamp_hybridType_vVersion.zip
        运维系统靠 filename 正则匹配做归档/回滚
```

---

## 七、📦 依赖清单

| 依赖 | 用途 |
| --- | --- |
| `adm-zip` ^0.5.16 | 纯 JS zip 打包，无原生 binding |
| `fs-extra` ^11.2.0 | `readdir withFileTypes` / `copyFile` / `remove` 等便利方法 |
| `zod` ^3.24.1 | `OfflineConfig` 运行时校验 |

---

## 八、🚫 何时**不**要用

:::warning 下列场景不适合
- **纯 Web 站点**：浏览器缓存 + CDN 已经足够
- **PWA**：用 Service Worker 就行，不需要"容器"
- **Electron / Tauri**：这俩框架有自己的打包流程
:::

:::tip 什么时候用
- ✅ 移动端 Hybrid App（淘宝 / 京东 / 各家银行 / 美团等）
- ✅ 微信公众号里的"卡包"类轻应用（某些场景下微信提供容器）
- ✅ 金融 / 政务严格审计场景（每次上线要有可追溯的 zip 包）
:::

---

## 九、🏗️ 架构设计回顾

```text
┌───────────────────────────────────────────────────┐
│                  构建阶段                          │
├───────────────────────────────────────────────────┤
│  lhx-cli build                                    │
│    → dist/                                        │
│                                                   │
│  lhx-cli offline build                            │
│    → loadOfflineConfig                            │
│    → walkFiles(dist)                              │
│    → buildOfflineFileFilter (白名单)              │
│    → hashFile (sha256 流式)                       │
│    → generateOfflineManifest                      │
│    → copyBuildToOffline (拷贝 + CDN URL 清空)     │
│    → createZip (AdmZip)                           │
│                                                   │
│    → dist-offline/{manifest.json, files/, *.zip}  │
└───────────────────────────────────────────────────┘
                          ↓
                  上传到运维系统
                          ↓
┌───────────────────────────────────────────────────┐
│                 容器运行时                         │
├───────────────────────────────────────────────────┤
│  App 启动                                          │
│    → 后台下载 zip                                  │
│    → 解压到应用沙盒                                 │
│    → 校验 manifest（hash 对比）                    │
│      ├─ 通过：加载到 WebView                       │
│      └─ 失败：走 rollback.strategy                 │
└───────────────────────────────────────────────────┘
```

---

## 十、📚 相关资源

- 容器 spec 参考：[淘宝 H5 容器](https://www.alibabacloud.com/help/en/doc-detail/57926.htm)（思路参考）
- 同类方案对比：[OfflinePlugin](https://github.com/NekR/offline-plugin)（Service Worker 路径）
- [🌐 CDN 外挂专题](../guide/cdn) — 为什么离线要清空 CDN URL
- [⚙️ CLI offline 命令](../cli/reference#offline)
