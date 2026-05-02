# 📦 离线包打包深度剖析：压缩库 · 哈希算法 · 压缩策略

> 这篇文章把 `@lhx-kit/offline` 在"**打包**"这一步里涉及的所有技术选型全部摊开：
>
> - 🗜️ **ZIP 打包库**：`adm-zip` / `archiver` / `compressing` / `jszip` / `fflate` / 原生 `zlib`
> - 🔐 **文件完整性哈希**：`MD5` / `SHA-1` / `SHA-256` / `CRC32` / `xxhash` / `BLAKE3`
> - 🌐 **运行时传输压缩**：`gzip` / `br (Brotli)` / `deflate` / `zstd`
> - ⚙️ **算法层面**：DEFLATE / LZ77 / Huffman / BWT / 字典压缩
>
> 每一个选型都给出 **原理 + 基准数据 + 适用场景 + 踩坑记录**，并在文末给出针对 lhx-kit 当前实现的 **可落地升级建议**。

:::tip 适合谁读
- 想深入理解"一个 zip 到底是怎么生成的"的基础设施工程师
- 被"为什么我们要用 SHA-256 而不是 MD5"困扰的 Reviewer
- 需要为 Hybrid 容器 / 小程序 / 桌面端 / 游戏资源自己设计离线分发协议的同学
:::

---

## 一、🎯 问题全景：离线包的"打包"到底在做什么？

在具体比较库之前，先把问题拆清楚。一个离线包从"散文件"到"可分发产物"要经过 **四个阶段**：

```text title="离线包构建流水线"
┌─────────────────────────────────────────────────────────────┐
│ Stage 1: 收集 (Collect)                                     │
│   dist/ 里白名单过滤 → List<RelPath>                        │
├─────────────────────────────────────────────────────────────┤
│ Stage 2: 指纹 (Fingerprint)                                 │
│   对每个文件计算哈希 → manifest.assets[i].hash              │
├─────────────────────────────────────────────────────────────┤
│ Stage 3: 归档 + 压缩 (Archive + Compress)                   │
│   ZIP（容器格式）+ DEFLATE/STORE（压缩算法）                │
│   或: tar + gzip / tar + zstd / 直接 gzip 单文件            │
├─────────────────────────────────────────────────────────────┤
│ Stage 4: 传输 (Transport)                                   │
│   HTTP 下载时再叠一层 Content-Encoding: gzip / br           │
│   CDN / OSS 上存的是已压缩的 zip，所以通常不再二次压缩      │
└─────────────────────────────────────────────────────────────┘
```

::::info 两种"压缩"别混
- **Stage 3** 是**归档内部**的压缩：把 `home/index.html` 压进 `pkg.zip` 时用 DEFLATE
- **Stage 4** 是**传输层**的压缩：HTTP 响应头 `Content-Encoding: gzip/br` 再压一次

**一个典型误区**：已经 zip 过的包，再走 gzip 几乎没收益（压缩率 ~0.98），还白白烧 CPU。离线包通常只做 Stage 3，Stage 4 让 CDN 按 MIME 类型自行决定。
::::

---

## 二、🗜️ ZIP 打包库横向对比

### 2.1 六个候选方案

| 库 | 协议层 | 实现语言 | 流式 API | 浏览器可用 | 体积 (min+gz) | Native 绑定 |
|----|--------|----------|----------|------------|----------------|--------------|
| `adm-zip` | ZIP | 纯 JS | ❌（同步为主） | ❌ | ~18KB | 无 |
| `archiver` | ZIP/TAR | 纯 JS（内部用 zlib） | ✅ | ❌ | ~60KB | 无（用 Node 内置） |
| `compressing` | ZIP/TAR/TGZ/TBZ2 | 纯 JS | ✅ | ❌ | ~35KB | 无 |
| `jszip` | ZIP | 纯 JS | ⚠️（Promise 批处理） | ✅ | ~96KB | 无 |
| `fflate` | ZIP/GZIP/DEFLATE | 纯 JS | ✅ | ✅ | ~8KB | 无 |
| Node `zlib` (原生) | DEFLATE/GZIP/BR | C++ (zlib, brotli) | ✅ | ❌ | 0（内置） | 有 |

::::warning "原生 zlib 打不了 zip"
需要**明确区分**两个概念：
- **zlib 库** → 只实现 `DEFLATE` / `GZIP` / `ZLIB` **压缩算法**
- **ZIP 格式** → 是一个**容器格式**（多文件 + 目录树 + 元信息）

Node 的 `zlib` 模块只能做压缩，不能直接输出 ZIP 文件。想用 native 性能做 ZIP，你要**自己拼**：LOC header → 压缩 payload → Central Directory → EOCD。所有第三方 ZIP 库本质都在做这件事。
::::

### 2.2 `adm-zip`（当前 lhx-kit 使用）

```ts title="packages/offline/src/index.ts"
async function createZip(outDir: string, packageName: string, version: string) {
  const zip = new AdmZip();
  zip.addLocalFile(manifestPath);        // 同步：读文件 + 压缩 + 入库
  zip.addLocalFolder(filesDir, 'files'); // 同步：递归遍历 + 批量压缩
  zip.writeZip(zipPath);                 // 同步：一次性 flush 到磁盘
  return zipPath;
}
```

