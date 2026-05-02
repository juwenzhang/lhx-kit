# 🔄 版本迁移指南

> 本章记录 lhx-kit 各版本间的 breaking change 以及迁移步骤。

---

## 一、📋 版本状态

| 版本 | 状态 | 发布日期 | Node 要求 |
| --- | --- | --- | --- |
| `0.0.0` | 🟢 开发中 | - | >= 18.18 |

:::info 当前处于 0.x 早期阶段
- 🟡 API 可能有小幅调整（会在这里记录）
- 🟢 语义遵循 [Semantic Versioning](https://semver.org/)
- 🔴 1.0 发布前，minor 版本可能包含 breaking change
:::

---

## 二、🧭 接下来的 Breaking Change 计划

下列变更**计划在 0.1.0 或 1.0.0 引入**，提前公示：

### 2.1 `renderer` schema 字段命名统一

:::warning 0.1.0 计划
**现状**：

```json
{
  "components": [
    {"name": "Banner", "props": {...}, "when": {...}}
  ]
}
```

**计划**（统一 `$` 前缀区分 directive 和 props）：

```json
{
  "$components": [
    {"$name": "Banner", "props": {...}, "$when": {...}}
  ]
}
```

**为什么**：避免 `props.name` 和 component 的 `name` 混淆。

**迁移工具**：提供 `lhx-cli migrate renderer-v0.1` 自动改写。
:::

### 2.2 `offline.config.ts` 增加 `schemaVersion`

:::warning 0.2.0 计划
**现状**：

```ts
export default defineOfflineConfig({
  enabled: true,
  versions: {prod: '1.0.0'}
});
```

**计划**：

```ts
export default defineOfflineConfig({
  schemaVersion: '2.0.0',   // ← 新增
  enabled: true,
  versions: {prod: '1.0.0'}
});
```

**为什么**：manifest 的 schemaVersion 和 config 的 schemaVersion 分离，便于独立演进。
:::

---

## 三、🚢 0.0.0 → 0.1.0（未发布）

:::info 占位
本节将在 0.1.0 发布时填充。
:::

---

## 四、🛠️ 迁移工具（规划）

### 4.1 `lhx-cli upgrade`

规划中的命令。功能：

```bash
lhx-cli upgrade
# 1. 读本地 package.json 的 @lhx-kit/* 版本
# 2. 对比最新版
# 3. 显示每个包的 changelog
# 4. 按顺序执行 migration script
# 5. 运行 doctor 验证
```

### 4.2 配置迁移脚本

```bash title="规划中"
lhx-cli migrate <target-version>
# 例如：
lhx-cli migrate 0.1.0   # 把 project.config.ts / offline.config.ts 升级到 0.1.0 格式
```

实现方式：

- 读现有 config（via `@lhx-kit/config`）
- `ts-morph` 做 AST 修改
- 生成 backup `*.backup.ts`
- 应用修改
- 运行 `zod.parse` 验证

---

## 五、🧪 beta 版本使用

目前所有包版本都是 `0.0.0`，未发布到 npm。

如果你想在自己的项目里试：

```bash title="本地 link 方式"
cd lhx-kit
pnpm install
pnpm --filter '@lhx-kit/*' build

# 在你的项目里
pnpm link --global <绝对路径>/lhx-kit/packages/cli
```

或者：

```bash title="pack + install 方式"
cd lhx-kit/packages/cli
pnpm pack
# 产出 lhx-kit-cli-0.0.0.tgz

cd <你的项目>
pnpm add file:<绝对路径>/lhx-kit-cli-0.0.0.tgz
```

---

## 六、📚 Semantic Versioning 约定

lhx-kit 使用 [SemVer 2.0.0](https://semver.org/lang/zh-CN/)：

| 版本 | 变更类型 |
| --- | --- |
| `MAJOR` | 不兼容的 API 变更 |
| `MINOR` | 向下兼容的功能新增 |
| `PATCH` | 向下兼容的 bug 修复 |

:::info 0.x 特殊规则
在 1.0 发布之前：

- `0.MINOR.x` 可能包含 breaking change（会在 Migration Guide 里说明）
- `0.x.PATCH` 只包含 bug 修复

1.0 之后严格遵守 SemVer。
:::

---

## 七、🗓️ 弃用周期

当某个 API 要被移除时：

```text
Version N      : 新 API 引入，旧 API 标记 @deprecated
Version N+1    : 旧 API 仍可用，但有 console.warn
Version N+2    : 旧 API 移除（仅在 MAJOR 版本升级时才会发生）
```

典型示例（假想）：

```text
0.2.0：createConfiguredPage({schema})  引入，createPage({schema}) 标记 @deprecated
0.3.0：createPage 仍可用，调用时 console.warn("createPage is deprecated...")
1.0.0：createPage 移除
```

---

## 八、📖 Changelog

:::info 自动化计划
未来接入 [changesets](https://github.com/changesets/changesets)，CHANGELOG 自动生成。

`CHANGELOG.md` 将按 monorepo 里**每个包独立维护**，格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。
:::

---

## 九、🤝 向后兼容承诺

### 9.1 配置文件

- `project.config.ts` 的字段**只会新增不会删除**（直到 MAJOR 升级）
- 新字段都是 optional，默认值保持原有行为

### 9.2 CLI 命令

- 已有命令的核心语义（如 `create <name>`）**不会变**
- 新增选项是 opt-in，不传保持原行为

### 9.3 Runtime API

- 公开的 `setupMobile` / `createRequest` 等签名**不会做 breaking change**（MINOR 内）
- 内部 `@lhx-kit/runtime/cdn-loader` 是给插件用的，**不保证兼容**（标注为 internal）

---

## 十、📖 相关资源

- [Semantic Versioning 2.0.0](https://semver.org/lang/zh-CN/)
- [Keep a Changelog](https://keepachangelog.com/zh-CN/)
- [changesets 文档](https://github.com/changesets/changesets)
- [FAQ Q17](./faq) — 怎么发布到 npm
