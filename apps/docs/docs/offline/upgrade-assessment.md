# 🧪 离线包升级评估：做不做？做哪些？

> 这一章把[《打包深度剖析》](./packaging-deep-dive)末尾那 5 条升级建议，对着**当前代码和真实产物**重新审一遍，给出**可落地的结论**：哪些必须做、哪些是锦上添花、哪些坚决不做。
>
> 与"技术选型文章"不同，本章的每个结论都基于当前仓库的实际数据（代码行数、产物体积、文件数、现存 bug）。

:::tip 阅读动机
如果你是 lhx-kit 的维护者，想知道"下次 sprint 要不要把离线包拿出来重构一轮"——读这一章。如果你在用 `@lhx-kit/offline`，想判断"升级计划会不会影响我的产物格式"——也读这一章。
:::

---

## 一、🎯 先摆事实：当前状态体检

### 1.1 代码规模

| 包 | 行数 | 现状 |
|----|------|------|
| `@lhx-kit/offline` | 459 行 | 单文件 `src/index.ts` |
| `@lhx-kit/cli::offline-adapter` | 155 行 | Bridge project.config → offline |
| `@lhx-kit/cli::commands/offline` | ~130 行 | `build` / `manifest` / `inspect` |

### 1.2 真实产物规模（`examples/vmpa` 实测）

```text title="dist-offline/ — 修复后构建"
总 zip 大小:    ~300 KB
总 asset 数量:  33
其中:
  - 原始文件    11 个 (HTML / JS / CSS / vendor)
  - .br 副本    11 个  ← vite-plugin 的 lhxCompress 已自动生成
  - .gz 副本    11 个  ← 同上
最大文件:       shared/vendor/vue.js  164 KB
最小文件:       home/assets/home-*.js  0.83 KB
```

### 1.3 现存能力盘点（不是"缺什么"，是"已经有什么"）

::::tip lhx-kit 比《打包深度剖析》章节里描述的更完整
那篇文章写的时候我当时**还没完整看到** `@lhx-kit/vite-plugin` 的 `lhxCompress` 副插件。实际上：
- ✅ **预压缩副本 `.br` + `.gz`** — 已经由 vite-plugin 自动产出，不是"未来工作"
- ✅ **SHA-256 流式文件哈希** — 已有
- ✅ **白名单过滤** — 已有
- ✅ **HTML CDN URL 清空** — 已有
- ✅ **MSW 默认排除** — 已有
- ✅ **离线 inspect 交叉校验** — 刚在 [Rolldown 迁移记](../runtime/rolldown-migration) 中补上

所以下面的升级评估是**在一个已经相当完整的基线上做增量优化**，不是"重写"。
::::

---

## 二、🔬 逐项重估升级建议

用**当前仓库真实数据**把 `packaging-deep-dive` 末尾的 5 条建议重新跑一遍打分。

### 2.1 升级 1️⃣：并发哈希 — 🟢 **强烈推荐做**

**当前代码**：

```ts title="packages/offline/src/index.ts:209"
for (const file of files) {
  const stats = await stat(file);
  const hash = await hashFile(file);       // ← 串行
  totalSize += stats.size;
  assets.push({path, size, hash, contentType});
}
```

**现实数据**：

| 指标 | 值 |
|------|-----|
| 当前示例文件数 | 33 |
| 串行耗时（本地 SSD） | ~250ms |
| 未来场景预估 | 国际化 + 多页面可轻松到 200+ 文件 |

**决策**：

| 维度 | 分数 |
|------|------|
| 实现成本 | 🟢 0.5 天（就是一个 `pLimit(8)` 包裹）|
| 用户感知 | 🟢 立竿见影，大项目构建提速 5~10× |
| 风险 | 🟢 极低（只影响构建期，产物 bit-for-bit 一致）|
| **结论** | ✅ **P0 立即做** |

**具体做法**：见 `packaging-deep-dive` 第九节升级 1️⃣，代码可直接 paste。

### 2.2 升级 2️⃣：整包 SHA-256 写入 manifest — 🟢 **推荐做**

**当前代码**：