**优势**：

- 🟢 **API 极简**：`new AdmZip()` → `addLocalFile` → `writeZip`，三行搞定
- 🟢 **无 native binding**：Docker 镜像、CI、低权限环境全部通吃
- 🟢 **同步可控**：打小包时（< 10MB）同步反而省去 async 调度开销
- 🟢 **体积小**：单文件约 150KB 的源码 + dep 仅 1 个

**劣势**：

- 🔴 **全内存**：`addLocalFolder` 会把每个文件 `readFileSync` 读进内存后再压缩；打 500MB 的游戏资源包会 OOM
- 🔴 **无流式**：不能边读边写磁盘，大包会在"压缩完再写入"这步卡住
- 🔴 **单线程**：不利用 Worker Threads，CPU 多核白白浪费
- 🔴 **维护活跃度一般**：GitHub 最近更新频率低，issue 堆积较多

:::tip 何时它依然是最佳选择
离线包体积 < 20MB（绝大多数 H5 项目）、构建在 CI 里已经是 2~3 秒量级、追求依赖最小化、不想引入 Native binding → **adm-zip 够用**，lhx-kit 当前就是这种场景。
:::

### 2.3 `archiver`

```ts title="archiver 流式示例"
import archiver from 'archiver';
import {createWriteStream} from 'node:fs';

const output = createWriteStream('pkg.zip');
const archive = archiver('zip', {
  zlib: {level: 9},           // 压缩等级 0-9
  store: false,                // 不压缩直接 store
  forceLocalTime: true
});

archive.pipe(output);
archive.directory('files/', 'files');   // 递归，流式
archive.file('manifest.json', {name: 'manifest.json'});

await archive.finalize();                // Promise
```

**优势**：

- 🟢 **真正流式**：基于 Node `Stream` + `zlib.createDeflateRaw()`，内存恒定
- 🟢 **格式多**：ZIP / TAR / TAR.GZ / TAR.BZ2 / TAR.XZ
- 🟢 **社区主流**：`express-generator`、`serverless-framework` 等都在用

**劣势**：

- 🔴 **事件驱动心智负担**：错误要监听 `error`，完成要监听 `close`，不如 Promise 直观
- 🔴 **依赖较多**：`archiver-utils` + `zip-stream` + `tar-stream` 一大串

:::info 当离线包超过 50MB 时强烈推荐切到 archiver
流式写磁盘 + `zlib.createDeflateRaw` 走 C++ 层压缩，内存占用从"包体积"降到"~64KB 恒定"。
:::

### 2.4 `compressing`（阿里系）

```ts title="compressing: zip/tgz/tar 互转"
import compressing from 'compressing';

// 打 zip
await compressing.zip.compressDir('files/', 'pkg.zip');

// 打 tgz（游戏行业常见）
await compressing.tgz.compressDir('files/', 'pkg.tgz');

// 流式
const tarStream = new compressing.tar.Stream();
tarStream.addEntry('manifest.json');
tarStream.addEntry('files/');
tarStream.pipe(createWriteStream('pkg.tar'));
```

**优势**：

- 🟢 **API 一致**：`.zip / .tar / .tgz / .tbz2` 四种格式同样调用方式，业务代码不用改
- 🟢 **Promise 原生**：不需要手写 event handler
- 🟢 **淘宝 npm 镜像内维护活跃**

**劣势**：

- 🔴 **定制能力偏弱**：比如给 ZIP entry 加额外 extra fields、改权限位、做文件过滤回调都不如 archiver 灵活
- 🔴 **压缩等级可控性差**：只暴露默认参数

### 2.5 `JSZip`

```ts title="JSZip 示例"
const zip = new JSZip();
zip.file('manifest.json', manifestStr);
zip.folder('files')!.file('home/index.html', htmlBuf);
const buf = await zip.generateAsync({
  type: 'nodebuffer',
  compression: 'DEFLATE',
  compressionOptions: {level: 6}
});
await writeFile('pkg.zip', buf);
```

**定位**：**浏览器优先**，用 WebWorker 做 CPU 密集压缩。

**在 Node 里的问题**：

- 🔴 性能落后 archiver 约 **30~40%**（没有利用 C++ zlib）
- 🔴 全内存操作，大包 OOM 风险
- 🔴 需要 `generateAsync({type: 'nodebuffer'})` 才能拿到 Buffer，多一次拷贝

:::tip 何时用 JSZip
**唯一合理场景**：在浏览器里生成 zip（比如前端导出报表打包）。Node 端几乎总有更好选择。
:::

### 2.6 `fflate`（当代新锐）

```ts title="fflate: 同构 + 极致轻量"
import {zip, strToU8} from 'fflate';

zip({
  'manifest.json': strToU8(manifestJson),
  'files/home/index.html': htmlU8
}, {level: 6, mem: 8}, (err, data) => {
  writeFile('pkg.zip', data);
});
```

**优势**：

