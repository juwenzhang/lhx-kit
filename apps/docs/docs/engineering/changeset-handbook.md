# 📝 Changeset 使用手册：什么时候写、怎么写、不写会怎样

> 上一篇 [发布流水线](./release-pipeline) 讲清了"两阶段发布"的全景；本篇聚焦**开发者每天都会碰到**的具体问题：什么改动需要 changeset？bump level 怎么选？多个包一起改怎么写？写错了会发生什么？以及 lhx-kit 在 2026 年 5 月把 `fixed` 切换成 `linked` 之后语义有什么变化。

---

## 🎯 一句话规则

> **改动了 `packages/*/src/**` 下的任何一个文件，提交前必须 `pnpm changeset add`**。否则 release workflow 不会触发发布——你的改动**会进 git，但永远不会上 npm**。

下面这张决策树是日常的速查参考：

```
 改了哪里？
   │
   ├─ packages/*/src/**         → 必须写 changeset（patch / minor / major）
   ├─ packages/*/package.json   → 改了 deps/exports → 必须写
   │                            → 只改 description/keywords → 可选（不影响功能）
   ├─ packages/*/README.md      → 不需要（README 同步另有脚本）
   ├─ packages/*/tests/**       → 不需要（tests 不发布）
   ├─ apps/docs/**              → 不需要（@lhx-kit/docs 在 ignore 列表里）
   ├─ examples/**               → 不需要（examples 在 ignore 列表里）
   ├─ .github/workflows/**      → 不需要（CI 不上 npm）
   ├─ scripts/**                → 不需要（仓库工具，不发布）
   └─ 仅 .changeset/、配置文件   → 不需要（本身就是发布元数据）
```

---

## 🧭 Bump Level 决策表

Changesets 用的是标准 SemVer：`major.minor.patch`。每写一份 changeset 都要选择 bump level，规则不复杂但**很多人选错**：

| 场景 | bump | 例子 |
|---|---|---|
| 修 bug、性能优化、内部重构、类型收紧 | **patch** | 修一个 race condition；把 `any` 换成精确类型 |
| 新增功能、新增 API、新增 export、新增配置项（向后兼容） | **minor** | `createRequest` 新增 `dedupe` 选项；新增 `@lhx-kit/runtime/cdn-loader` 子路径 |
| 删除/重命名 export、改变默认行为、改变现有 API 签名 | **major** | 把 `setupMobile()` 改名为 `installMobile()`；默认 `cdn.fallback` 从 `local` 改为 `none` |

**几个容易判错的边界情况**：

- 修一个让用户**类型报错**的 bug → 看用户视角：之前能编译现在不能 = breaking = **major**；之前已经在跑只是类型不对 = **patch**
- 新增 `peerDependency` → 用户必须装新包 = **major**
- 升级一个 `dependency` 的 minor → 自己内部的事 = **patch**
- 升级一个 `dependency` 的 major（且影响外部行为） → **minor 或 major**，看具体行为是否变化
- 仅删 `internal` 标记的 API（即使外部能 import） → 严格说也是 **major**（用户能 import 到的就是公共面）

---

## ✍️ 怎么写一份高质量 changeset

### 命令式入口

```bash
pnpm changeset
# 或
pnpm changeset add
```

交互式选择哪些包、什么 level、写一段描述。但 lhx-kit 实战里**更常见的是手写**——文件就放在 `.changeset/<slug>.md`，格式很简单：

```markdown
---
'@lhx-kit/cli': patch
'@lhx-kit/runtime': minor
---

Add `dedupe` option to `createRequest` so concurrent identical requests
collapse to a single in-flight Promise. Also fix a regression in CLI
`add` command that mis-detected pnpm 9 lockfile format.
```

### 描述部分写什么

**好的描述**回答三件事：
1. **改了什么**（行为/API/类型）
2. **为什么**（动机或修了哪个 bug）
3. **用户看得到的影响**（API 变化、迁移建议、需要重启某进程之类）

```markdown
---
'@lhx-kit/vite-plugin': patch
---

Skip `experimentalMinChunkSize` injection when running on Rolldown — the
Vite 8 dev server warns and ignores the field, which made our build log
noisy. Detection uses the `rolldownVersion` named export probe so Vite
5/6/7 still get the original behavior.
```

**糟糕的描述**——下面这些都属于：

```markdown
---
'@lhx-kit/cli': patch
---

bug fix
```

```markdown
---
'@lhx-kit/cli': patch
---

修了下 add.ts 的问题
```

> **为什么重要**：CHANGELOG 直接由 changeset 描述拼接而成。用户在 npm 页面看的就是这段话。半年后回头看 git log 找问题的也是你自己。

### 文件名怎么取

`changesets/cli` 默认生成像 `unique-cats-jump.md` 这样的随机两词文件名，看起来 cute 但**不利于检索**。lhx-kit 的实战做法是手写一个**有语义**的 slug：

