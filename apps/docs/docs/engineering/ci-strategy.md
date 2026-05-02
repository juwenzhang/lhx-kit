# ⚙️ CI 策略：paths / 跨平台 / frozen / pre-push

> 一条 monorepo CI 流水线容易悄悄跑偏的地方远比想象多：lockfile 在 Windows 上缺原生二进制、paths filter 写反导致 CI 假绿、pnpm 9 下的 bin shim 未重建、token 换到 OIDC 后 provenance 没开……本篇整理 lhx-kit 踩过的坑和最终方案。

---

## 🧭 CI 三个 Workflow 分工

lhx-kit 的 `.github/workflows/` 只有 3 个文件：

| Workflow | 文件 | 触发条件 | 跑什么 |
|---|---|---|---|
| **CI** | `ci.yaml` | 改 `packages/**` / 根配置 / 本 workflow | biome check + typecheck + packages build + 跨平台矩阵 |
| **Docs** | `rspress-docs-ci-cd.yaml` | 改 `apps/docs/**` / lockfile / 本 workflow | rspress build + GitHub Pages 部署 |
| **Release** | `release.yaml` | **每次 master push（无 paths）** | changesets: 开 Version PR 或 `changeset publish` |

**为什么这样分**？经验上，这是 monorepo 里最省算力又最少漏判的组合：
- 文档改动不触发 CI → 节省几分钟
- packages 改动不重部署文档 → 节省几分钟
- Release 永远跑 → 防止 Version PR 合并时漏判

---

## 🎯 核心策略 1：paths 白名单

### 白名单 vs 黑名单：必须用白名单

GitHub Actions 里触发条件支持两种路径过滤：

```yaml
on:
  push:
    paths: [...]         # 白名单：只有匹配才跑
    paths-ignore: [...]  # 黑名单：只有全部不匹配才跑
```

**看起来 `paths-ignore` 更方便**（只排除 docs 就行），但它有个致命陷阱：

> GitHub 的 `paths-ignore` 判定规则是「所有改动文件都匹配 ignore 列表才跳过」。
> 所以如果一次 push 同时动了 `packages/cli/src/x.ts` 和 `README.md`，`paths-ignore: ['*.md']` 会……**直接跳过 CI**？不，它会跑。
>
> 真正的坑在于：如果 ignore 写了 `packages/**` 想"只在文档改动时跑"（反过来用），一旦 push 里包含任何 `packages/**` 外的文件，CI 就会跑，但实际上是你不想跑的场景。

一句话总结：

| 方案 | 漏列一个路径的后果 |
|---|---|
| ✅ **`paths` 白名单** | CI 不跑（补进来就好，安全） |
| ❌ **`paths-ignore` 黑名单** | CI **错跑**或**该跑没跑**，难以察觉（危险） |

所以 lhx-kit 所有 workflow 都用白名单。

### lhx-kit 的 CI paths 实例

```yaml
on:
  push:
    branches: [master, main]
    paths:
      - 'packages/**'              # 实际代码
      - 'package.json'             # 根 deps / scripts 变化
      - 'pnpm-lock.yaml'           # 依赖树变化
      - 'pnpm-workspace.yaml'      # workspace 结构变化
      - 'tsconfig.base.json'       # 全局 TS 配置
      - 'biome.json'               # lint 规则
      - 'commitlint.config.cjs'
      - 'lint-staged.config.cjs'
      - '.github/workflows/ci.yaml'  # workflow 自身
  pull_request: {...}              # 同上
  workflow_dispatch:               # 允许手动触发
```

几个**必须列入**的隐性依赖：

- **根 `package.json`**——改 scripts 或 devDeps 影响全局
- **lockfile**——CI 的 `--frozen-lockfile` 直接读它
- **biome.json / tsconfig.base.json**——规则变了所有包都要重跑
- **workflow 文件自身**——改 ci.yaml 要立刻能验证效果

### Release workflow 为什么不加 paths

**刻意不加**。原因：