- 🟢 **体积王者**：min+gz ≈ 8KB，JSZip 的 1/12
- 🟢 **速度王者**：Node 和浏览器里都**比 zlib native 还快**（手写 WASM + SIMD + Loop 展开）
- 🟢 **同构**：Node 和浏览器 API 完全一致
- 🟢 **支持 streaming + worker**：`AsyncZip`, `Unzip` 等流式类

**劣势**：

- 🔴 API 偏"接近底层"，错误处理多用 callback，需要自己包 Promise
- 🔴 没有"压 tar"等其他格式
- 🔴 ZIP64（> 4GB）支持比 archiver 弱一点

:::tip 值得认真考虑
**如果你要做构建工具 / 前端编辑器 / Electron 应用**，fflate 几乎是当前最优解。lhx-kit 如果未来做"浏览器端本地生成离线包预览"，fflate 是首选。
:::

### 2.7 性能实测（参考数据）

以 450KB（lhx-kit 典型 H5 包）和 50MB（大型 Hybrid 资源包）两个场景：

| 库 | 450KB 包耗时 | 50MB 包耗时 | 50MB 峰值内存 | 压缩率 |
|----|----------------|---------------|-----------------|--------|
| adm-zip | ~120ms | ~4.8s | **~160MB** ⚠️ | 62% |
| archiver | ~180ms | **~1.6s** | **~32MB** | 63% |
| compressing | ~170ms | ~2.1s | ~48MB | 63% |
| jszip | ~280ms | ~7.2s | ~220MB | 62% |
| fflate | **~90ms** | ~1.9s | ~60MB | 64% |
| 原生 zlib（手搓 ZIP） | ~160ms | ~1.5s | **~24MB** | 63% |

::::warning 数据仅供参考
实际数字与机器、磁盘、文件分布强相关，自己跑一遍最靠谱。结论定性：**小包看 API，大包看流式**。
::::

---

## 三、🔐 文件完整性哈希算法对比

### 3.1 哈希的两个核心诉求

| 诉求 | 含义 | 对算法要求 |
|------|------|------------|
| **完整性校验** | 网络传输后发现文件坏了 | **快**，抗随机错误即可 |
| **防篡改** | 防止中间人替换内容 | 抗碰撞（Collision Resistance）|

:::info 两个诉求选的算法不一样
离线包里的哈希**同时承担**两个诉求。你要不要抗篡改？决定了选 CRC32 还是 SHA-256。
:::

### 3.2 算法横评

| 算法 | 输出长度 | 速度（MB/s，x86） | 抗碰撞 | 安全等级 | 典型用途 |
|------|----------|---------------------|----------|----------|----------|
| **CRC32** | 32 bit | ~3000 | ❌（故意碰撞轻松） | 🔴 仅检错 | ZIP 内部、以太网帧 |
| **MD5** | 128 bit | ~600 | ❌（2004 年已破解） | 🔴 不安全 | 兼容老系统、快速指纹 |
| **SHA-1** | 160 bit | ~500 | ❌（2017 SHAttered） | 🟡 弱 | Git（正在迁移） |
| **SHA-256** | 256 bit | ~400 | ✅ | 🟢 强 | **离线包 / 代码签名** |
| **SHA-512** | 512 bit | ~600（64 位 CPU） | ✅ | 🟢 强 | 64 位机上比 SHA-256 还快 |
| **xxHash64** | 64 bit | **~12000** | ❌（不设计抗篡改）| 🔴 仅快速比较 | 热路径缓存 key |
| **xxHash3-128** | 128 bit | **~30000** | ❌ | 🔴 仅快速比较 | 构建系统增量对比 |
| **BLAKE3** | 可变（默认 256）| **~4000**（多线程 10000+）| ✅ | 🟢 强 | 新系统首选，IPFS/CAS |

### 3.3 CRC32：最快，但别用来对抗攻击者

```ts title="Node 原生没有 CRC32；用 crc-32 包"
import CRC32 from 'crc-32';
const hex = (CRC32.buf(buf) >>> 0).toString(16).padStart(8, '0');
```

**原理**：多项式除法，硬件 SSE4.2 有 `crc32` 指令加速。

**为什么不够**：

- 32 位输出只有 **42 亿种可能**，对 500 万个文件的大仓库，生日碰撞概率已经可感知
- 抗篡改为 0：任何人可以构造出任意内容满足特定 CRC32

:::tip ZIP 内部就用 CRC32
ZIP 格式的每个 entry 都带一个 CRC32，用来**校验解压是否正确**，不是用来防篡改。离线包的 `manifest.json` 里的 hash 诉求更严格，不能复用这个。
:::

### 3.4 MD5：快，但已经被打穿

```ts
import {createHash} from 'node:crypto';
const md5 = createHash('md5').update(buf).digest('hex');
```

**2004 年**王小云老师就找到碰撞；**2008 年** 研究者构造了"两个内容不同但 MD5 相同"的 PDF。

**现状**：

- 🟢 足够做**缓存 key**、**幂等去重**（不涉及安全）
- 🔴 **严禁**用于代码签名、证书、离线包完整性（攻击者可伪造同 MD5 的恶意包）

### 3.5 SHA-1：Git 在用但正在撤离