```
.changeset/lint-and-any-cleanup-2026-05.md
.changeset/cli-templates-mpa-migration.md
.changeset/runtime-add-dedupe-option.md
.changeset/ai-workflow-hardening-2026-05.md
```

格式约定：`<scope>-<what>-<optional-yyyy-mm>.md`。日期后缀只在"批量改" / "硬化" / "扫除" 这种集中维护批次里加。

---

## 🔗 fixed vs linked vs 独立版本——lhx-kit 现在用 linked

这是 2026 年 5 月才切换的语义，前后差别很大，单独讲清楚。

### 三种模式的区别

```json
// 模式 1：fixed —— 一组永远共用同一个版本号
"fixed": [["@lhx-kit/cli", "@lhx-kit/runtime", ...]]

// 模式 2：linked —— 一组在版本号上对齐，但只升"被改的"
"linked": [["@lhx-kit/cli", "@lhx-kit/runtime", ...]]

// 模式 3：独立 —— 每个包独立版本号
"fixed": [], "linked": []
```

| 维度 | `fixed` | `linked` | 独立 |
|---|---|---|---|
| 改一个包，发版会发哪些？ | **全部 8 个**（即使没改） | 只发被改的 | 只发被改的 |
| 没改的包版本号会变吗？ | 会跟着升 | 不变 | 不变 |
| 用户视角 | 全套同 1.4.0，最简单 | 改的升到统一新版本，没改的停留 | 各包独立，需要看 peer 兼容性 |
| npm 上的"空 release"噪声 | 严重 | 无 | 无 |
| 适合 | 紧耦合套件（pre-3 Vue 全家桶） | 协同发布的工具集 | 完全独立的库 |

### 为什么 lhx-kit 从 fixed 切到 linked

切换发生在 **2026-05**，commit `2747a93`。原因：

1. **fixed 下 `@lhx-kit/tsconfig` 这种纯配置包从来不变，但每次 release 都被强制 bump 到新版本号** → npm 上长出一堆"代码完全相同、只有版本号涨"的包，用户 diff 也对不上
2. **changelog 噪声严重**——每次 release 8 个包的 CHANGELOG.md 同步加一段，但其中 7 个其实没改
3. **linked 保留了"版本号对齐"的好处**——所有包的 version 仍然同步前进，用户安装任意一个，搭配的版本号还是天然兼容
4. **代价是描述层面要更精准**——开发者必须只列**真改了的包**到 changeset frontmatter

### linked 模式下写 changeset 的两个易错点

**❌ 错误示例 1**：图省事把所有包都列上

```markdown
---
'@lhx-kit/cli': patch
'@lhx-kit/runtime': patch
'@lhx-kit/renderer': patch
'@lhx-kit/offline': patch
'@lhx-kit/vite-plugin': patch
'@lhx-kit/config': patch
'@lhx-kit/skills': patch
'@lhx-kit/tsconfig': patch
---

Fix typo in CLI help text.
```

这等价于回到 fixed 模式，用 linked 就没意义了。**只列实际改了源码的包**。

**❌ 错误示例 2**：跨包改动只列了"主"包

```markdown
---
'@lhx-kit/cli': minor
---

Add `lhx-cli offline pack --strict` flag.
```

但实际上 CLI 的实现调用了 `@lhx-kit/offline` 的新 export。**只列 CLI 会让 offline 包的版本号停留**，下游用户单独装 `@lhx-kit/offline` 会找不到那个新 export。**两个包都要列**。

---

## 🚫 哪些情况**不**需要 changeset

写一份"空"的 changeset 不是优雅的做法——它会让 CHANGELOG 出现"无意义条目"。**不需要**的场景：

| 改动类型 | 例子 | 为什么不需要 |
|---|---|---|
| 文档站修改 | `apps/docs/**` | `@lhx-kit/docs` 在 changeset `ignore` 列表里 |
| Examples | `examples/**` | examples 不发包 |
| 仓库工具 | `scripts/**`、`.github/**`、`Makefile` | 不在 packages 里 |
| 配置改动 | 根 `tsconfig.json`、`biome.json`、`commitlint.config.cjs` | 不发布 |
| Test only | `packages/*/tests/**`（如果有） | tests 不进 dist |
| README 同步 | 由 `pnpm sync:readmes` 脚本生成 | 不影响产物行为 |

**唯一例外**：如果你真的想做"无代码 release"（比如纯升 README 当作版本里程碑），手写一份描述说明意图——但 99% 场景没必要。

---

## 🧪 多包同时改的几种典型形态

### 形态 1：同一改动横跨多个包（一份 changeset）

最常见。比如本批次的 lint + `any` 收敛——动了 6 个包：