```
Version Packages PR 合并时，这次 merge commit 只改了：
  - package.json            (版本号 bump)
  - CHANGELOG.md            (changelog 追加)
  - .changeset/*.md         (被删除)
  - pnpm-lock.yaml          (workspace 交叉引用版本号同步)

如果 release.yaml 加了 paths 过滤（比如没列 CHANGELOG.md），
Version PR 合并时可能刚好不命中 paths → 发布被静默跳过
→ 包永远卡在旧版本。
```

Release workflow 本身很轻——无 paths 匹配时只跑 install + build + changesets 决策，大约 2 分钟，不值得优化。**鲁棒性 > 速度。**

---

## 🌍 核心策略 2：跨平台 lockfile

### 问题：CI 矩阵跑 Windows 时报

```
Cannot find module '@rollup/rollup-win32-x64-msvc'
```

或者 biome 在 linux 上报：

```
Cannot find module '@biomejs/cli-linux-x64/biome'
```

### 根因

pnpm 在本地 `pnpm install` 时，**只下载当前机器平台的原生二进制**（Rollup、Biome、esbuild、swc、lightningcss 这些 Rust/Go 写的底层工具都是每个 OS + CPU + libc 组合单独一个 npm 包）。

- 你本地 macOS arm64 开发 → lockfile 里只有 `@rollup/rollup-darwin-arm64`
- 推到 CI 跑 Linux → 需要 `@rollup/rollup-linux-x64-gnu` 但 lockfile 里没登记 → `--frozen-lockfile` 不允许 resolve → ❌

### 解法：`pnpm.supportedArchitectures`

在根 `package.json` 加：

```json
{
  "pnpm": {
    "supportedArchitectures": {
      "os": ["darwin", "linux", "win32"],
      "cpu": ["x64", "arm64"],
      "libc": ["glibc", "musl"]
    }
  }
}
```

这个字段告诉 pnpm："请在 lockfile 里登记**所有**这些平台组合的可选二进制"。

改完之后执行一次：

```bash
pnpm install --lockfile-only --force
```

`pnpm-lock.yaml` 会多出几百行 `optionalDependencies` 条目，列出 Windows / Linux / Alpine / arm64 各自的原生二进制包名和哈希。**CI 就能 `--frozen-lockfile` 跨平台跑了。**

### 代价

lockfile 体积会涨（lhx-kit 从 ~12k 行涨到 ~14k 行），但：
- 不影响 install 速度（pnpm 只下载当前平台的二进制）
- 不影响运行时大小
- 换来"跨平台 CI 永不翻车"

**强烈建议所有发 npm 的 monorepo 都这么配**。

---

## 🔒 核心策略 3：`--frozen-lockfile`

### 规则

CI 上**永远**用：

```bash
pnpm install --frozen-lockfile
```

而不是默认的 `pnpm install`。

### 区别

| 模式 | 行为 |
|---|---|
| `pnpm install`（默认） | lockfile 过时会**自动更新**，新 resolve 的版本写回 |
| `pnpm install --frozen-lockfile` | lockfile 必须精确匹配 `package.json`，有任何不一致就**直接失败** |

默认模式在本地开发方便，但在 CI 上是**灾难**：
- 本地提交时 lockfile 还没同步 → CI 偷偷改了 lockfile → 但 CI 不会 commit 回来 → 下次开发者 pull 下来 lockfile 还是旧的 → 无限循环
- 依赖某人发了新的 patch 版本 → CI 在发布前"偷偷"升级 → 产物带了未经测试的代码

`--frozen-lockfile` 强制 lockfile 成为"唯一事实来源"。一旦 `package.json` 和 lockfile 不一致，CI 红灯提醒开发者在本地 `pnpm install` 提交新 lockfile。**痛一次，就再也不会有奇怪的生产问题。**

### 衍生约定

- 所有 `install` 步骤都加 `--frozen-lockfile`
- 需要 install 做"补 bin shim"这种副作用时（下一节讲），配合 `--prefer-offline`

---