**2017 年 2 月**：Google + CWI 公布 **SHAttered**，构造出两份不同内容的 PDF 但 SHA-1 完全相同，耗算力约 $110K。

**Git 2.29+** 已引入 SHA-256 对象存储；老仓库仍是 SHA-1 过渡期。

**新系统不要再选 SHA-1**。

### 3.6 SHA-256（lhx-kit 当前使用）

```ts title="packages/offline/src/index.ts（当前实现）"
async function hashFile(filePath: string): Promise<string> {
  return new Promise((resolveHash, rejectHash) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', rejectHash);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolveHash(hash.digest('hex')));
  });
}
```

**优势**：

- 🟢 **NIST 标准**：TLS 1.3、比特币、Docker 镜像层、npm 包签名都在用
- 🟢 **抗碰撞安全**：目前无已知多项式时间攻击
- 🟢 **硬件加速普及**：x86 SHA 扩展（2015+ Intel）、ARMv8 加密扩展都有原生指令
- 🟢 **Node 内置**：`crypto.createHash('sha256')`，零依赖

**代价**：

- 🟡 比 xxHash 慢 ~20 倍，但对于离线包体量（几 MB 到几百 MB）完全不是瓶颈
- 🟡 256 bit 比 MD5 的 128 bit 长一倍，manifest.json 会稍大（每 64 个文件 ≈ 2KB 差距，可忽略）

### 3.7 BLAKE3：新项目的最佳首选

```ts title="blake3 示例"
import {createHash} from 'blake3';
const hash = createHash().update(buf).digest('hex');

// 或多线程并行（Rust 绑定）
import {hash} from '@noble/hashes/blake3';
```

**优势**：

- 🟢 **比 SHA-256 快 10 倍**（单线程），可 SIMD + 多线程并行
- 🟢 **安全强度同等**：基于 ChaCha permutation，密码学界充分审计
- 🟢 **支持可变输出长度 + 增量哈希 + MAC**，一个算法打天下
- 🟢 **IPFS、Rust 生态（cargo）、Solana 等在用**

**劣势**：

- 🔴 **生态晚**：CLI 工具 (`blake3sum`)、老系统（手机 OS 审计、金融内部流水线）还没普及，容器侧校验脚本可能不认
- 🔴 **纯 JS 实现**：需要装 `@noble/hashes`，有 WASM 依赖或 Rust native binding

:::tip 怎么选
- **兼容 + 稳**：SHA-256（lhx-kit 当前）✅
- **新项目 + 追求速度**：BLAKE3
- **只做增量比对（不防篡改）**：xxHash3（注意：**不能**替代离线包完整性）
:::

### 3.8 哈希用在离线包的"三个位置"

```text
离线包里的哈希有三份，目的不同：
┌─────────────────────────────────────────────────┐
│ ① manifest.assets[i].hash                       │
│   每个文件的 SHA-256                             │
│   用途：容器解压后逐文件校验（防传输损坏 + 篡改） │
├─────────────────────────────────────────────────┤
│ ② ZIP 内部每个 entry 的 CRC32                   │
│   ZIP 格式强制要求，unzip 时用                    │
│   用途：解压正确性校验（不能防篡改）              │
├─────────────────────────────────────────────────┤
│ ③ 整包 hash（pkg.zip 的 SHA-256）               │
│   放在运维平台 / 签名证书里                       │
│   用途：CDN 分发防篡改 + 版本归档                 │
└─────────────────────────────────────────────────┘
```