```markdown
---
'@lhx-kit/cli': patch
'@lhx-kit/config': patch
'@lhx-kit/offline': patch
'@lhx-kit/renderer': patch
'@lhx-kit/runtime': patch
'@lhx-kit/vite-plugin': patch
---

Type-safety + lint hygiene sweep — no public API changes:

- Removed every `any` / `as any` from packages/*/src
- Cleared 33 Biome warnings
- Switched .changeset/config.json from fixed to linked
```

### 形态 2：互相独立的两件事（两份 changeset）

例：同一个 PR 里既加了新功能又修了 bug，两件事不相关——**写两份**：

```
.changeset/runtime-add-dedupe.md       ← '@lhx-kit/runtime': minor
.changeset/cli-fix-pnpm9-detection.md  ← '@lhx-kit/cli': patch
```

好处：CHANGELOG 上是两条独立条目，用户能分别看到。

### 形态 3：内部依赖联动 bump

`@lhx-kit/cli` depends on `@lhx-kit/runtime`。如果你改了 runtime 的内部行为但没改 API，cli 不需要写 changeset——但 changesets 会**自动**给 cli 加一个 patch bump（因为 `updateInternalDependencies: "patch"` 配置），保证 cli 的 dep range 拉到新 runtime。这一步**不需要你手动写**。

---

## 🚀 Snapshot / Canary 发布

正常 release 走 `master` → Version PR → publish。如果你想**在 PR 上预发版**让别人测试，用 snapshot：

```bash
pnpm release:snapshot
# 等价于：
# changeset version --snapshot canary && changeset publish --tag canary --no-git-tag
```

效果：
- 版本号会变成 `0.0.0-canary-20260504123456` 这种格式
- 发布到 npm 但打 `canary` tag（不是 `latest`）
- 用户用 `pnpm add @lhx-kit/cli@canary` 才能装到，不会污染 stable 安装

**适用场景**：跨 PR 的集成测试、给 reviewer 一个真实安装的包试用。

---

## 🛠️ 常用命令速查

```bash
# 写一份 changeset
pnpm changeset add

# 查看待发布的 pending changeset 状态
pnpm changeset:status

# 本地预演 version 行为（不实际推送）
pnpm version            # 等价于 changeset version + 重新生成 lockfile

# 本地 dry-run release（只看会发什么，不真发）
pnpm release:dry

# Canary / snapshot 发布
pnpm release:snapshot
```

---

## 🐛 故障排查

### "我合并了 PR，但 npm 上没看到新版本"

**最常见原因**：PR 里没有 `.changeset/*.md` 文件。release workflow 检测到没有 pending changeset → **直接退出**，既不开 Version PR 也不发布。

**自检**：
```bash
ls .changeset/*.md   # 应该看到至少一份你新加的（不算 README.md 和 config.json）
pnpm changeset:status --verbose
```

### "Version PR 开了但里面没我想要的包"

**原因**：你的 changeset frontmatter 没列那个包。即使你改了它的源码，changesets 不会"自动检测"——它只看你声明的那行 yaml。

**修复**：编辑现有的 `.changeset/<slug>.md`，把缺的包加进 frontmatter，重新 push。

### "Version PR 显示某个我没改的包也要 bump"

**原因 1**：linked 组里另一个包要 bump，所以整组对齐到统一新版本号——这是 `linked` 的预期行为，不是 bug。

**原因 2**：内部依赖联动（`updateInternalDependencies: "patch"`）。如果 runtime 升了 patch，cli 因为 depend on runtime 也会被自动加一个 patch bump。

### "release workflow 跑了但 npm publish 失败"

最常见三种：
1. **没配 npm OIDC**——参考上一篇 [发布流水线](./release-pipeline) 的 Trusted Publishing 段落
2. **`access` 字段不是 `public`**——scoped 包必须显式声明
3. **包名冲突**——`@lhx-kit/<name>` 在 npm 已被别人占用，scope 没有所有权

详细日志在 GitHub Actions 的 `release` job 输出里翻 `npm error` 关键字。

---

## 🎯 写在最后：lhx-kit 的 changeset 纪律

总结一条最重要的纪律：

> **每个改动 `packages/*/src/**` 的 commit/PR，都必须带一份 changeset。把"忘写 changeset"当成和"忘写测试"同等量级的事故。**

具体执行靠两道防线：
1. **CONTRIBUTING.md 写明这条**——人为提醒
2. **CI 检测**：未来可以用 `changesets/changelog-github` + `pnpm changeset:status` 在 PR 上加一个 status check，没 changeset 就红脸。lhx-kit 当前还没启用这条强制检测，靠 review 把关——**这也是一个值得做的优化项**。

如果你正在改 packages 但忘了写 changeset，**任何时候补一份都不晚**——只要在 merge 之前。merge 之后想补就只能新发一个 commit + 新 PR。