## 🪛 核心策略 4：pnpm 9 的 bin shim 重建坑

### 症状

```
$ pnpm --filter vmpa build
> vmpa@0.1.0 build
> lhx-cli build

/bin/sh: lhx-cli: command not found
```

但本地跑好好的。

### 根因

lhx-kit 的 `packages/cli/package.json` 里：

```json
{
  "name": "@lhx-kit/cli",
  "bin": { "lhx-cli": "./dist/bin.js" }
}
```

pnpm 在 workspace 里把 `lhx-cli` 挂到 `.bin/lhx-cli` 做 symlink。流程：

```
pnpm install
  ├─ 解析 workspace 图
  └─ 建 .bin/lhx-cli → packages/cli/dist/bin.js 的 symlink
           ⚠️  但此时 packages/cli/dist/ 还没 build，目标文件不存在！

pnpm --filter './packages/*' build
  ├─ 产出 packages/cli/dist/bin.js   ✓
  └─ 但 .bin/lhx-cli 的 symlink 没重建，还是"指向不存在文件"

pnpm --filter vmpa build
  └─ 尝试执行 lhx-cli → 找到 .bin/lhx-cli symlink → 跟到 dist/bin.js
     ⚠️  在 pnpm 9 下某些场景 symlink 其实是"之前那次失败 install 留下的坏 link"
         → ENOENT → command not found
```

### 解法演进

**第一版（失败）**：

```yaml
- run: pnpm install --offline
```

`--offline` 在 pnpm 9 下**不会重新处理 workspace 内部包的 bin symlink**，bug 依旧。

**最终版**：

```yaml
- name: Build internal packages
  run: pnpm --filter './packages/*' --if-present build

- name: Rebuild pnpm bin shims
  run: pnpm install --frozen-lockfile --prefer-offline
```

- `--frozen-lockfile` → 保证 lockfile 还是唯一事实来源
- `--prefer-offline` → 不走网络，所有 tarball 用本地 pnpm store 缓存
- 完整 `install` → 强制 pnpm 重新处理 workspace 内部包的 bin symlink，link 到现在存在的 dist 文件

代价：多一次 install 动作（大约 5~10 秒）。收益：`lhx-cli` 永远可用。

---

## 🎣 核心策略 5：Husky pre-commit + pre-push

CI 再严格也比不过**在 push 前拦截**。lhx-kit 本地钩子：

### `.husky/pre-commit`

```bash
#!/usr/bin/env sh
pnpm exec lint-staged
```

配合 `lint-staged.config.cjs`：

```js
module.exports = {
  '**/*.{ts,tsx,js,jsx,mjs,cjs}':
    'biome check --write --no-errors-on-unmatched --files-ignore-unknown=true',
  '**/*.{json,jsonc}':
    'biome check --write --no-errors-on-unmatched --files-ignore-unknown=true',
  '**/*.{yaml,yml}':
    'biome check --write --no-errors-on-unmatched --files-ignore-unknown=true',
  '**/*.{md,mdx}':
    'biome check --write --no-errors-on-unmatched --files-ignore-unknown=true',
  '**/*.{css,scss,less}':
    'biome check --write --no-errors-on-unmatched --files-ignore-unknown=true',
};
```

**只对 staged 文件跑 biome**——不会把别人留下的旧 warning 硬塞给你。

### `.husky/pre-push`

```bash
#!/usr/bin/env sh
set -e

echo "🎨 pre-push: biome check (full repo)..."
pnpm exec biome check .

echo "🔍 pre-push: running typecheck across all workspaces..."
pnpm -r --if-present --parallel typecheck
```

两步：
1. **biome check 全仓**——lint-staged 只看 staged，pre-push 看全量，能发现"你没碰但受你影响"的 lint 错
2. **typecheck 全部 workspace**——不 build 但走一遍类型检查，比 CI 快（CI 还要跑 biome + build）

### 为什么 `set -e`

任一步非 0 就中断 push。没这个的话 biome 挂了但脚本继续跑 typecheck、typecheck 过了就退 0 → push 成功 → CI 里 biome 挂红。