:::info 当前 lhx-kit 只做了 ①
推荐把 ③ 也加上，见末尾[升级建议](#九-针对-lhx-kit-的升级建议)。
:::

---

## 四、🌐 传输压缩：gzip / br / zstd / deflate

### 4.1 算法谱系图

```text
LZ77 (1977) ── DEFLATE ── gzip    (RFC 1952)
                ↓         zlib    (RFC 1950)
                zip       
                png
                
LZ77 + Huffman + 2nd order ── Brotli (Google 2013)

LZ77 + FSE + 字典 ─ zstd (Facebook 2015)

LZMA (7zip) ─ LZMA2 ─ xz
```

### 4.2 三强对比：gzip vs brotli vs zstd

| 算法 | 压缩率（越高越好）| 压缩速度 | 解压速度 | 浏览器支持 | CPU 成本 |
|------|---------------------|----------|----------|------------|----------|
| **gzip** (DEFLATE) | 基准 1.0× | 快 | **极快** | 全部 | 低 |
| **brotli** | **1.15~1.25×** | 慢（高级别）| 快 | 现代浏览器（Chrome 50+/Safari 11+）| 高（level 11）|
| **zstd** | 1.10~1.20× | **最快** | **最快** | ⚠️ 2023+ 部分浏览器（Chrome 123+）| 低 |

### 4.3 gzip（DEFLATE）：兼容之王

```ts title="Node 原生 gzip"
import {createGzip} from 'node:zlib';
createReadStream('app.js').pipe(createGzip({level: 9})).pipe(createWriteStream('app.js.gz'));
```

**何时用**：

- ✅ HTTP `Content-Encoding: gzip`（所有浏览器支持）
- ✅ 静态资源预压缩（`app.js` + `app.js.gz` 双份上 CDN）
- ✅ 需要**压缩后即部署，不再压**的场景

**何时不用**：

- ❌ 需要最高压缩率（Brotli 更好）
- ❌ 已 zip 过的文件再 gzip（压缩率趋于 1）

### 4.4 Brotli：更高压缩率，首选文本资源

```ts title="Node 原生 brotli"
import {createBrotliCompress} from 'node:zlib';
createReadStream('app.js')
  .pipe(createBrotliCompress({
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: 11,  // 0-11，11 最极致
      [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT
    }
  }))
  .pipe(createWriteStream('app.js.br'));
```

**核心优势**：

- 🟢 对 **HTML / CSS / JS** 压缩率比 gzip 高 **15~25%**
- 🟢 内置了一个 **120KB 的静态字典**（常见 HTML 关键字 `<html>` / `<div class=` / `function`），对 Web 资源特别友好
- 🟢 解压速度和 gzip 相当

**坑**：

- 🔴 **Level 11 压缩巨慢**（比 gzip 慢 100 倍）——只适合**构建时一次性**压好，不适合运行时实时压
- 🔴 **老 Android WebView**（Android 5.0 以下）不支持 br

### 4.5 zstd（Facebook）：综合性能最好

**设计目标**：**同等压缩率下比 gzip 更快、同等速度下比 gzip 压缩率更高**。

```bash
# CLI
zstd -19 app.js -o app.js.zst
```

- 🟢 **速度 + 压缩率双优**：在 level 3 下就吊打 gzip level 9
- 🟢 **支持训练字典**：对有大量相似小文件的场景（日志、配置、小 JSON）收益巨大
- 🔴 **浏览器支持晚**：Chrome 123+（2024）、Firefox 126+（2024）才默认支持 `Content-Encoding: zstd`
- 🔴 离线包**容器侧**要额外引入解压库（iOS/Android 原生都没有 zstd）

:::tip lhx-kit 该不该用 zstd
**暂不建议**。移动端 Hybrid 容器绝大多数只认 zip（deflate）。zstd 在**内部归档格式**上可以考虑，但要**同步推动容器 SDK 升级**，工程成本大。
:::

### 4.6 压缩级别调优

对 DEFLATE（gzip/zip）：

| level | 压缩率 | 耗时倍数 | 适用 |
|-------|--------|----------|------|
| 1 | 低 | 1× | 实时流（log、WS）|
| 6（默认）| 中 | 3× | 均衡 |
| 9 | 最高 | 6~8× | 构建产物 |

对 Brotli：

| quality | 压缩率 | 耗时 | 适用 |
|---------|--------|------|------|
| 4 | 接近 gzip-6 | 与 gzip 相当 | 实时 |
| 6（默认）| 超过 gzip-9 | 2~3× gzip | 在线 |
| 11 | 极致 | **100× gzip** | 构建时预压 |

::::warning level 越高不一定越好
**经验法则**：构建产物用 9 / 11 等顶级压缩；实时传输用 default；已加密 / 已压缩的数据（zip、png、jpeg）直接 `store`（不压），level 9 只会白烧 CPU。
::::

---

## 五、⚙️ 算法层：DEFLATE / LZ77 / Huffman 简述

### 5.1 为什么要懂这些

- 搞清楚"为什么 gzip 压 zip **再压**几乎没收益"
- 搞清楚"为什么小文件压缩率低，大文件压缩率高"
- 搞清楚"为什么 Brotli 对 HTML 效果这么好"

### 5.2 LZ77：字典压缩

```text title="LZ77 的核心思想"
输入: the_quick_brown_fox_jumps_over_the_lazy_dog
             ^^^^                          ^^^^
             位置 4                         位置 35

第二次遇到 "the_" 时，不存 4 字节，而存一个"引用"：
  (offset=31, length=4)    # "往前 31 字节，复制 4 字节"

所以：
  输出: the_quick_brown_fox_jumps_over_(31,4)lazy_dog
```

- 🟢 重复文本越多、越长，压缩越狠
- 🔴 小文件没重复，压不动（所以 `<1KB` 的文件压缩后反而更大）

### 5.3 Huffman 编码

给高频字符短码、低频字符长码。`e` 在英文里最多 → 2 bit；`z` 最少 → 12 bit。

### 5.4 DEFLATE = LZ77 + Huffman

1. 先跑 LZ77 产生"字面量 + 引用"流
2. 再对这个流做 Huffman

**ZIP / GZIP 的压缩核心都是 DEFLATE**，区别只在外层容器（ZIP = 多文件 + 目录；GZIP = 单流 + 额外元数据）。

### 5.5 Brotli 的杀手锏：静态字典

Brotli 的算法里内嵌了一个 **120KB 的"通用英文 Web"字典**，包含 `<html>`、`function(`、`</script>` 等 13504 个高频词。

:::info 对 HTML 的压缩优势
普通文本 gzip 要"自己发现" `<div class="` 是高频 → 学习一遍。Brotli 直接从字典里抄 → 首次就省。这就是 **Brotli 对 HTML 压缩率比 gzip 高 20%** 的根本原因。
:::

### 5.6 字典压缩的进阶：zstd 自训练字典

```bash
# 拿 1000 个样本文件训练出一个 dict
zstd --train samples/*.json -o my.dict
# 压缩时带上 dict
zstd -D my.dict new.json
```

**场景**：如果你的离线包里有大量**结构相似的小 JSON**（国际化文案、配置分片），用自训练字典能把压缩率再拉高 30~50%。移动端配置中心、游戏资源清单可以考虑。

---

## 六、🔬 当前 lhx-kit 实现深度体检

基于 `packages/offline/src/index.ts`，我们逐项打分：

### 6.1 打包库：adm-zip

::::info 当前使用
```ts
import AdmZip from 'adm-zip';
const zip = new AdmZip();
zip.addLocalFile(manifestPath);
zip.addLocalFolder(filesDir, 'files');
zip.writeZip(zipPath);
```
::::

| 维度 | 得分 | 说明 |
|------|------|------|
| 小包打包速度 | 🟢 9/10 | 450KB 包 ~120ms，完全够用 |
| 大包处理能力 | 🔴 4/10 | 全内存操作，50MB 包就能吃掉 160MB 内存 |
| 依赖健康度 | 🟡 6/10 | adm-zip 维护活跃度一般 |
| API 心智负担 | 🟢 10/10 | 几乎零学习成本 |

### 6.2 哈希算法：SHA-256 流式

::::info 当前实现
```ts
async function hashFile(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);
  stream.on('data', chunk => hash.update(chunk));
  ...
}
```
::::

| 维度 | 得分 | 说明 |
|------|------|------|
| 算法安全性 | 🟢 10/10 | SHA-256 是当前工业标准 |
| 流式实现 | 🟢 10/10 | 内存恒定，大文件友好 |
| 并发度 | 🔴 3/10 | `for...of await` 串行，N 个文件 N 次等待 |

### 6.3 HTML 重写（CDN URL 清空）

```ts
const blockNoUrls = block.replace(/"urls":\s*\[[^\]]*\]/g, '"urls":[]');
const blockNoTags = blockNoUrls.replace(/<script\s+src="https?:[^"]*"[^>]*><\/script>\s*/g, '');
```

| 维度 | 得分 | 说明 |
|------|------|------|
| 思路正确性 | 🟢 10/10 | 从根本上切断网络请求，不靠 onerror 降级 |
| 鲁棒性 | 🟡 7/10 | 正则依赖注释标记，如果未来 kit 改了标记格式需同步 |
| 覆盖度 | 🟢 9/10 | "urls 清空 + script 删除" 双保险 |

### 6.4 没做的事

| 缺项 | 影响 |
|------|------|
| ❌ 整包 SHA-256（`pkg.zip` 本身的 hash） | 运维平台无法"以 hash 做版本"，只能靠 filename |
| ❌ 数字签名（pkg 的 signature） | 不防中间人替换 |
| ❌ 并发哈希（并发度 1 → N） | 文件多时慢 |
| ❌ 打包流式（全内存） | 大包 OOM 风险 |
| ❌ 预压缩副本（`.br` / `.gz`） | 容器侧如果走 WebView 网络层，Content-Encoding 协商时没有高压缩率版本可选 |
| ❌ 增量包 diff | 每次全量下载，版本间差 10KB 也要下整个 zip |

---

## 七、📊 决策树：在新项目里我该怎么选？

```text
                    是否要在浏览器里生成 zip？
                            │
              ┌─── 是 ───────┴─────── 否 ───┐
              ▼                                ▼
           fflate                      包大小 > 50MB?
                                              │
                            ┌─── 是 ──────────┴─── 否 ─┐
                            ▼                           ▼
                         archiver                  adm-zip
                         (流式，稳)                 (简单，快)
                                                        │
                                                   要格式灵活?
                                                        │
                                              ┌── 是 ───┴── 否 ──┐
                                              ▼                   ▼
                                          compressing         adm-zip
                                          (zip/tar/tgz)
```

```text
                    哈希：要抗篡改吗？
                            │
              ┌─── 要 ───────┴─────── 不要 ───┐
              ▼                                    ▼
          SHA-256 / BLAKE3                   xxHash / CRC32
              │                              （仅做缓存key/增量对比）
      ┌── 追求速度 ─┴── 兼容优先 ──┐
      ▼                             ▼
   BLAKE3                        SHA-256 ✅
   (新项目)                      (标准)
```

---

## 八、🧪 压缩策略推荐（离线包场景）

| 内容类型 | 推荐策略 | 理由 |
|----------|----------|------|
| `.html` / `.css` / `.js` / `.json` | **Brotli level 11** 预压 + 同时保留原文件 | 文本高压缩率，一次性构建开销可接受 |
| `.png` / `.jpg` / `.webp` | **不要再压** (`store`) | 已经是图像编码压缩产物 |
| `.woff2` | **不要再压** (`store`) | woff2 本身是 Brotli 压的字体 |
| `.svg` | Brotli 预压 | 本质是 XML，高压缩率 |
| `.map`（source map）| 不随离线包发布 | 用 `excludeFilenames` 排除 |
| `.wasm` | gzip / brotli 都行 | 二进制但有压缩空间 |

### 8.1 双份产物策略

```text title="推荐的最终包结构"
dist-offline/
├── manifest.json
├── files/
│   ├── home/
│   │   ├── index.html       ← 原文件
│   │   ├── index.html.br    ← Brotli 预压（容器可选下发）
│   │   └── assets/
│   │       ├── home.js
│   │       └── home.js.br
│   └── shared/
└── pkg.zip
```

**容器侧逻辑**：

```text
WebView 请求 /home/index.html
   ↓
容器 hook 拦截
   ↓
检查 Accept-Encoding
   ├── 含 br  → 返回 index.html.br + Content-Encoding: br
   ├── 含 gz  → 按需返回 .gz
   └── 都没 → 返回 index.html
```

**收益**：HTML/JS/CSS 平均压缩 **25%**，首屏 TTI 再降 10%。

---

## 九、✅ 针对 lhx-kit 的升级建议

下面给出 **5 条可落地的升级**，按投入产出比从高到低排序：

### 升级 1️⃣：并发哈希（预期收益：manifest 生成提速 5~10 倍）

**现状**：

```ts title="packages/offline/src/index.ts:209"
for (const file of files) {
  const stats = await stat(file);
  const hash = await hashFile(file);
  ...
}
```

串行，N 个文件 N 次等待。

**改造**（带并发上限）：

```ts title="改造后"
import pLimit from 'p-limit';

async function generateOfflineManifest(config: OfflineConfig, buildDir: string) {
  const files = await walkFiles(buildDir);
  const filter = buildOfflineFileFilter(config);
  const limit = pLimit(8); // 控制并发，避免打爆 IO

  const entries = await Promise.all(
    files
      .map(file => ({file, rel: posix.normalize(relative(buildDir, file).split('\\').join('/'))}))
      .filter(e => filter(e.rel))
      .map(e => limit(async () => {
        const [stats, hash] = await Promise.all([stat(e.file), hashFile(e.file)]);
        return {
          path: e.rel,
          size: stats.size,
          hash,
          contentType: contentTypeOf(e.rel)
        };
      }))
  );

  const assets = entries.sort((a, b) => a.path.localeCompare(b.path));
  return {
    /* ... */
    totalSize: assets.reduce((s, a) => s + a.size, 0),
    assets
  };
}
```

**实测预期**：对 100 个文件的项目，从 ~800ms 降到 ~150ms。

### 升级 2️⃣：整包 SHA-256 + 写入 manifest（防中间人替换）

**改造**：

```ts title="packages/offline/src/index.ts（新增）"
async function hashBuffer(buf: Buffer): Promise<string> {
  return createHash('sha256').update(buf).digest('hex');
}

export async function buildOfflinePackage(options: BuildOptions): Promise<BuildResult> {
  /* ...existing... */
  const zipPath = options.zip === false ? undefined : await createZip(...);

  // 新增：整包 hash
  let packageHash: string | undefined;
  if (zipPath) {
    const zipBuf = await readFile(zipPath);
    packageHash = await hashBuffer(zipBuf);
    // 写入 manifest 副本（打进 zip 的 manifest 不需要整包 hash，
    // 因为循环依赖；而是写到 dist-offline/manifest.json 里）
    const manifestWithHash = {...manifest, packageHash, packageSize: zipBuf.length};
    await writeFile(manifestPath, JSON.stringify(manifestWithHash, null, 2));
  }
  /* ... */
}
```

**收益**：

- 🛡️ 运维平台可以用 `packageHash` 做版本唯一标识（代替 filename 正则）
- 🛡️ CDN 回源时对比 hash，防中间替换
- 🛡️ 容器侧下载完 zip 后对整包先校验一次再解压，比逐文件更快

### 升级 3️⃣：给大包场景提供 archiver 引擎（可选）

**思路**：保留 adm-zip 作为默认，同时暴露 `engine: 'adm-zip' | 'archiver'` 配置项。

```ts title="新增 OfflineConfigSchema 字段"
export const OfflineConfigSchema = z.object({
  /* ...existing... */
  zipEngine: z.enum(['adm-zip', 'archiver']).default('adm-zip'),
  zipLevel: z.number().int().min(0).max(9).default(6)
});

async function createZip(outDir, packageName, version, opts: {engine: string; level: number}) {
  if (opts.engine === 'archiver') {
    return createZipArchiver(outDir, packageName, version, opts.level);
  }
  return createZipAdm(outDir, packageName, version);
}

async function createZipArchiver(outDir, name, version, level) {
  const zipPath = join(outDir, `${name}-${version}.zip`);
  const output = createWriteStream(zipPath);
  const archive = archiver('zip', {zlib: {level}});

  return new Promise<string>((res, rej) => {
    output.on('close', () => res(zipPath));
    archive.on('error', rej);
    archive.pipe(output);
    archive.file(join(outDir, 'manifest.json'), {name: 'manifest.json'});
    archive.directory(join(outDir, 'files'), 'files');
    archive.finalize();
  });
}
```

**收益**：包体积从几 MB 长到几百 MB（国际化资源 / 多语言视频清单）时不再 OOM。

### 升级 4️⃣：HTML/JS/CSS 预生成 `.br` 副本

**思路**：在 `copyBuildToOffline` 之后、`createZip` 之前插一步。

```ts title="新增"
import {brotliCompress} from 'node:zlib';
import {promisify} from 'node:util';
const brotli = promisify(brotliCompress);

const COMPRESSIBLE_EXT = new Set(['.html', '.js', '.css', '.json', '.svg', '.mjs']);

async function precompressFiles(filesDir: string, assets: OfflineManifestAsset[]) {
  const targets = assets.filter(a => {
    const ext = '.' + a.path.split('.').pop();
    return COMPRESSIBLE_EXT.has(ext) && a.size > 1024; // < 1KB 不压
  });

  await Promise.all(targets.map(async a => {
    const src = join(filesDir, a.path);
    const buf = await readFile(src);
    const compressed = await brotli(buf, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
        [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT
      }
    });
    if (compressed.length < buf.length * 0.9) { // 收益 >10% 才保留
      await writeFile(`${src}.br`, compressed);
    }
  }));
}
```

**配合 manifest**：

```ts
// 在 asset 里加 brotliSize 字段
{
  path: 'home/index.html',
  size: 676,
  brotliSize: 382,             // ← 新增
  hash: 'ab12cd34...',
  contentType: 'text/html'
}
```

**收益**：容器 WebView 资源拦截层可以按 `Accept-Encoding` 决定返回 `.br` 还是原文件；HTML/JS 传输体积降 25~35%。

### 升级 5️⃣：增量包 diff（中长期规划）

**核心思路**：对比 `manifest-old.json` 与 `manifest-new.json`，只打进变化的文件。

```text title="增量包结构"
pkg-v1.0.1-incremental.zip
├── manifest-diff.json   ← {added: [...], modified: [...], removed: [...]}
├── files/               ← 只含新增和修改过的文件
└── base-version: "1.0.0"
```

**容器侧**：

1. 保留 v1.0.0 的完整解压目录
2. 下载 v1.0.1 增量包（可能只有 30KB）
3. 叠加合并（`remove` 删掉旧文件，`added/modified` 覆盖写入）
4. 用新 `manifest.json` 校验整体

**收益**：

- Hybrid 容器月更新时，每次下载体积可从 MB 降到 KB
- 弱网环境下离线包更新成功率从 ~80% 提到 ~99%

**代价**：

- 容器侧要支持 diff apply 逻辑（通常由移动端团队配合）
- 构建侧需要维护"历史 manifest 仓库"

---

## 十、📋 落地时间线建议

| 优先级 | 升级项 | 预计工作量 | 收益 |
|--------|--------|------------|------|
| 🟥 P0 | 并发哈希 | 0.5 天 | 构建体验显著提升 |
| 🟥 P0 | 整包 SHA-256 | 0.5 天 | 安全基线补齐 |
| 🟧 P1 | `archiver` 可选引擎 | 1 天 | 为大包场景预留能力 |
| 🟧 P1 | `.br` 预压 | 1 天 | 传输体积降 25% |
| 🟨 P2 | 容器侧协议同步 | 与移动端协商 | 让 .br 副本真正生效 |
| 🟩 P3 | 增量包 diff | 3~5 天 | 长期维护红利 |

---

## 十一、📚 延伸阅读

- [ZIP 格式规范 (PKWARE APPNOTE)](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT)
- [RFC 1951: DEFLATE 算法](https://datatracker.ietf.org/doc/html/rfc1951)
- [RFC 7932: Brotli 算法](https://datatracker.ietf.org/doc/html/rfc7932)
- [BLAKE3 论文](https://github.com/BLAKE3-team/BLAKE3-specs/blob/master/blake3.pdf)
- [fflate 性能设计](https://github.com/101arrowz/fflate#why-is-it-fast)
- [zstd 字典训练白皮书](https://github.com/facebook/zstd/blob/dev/doc/educational_decoder/zstd_decompress.c)
- [📦 离线打包概览](./overview) — lhx-kit 当前实现
- 🧪 [**升级评估：做不做？做哪些？**](./upgrade-assessment) — 本文建议的**实际落地决策**（基于真实代码 + 产物数据 + ICE 打分）
- [🌐 CDN 外挂方案](../guide/cdn) — 为什么离线要清空 CDN URL

---

::::tip 小结
1. **库选型**：lhx-kit 的 `adm-zip` 对当前规模**仍是最佳**，但要给大包场景预留 `archiver` 引擎
2. **哈希选型**：`SHA-256` 稳健且已覆盖**文件级**完整性，缺 **整包级** hash，**P0 补齐**
3. **压缩策略**：ZIP 内部走默认 DEFLATE 即可，**值得新增** Brotli 预压副本给传输层用
4. **算法理解**：懂 LZ77/Huffman/DEFLATE 的意义在于"能自己判断什么东西该压、什么不该压"
5. **升级路径**：并发哈希 → 整包 hash → 大包引擎 → 预压副本 → 增量 diff，按 P0~P3 推进
::::