```ts title="packages/offline/src/index.ts:337"
export async function buildOfflinePackage(options: BuildOptions): Promise<BuildResult> {
  /* ... */
  const zipPath = options.zip === false ? undefined : await createZip(...);
  const validation = await inspectOfflineOutput(outDir);
  return {outDir, manifestPath, zipPath, validation};
}
```

**现实数据**：

| 指标 | 值 |
|------|-----|
| 当前 manifest | 只含每个 **文件**的 SHA-256 |
| 缺失 | **整包 zip 本身** 的 SHA-256 |
| 运维平台现状 | 靠 filename 里的 timestamp 做版本标识 |

**为什么不只靠文件级 hash 就够**：

- 运维平台拿到 `abc.zip`，想验证"这就是我当初构建的那个包"，得**解包后逐文件 hash**——无法在 CDN 层做防替换
- 文件级 hash 防的是 **解压后**的完整性；整包 hash 防的是 **传输前**就被替换

**决策**：

| 维度 | 分数 |
|------|------|
| 实现成本 | 🟢 0.5 天 |
| 安全价值 | 🟡 中等（当前场景运维系统已能靠 URL 签名防替换，但加上是"零成本拿到的保险"）|
| 向前兼容 | 🟢 只是**新增字段**，不破坏任何现有消费方 |
| **结论** | ✅ **P0 一起做**（搭车做并发哈希时顺手加）|

### 2.3 升级 3️⃣：archiver 可选引擎 — 🔴 **暂不做**

**当前场景**：

| 指标 | 值 |
|------|-----|
| 典型离线包 zip 体积 | 250~300 KB |
| `adm-zip` 全内存操作的理论上限 | 约 100 MB 以内都顺滑 |
| 当前瓶颈 | 🟢 **不是**打包阶段 |

**决策逻辑**：

- YAGNI。当前项目没有任何 > 20 MB 的离线包
- 增加 `zipEngine` 选项意味着要**维护双引擎**（两套测试、两套文档、两套 issue）
- archiver 的收益（流式、低内存）只在 **> 50 MB** 时才明显

**什么时候重新评估**：

- 出现第一个 > 20 MB 的离线包（比如国际化 + 图片素材）
- 或 CI 内存成为瓶颈

**决策**：

| 维度 | 分数 |
|------|------|
| 实现成本 | 🟡 1 天 |
| 当前收益 | 🔴 无明显收益 |
| 维护成本 | 🔴 双引擎 |
| **结论** | ❌ **P3 / 暂不做**，等第一个大包场景出现再启动 |

### 2.4 升级 4️⃣：Brotli 预压副本 — ⚠️ **已做，但有 bug 要修**

::::warning 关键发现
我最初的建议说"需要新增 Brotli 预压"——**这件事 vite-plugin 的 `lhxCompress` 副插件已经做了**。但我在审计时发现一个**真实 bug**：
::::

**Bug 描述**：

```text title="问题场景（启用 CDN 时暴露）"
Stage 1: vite-plugin 构建，产出:
  dist/home/index.html      (含 <script src="https://cdn.../vue.js">)
  dist/home/index.html.gz   ← 此时内容和 .html 一致
  dist/home/index.html.br   ← 此时内容和 .html 一致

Stage 2: lhx-cli offline build → copyBuildToOffline
  - 拷贝 html → stripCdnUrlsFromHtml 改写了 files/home/index.html
    把 "urls":[...] 清空为 "urls":[]
  - 拷贝 html.gz → 内容原封不动（仍是带 CDN URL 的旧版）
  - 拷贝 html.br → 同上

Stage 3: 容器侧
  - WebView 请求 /home/index.html，Accept-Encoding: br
  - 容器返回 index.html.br（旧内容）
  - 浏览器解压后发现 urls 还指向 CDN
  - 离线环境 DNS 查询失败，等 5s 超时
  - 首屏卡 5 秒+ 💥
```

**修复方案**：`stripCdnUrlsFromHtml` 写完后，同时重压 `.gz` 和 `.br` 副本。