### commitlint

`.husky/commit-msg`:

```bash
pnpm exec commitlint --edit "$1"
```

配合 Conventional Commits 规则，不符合规范的 commit message 直接在本地拦下。和 CI 上的 `commitlint` job（只在 PR 触发）形成双保险。

---

## 📋 完整的 ci.yaml 参考

```yaml
name: CI

on:
  push:
    branches: [master, main]
    paths: [...]      # 上面策略 1 的白名单
  pull_request:
    branches: [master, main]
    paths: [...]
  workflow_dispatch:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true  # 同 PR 新 push 取消旧 run

permissions:
  contents: read    # 最小权限

env:
  NODE_VERSION: 20

jobs:
  lint:
    name: 🎨 Lint (Biome)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: {node-version: 20, cache: pnpm}
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec biome check .

  commitlint:
    name: 📝 Commit Lint
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4
        with: {fetch-depth: 0}
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: {node-version: 20, cache: pnpm}
      - run: pnpm install --frozen-lockfile
      - run: |
          pnpm exec commitlint \
            --from=${{ github.event.pull_request.base.sha }} \
            --to=${{ github.event.pull_request.head.sha }} \
            --verbose

  typecheck-build:
    name: 🔧 Typecheck & Build (Node ${{ matrix.node }})
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix: {node: [20, 22]}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: {node-version: ${{ matrix.node }}, cache: pnpm}
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter './packages/*' --if-present build
      - run: pnpm install --frozen-lockfile --prefer-offline  # 重建 bin shim
      - run: pnpm -r --if-present --parallel typecheck

  cross-platform:
    name: 🌐 Cross-platform (${{ matrix.os }})
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix: {os: [ubuntu-latest, macos-latest, windows-latest]}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: {node-version: 20, cache: pnpm}
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter '@lhx-kit/*' build
```

---

## 📊 性能数据（参考）

| Workflow | 策略前耗时 | 策略后耗时 | 改动点 |
|---|---|---|---|
| CI（docs-only push） | ~5 分钟 | 跳过（0s） | 加 paths 白名单 |
| Docs deploy | ~4 分钟 | ~2.5 分钟 | 去掉无用 `packages/*` 预构建 |
| CI（packages 改动） | ~7 分钟 | ~5 分钟 | 去掉 examples build |
| Release（无 changeset 时） | ~2.5 分钟 | ~2.5 分钟 | 不变（故意） |

---

## ⚠️ 常见反模式

1. **在 CI 用 `pnpm install`（不带 `--frozen-lockfile`）**
   → lockfile 被偷偷改，生产不可复现

2. **`paths-ignore` 黑名单**
   → 漏掉一个路径就误跑或漏跑

3. **Release workflow 加 paths**
   → Version PR 合并时可能被跳过，包卡旧版本

4. **用 `pnpm install --offline` 当 bin shim 重建手段**
   → pnpm 9 下不工作，改 `--frozen-lockfile --prefer-offline`

5. **忘记 `pnpm.supportedArchitectures`**
   → Windows/Alpine CI 找不到原生二进制

6. **pre-push 钩子忘 `set -e`**
   → 前一步失败后一步继续跑，误报"通过"

7. **examples 纳入发布阻塞**
   → 样本坏了就阻断 packages 发布，本末倒置

---

## 📚 相关文档

- [🛠️ 工程化总览](./overview)
- [🚀 发布流水线](./release-pipeline)
- [pnpm 官方文档：supportedArchitectures](https://pnpm.io/package_json#pnpmsupportedarchitectures)
- [GitHub Actions: paths filter 官方说明](https://docs.github.com/en/actions/using-workflows/triggering-a-workflow#using-filters)

---

<div style="text-align:center;opacity:0.7;margin-top:2rem">
  本篇的每个坑都是 lhx-kit 2026-04 ~ 2026-05 真实踩过的。<br />
  欢迎通过 📝 编辑此页 补充你的实战经验。
</div>