```ts title="拟新增代码"
import {brotliCompress, gzip} from 'node:zlib';
import {promisify} from 'node:util';
const brotli = promisify(brotliCompress);
const gz = promisify(gzip);

async function rewriteAndRecompress(htmlPath: string): Promise<void> {
  await stripCdnUrlsFromHtml(htmlPath);
  // After rewrite, precompressed siblings are stale → regenerate.
  try {
    const buf = await readFile(htmlPath);
    const [brBuf, gzBuf] = await Promise.all([
      brotli(buf, {
        params: {
          [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
          [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_TEXT
        }
      }),
      gz(buf, {level: 9})
    ]);
    const brPath = `${htmlPath}.br`;
    const gzPath = `${htmlPath}.gz`;
    if (await fse.pathExists(brPath)) await writeFile(brPath, brBuf);
    if (await fse.pathExists(gzPath)) await writeFile(gzPath, gzBuf);
  } catch {
    // 预压缩副本缺失不致命 —— 容器只是退回原文件。
  }
}
```

**决策**：

| 维度 | 分数 |
|------|------|
| 严重级别 | 🔴 **仅在 CDN 激活时暴露**，但一旦暴露是真实白屏 |
| 实现成本 | 🟢 0.5 天 |
| 验证成本 | 🟡 需要搭一个带 CDN 的 demo 走一遍（当前 examples 都没开 CDN）|
| **结论** | ✅ **P1 必须做**（CDN + 离线组合场景是 lhx-kit 的核心卖点）|

### 2.5 升级 5️⃣：增量包 diff — 🔴 **暂不做**

**当前现实**：

| 指标 | 值 |
|------|-----|
| 离线包体积 | 250~300 KB |
| 一个 Hybrid App 典型月更新频率 | ~每 2 周一次 |
| 每次更新下载全量的用户代价 | 3G 下 ~2 秒 |

**增量包的真正用武之地**是体积 10 MB+ 的 Hybrid 包，每次更新可能只改了 50 KB。当前体量下：

- 全量 300 KB 的下载代价 ≈ 增量下载 50 KB 省下的时间
- 但引入增量包要求**容器侧同时支持 diff-apply**（移动端团队协调成本）

**决策**：

| 维度 | 分数 |
|------|------|
| 实现成本 | 🔴 3~5 天 |
| 容器侧协作成本 | 🔴 需要移动端团队配合 |
| 当前收益 | 🔴 几乎为零（包体积已经很小）|
| **结论** | ❌ **P3 / 暂不做**，等 Hybrid 容器体积上 5 MB+ 再看 |

---

## 三、🆕 审计中发现的**新**升级点（原文没提）

对着实际代码重审时，又发现 3 个值得做的事：

### 3.1 新升级 A：`copyBuildToOffline` 串行 → 并发 — 🟢 P1

**当前代码**：

```ts title="packages/offline/src/index.ts:252"
for (const asset of assets) {
  const src = join(buildDir, asset.path);
  const dst = join(filesDir, asset.path);
  await mkdir(dirname(dst), {recursive: true});
  await fse.copyFile(src, dst);             // ← 串行 IO
  if (asset.path.endsWith('.html')) {
    await stripCdnUrlsFromHtml(dst);         // ← 串行 IO
  }
}
```

**问题**：

- 33 文件场景 × 每次 ~10ms IO = ~330ms 纯串行拷贝
- 和并发哈希是**同质问题**：`for...of await` 堵死异步并行能力

**修复**：和 `generateOfflineManifest` 一起改，用 `pLimit(16)` 并发。

### 3.2 新升级 B：schemaVersion 升级为 `1.1.0` 并新增 `compressedVariants` — 🟡 P2

**当前 manifest**：

```json
{
  "assets": [
    {"path": "home/index.html", "size": 676, "hash": "...", "contentType": "text/html"},
    {"path": "home/index.html.br", "size": 382, "hash": "..."},
    {"path": "home/index.html.gz", "size": 411, "hash": "..."}
  ]
}
```

**问题**：

- `.br` 和 `.gz` 是**同一个文件的压缩变体**，但在 manifest 里是 3 条独立条目
- 容器侧需要**自己判断** `xxx + .br` 和 `xxx` 的关系
- 如果哪天我们决定不再产出 `.br`，没有 manifest 字段给出明确契约

**建议的新结构**：

```json title="schemaVersion 1.1.0"
{
  "schemaVersion": "1.1.0",
  "assets": [
    {
      "path": "home/index.html",
      "size": 676,
      "hash": "...",
      "contentType": "text/html",
      "compressedVariants": {
        "br": {"path": "home/index.html.br", "size": 382, "hash": "..."},
        "gz": {"path": "home/index.html.gz", "size": 411, "hash": "..."}
      }
    }
  ]
}
```

**决策**：

| 维度 | 分数 |
|------|------|
| 契约清晰度 | 🟢 容器侧读 manifest 就知道"哪个 asset 有哪些变体"|
| 向前兼容 | 🟡 要搭配 schemaVersion bump，运维系统/容器要同步升级 |
| 实现成本 | 🟡 1 天（还要改 inspect 和 adapter）|
| **结论** | 🟨 **P2**，等离线 schema 有其他 breaking change 时一起升到 1.1.0 |

### 3.3 新升级 C：离线 CLI 默认打印"产物完整性报告" — 🟢 P1

**当前 CLI 输出**（见 [Rolldown 迁移记](../runtime/rolldown-migration) 的事故日志）：

```text
› pages: 1, assets: 11, size: 335 KB
› valid: yes                                  ← ⚠️ 这次事故里骗了所有人
```

**问题**：`valid: yes` 只看到"清单里声明的文件都在"，没看到"**清单自身是否合理**"。[Rolldown 迁移记](../runtime/rolldown-migration) 修了**第一层**（pages.file 必须在 assets 里），但还能更严：

**建议新增的启发式检查**：

| 检查项 | 预期 |
|--------|------|
| 每个 page 目录必须至少包含 `<page>/index.html` | 否则 warn |
| 每个 page 目录必须至少有一个 `.js` | 否则 warn（一个 HTML 没 JS 基本是错）|
| 总 assets 数 < 5 | warn "looks suspiciously small" |
| 总体积 < 20 KB | warn "did the build actually run?" |
| shared/vendor/*.js 同时存在 `.br` / `.gz` 变体 | 否则 warn（说明预压流程可能有问题）|

**决策**：

| 维度 | 分数 |
|------|------|
| 防御价值 | 🟢 再也不会出现"valid: yes + 白屏上线"|
| 实现成本 | 🟢 0.5 天 |
| 误报风险 | 🟡 需要设计 `--strict` 还是默认 warn（不要阻塞 CI）|
| **结论** | ✅ **P1**，搭车 inspect 增强做 |

---

## 四、📊 最终优先级矩阵

用**ICE 打分**（Impact × Confidence × Ease / 10）排序：

| 升级项 | I | C | E | 得分 | 排序 | 建议 |
|--------|---|---|---|------|------|------|
| 1. 并发哈希 | 8 | 10 | 9 | 72 | 1️⃣ | 🟢 **P0 立即做** |
| 2. 整包 SHA-256 | 7 | 10 | 9 | 63 | 2️⃣ | 🟢 **P0 搭车** |
| A. 拷贝并发化 | 6 | 10 | 9 | 54 | 3️⃣ | 🟢 **P1** |
| C. inspect 启发式 | 8 | 9 | 7 | 50 | 4️⃣ | 🟢 **P1** |
| 4. Brotli 副本同步重写（修 bug）| 9 | 7 | 7 | 44 | 5️⃣ | 🟡 **P1** CDN 开启前必做 |
| B. schemaVersion 1.1.0 | 5 | 6 | 6 | 18 | 6️⃣ | 🟨 **P2 等别的 breaking 一起**|
| 3. archiver 引擎 | 3 | 5 | 5 | 7.5 | 7️⃣ | 🔴 **P3 暂不做** |
| 5. 增量包 diff | 3 | 4 | 3 | 3.6 | 8️⃣ | 🔴 **P3 暂不做** |

> I = Impact(1-10)，C = Confidence(1-10)，E = Ease(1-10)

---

## 五、🗺️ 推荐执行路线

### 🟢 本 Sprint（P0 + P1 合并）：1.5 ~ 2 天

**Goal**：把 5 个 P0/P1 合并在**一个 PR** 里，做一次 `@lhx-kit/offline` 0.0.3 小版本。

```text title="单次 PR 的改动清单"
packages/offline/src/index.ts
  ✓ [1] generateOfflineManifest: pLimit(8) 并发 stat + hashFile
  ✓ [2] buildOfflinePackage: 计算 zipBuf.sha256 并写回 manifest
         新增 OfflineManifest.packageHash / packageSize
  ✓ [A] copyBuildToOffline: pLimit(16) 并发 copy + strip
  ✓ [4] rewriteAndRecompress: strip 后同步重压 .br / .gz

packages/offline/src/index.ts::inspectOfflineOutput
  ✓ [C] 新增启发式：
         - 每个 page.file 必须有同目录 .js chunk（warn）
         - 总 assets < 5 或总体积 < 20KB 时 warn
         - 带 .html 而无 .html.br/.gz 时 info-level 提示

apps/docs/docs/offline/overview.md
  ✓ 更新 "算法" 小节：新增 "整包 hash / 预压副本同步重写 / 并发哈希"
```

**不动**的东西（有意保守）：

- ❌ 不换 adm-zip → archiver（YAGNI）
- ❌ 不新增 schemaVersion 1.1.0（等其他 breaking 一起）
- ❌ 不做增量包 diff（体积未到临界点）

### 🟨 下一个 Sprint（P2，机会成熟时）

- 等 schema 有其他必改项时，把 compressedVariants 一起升到 1.1.0
- 同时升 CLI `--strict` 开关

### 🔴 长期规划（P3，暂缓）

- archiver 引擎：**触发条件**：出现第一个 > 20 MB 包
- 增量包 diff：**触发条件**：Hybrid 容器压缩包常态 > 5 MB 且每月更新

---

## 六、⚠️ 升级过程的风险与回滚策略

### 6.1 风险评估

| 升级 | 风险 | 回滚策略 |
|------|------|----------|
| 并发哈希 | 🟢 无 | hash 字节一致可验证 |
| 整包 hash | 🟢 只新增字段 | 老消费方忽略新字段 |
| 拷贝并发 | 🟡 高 IO 压力下可能触发 EMFILE | `pLimit(8)` 保守上限 |
| Brotli 重压 | 🟡 Brotli level 11 对 HTML 会慢些（但 HTML 通常 < 10 KB，单次 < 50ms）| fail-safe：异常不致命 |
| inspect 启发式 | 🟡 可能误报 | 先做 warn，不 fail；`--strict` 才 fail |

### 6.2 必做的验证

升级完成后，跑：

```bash
# 所有 example 项目
pnpm --filter vmpa offline:build
pnpm --filter rmpa offline:build
pnpm --filter config-demo build

# 对比产物
du -sh examples/vmpa/dist-offline/*.zip
find examples/vmpa/dist-offline/files -type f | wc -l

# manifest 比对
diff <(jq -S . old/manifest.json) <(jq -S . new/manifest.json)
```

**底线**：升级前后 zip 里的 **文件级 sha256 必须完全一致**（只新增字段，不改任何文件内容）。

---

## 七、🧭 决策总结

::::tip 面向"维护者"的一句话结论
**本 Sprint 花 2 天**做 4 项合并升级（**并发哈希 + 整包 hash + 拷贝并发 + Brotli 同步重压 + inspect 启发式**），拿下"每个项目构建快 3~5 倍 + 修一个隐藏的 CDN+离线组合白屏 bug + CI 防御性检查"。**其他升级全部暂缓**，理由是当前体量不需要。
::::

::::info 面向"使用者"的一句话结论
你不需要做任何事。这次升级只是让构建更快、把 manifest 里多两个字段、产物字节完全兼容。升到 `@lhx-kit/offline@0.0.3` 即可。
::::

---

## 八、📚 参考

- 🔬 [打包深度剖析](./packaging-deep-dive) — 技术选型的原理版
- 🦀 [Rolldown 迁移记](../runtime/rolldown-migration) — 这次评估的触发事件
- [📦 离线打包概览](./overview) — 基础使用文档
