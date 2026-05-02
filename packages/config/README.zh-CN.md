# @lhx-kit/config

> 🧭 **lhx-kit 工具链的单一真理源（SSOT）**。
> 负责加载并校验 `project.config.ts` / `offline.config.ts`；其他所有包都消费这份解析结果。

[![npm](https://img.shields.io/npm/v/@lhx-kit/config?color=0c9)](https://www.npmjs.com/package/@lhx-kit/config)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[English](./README.md)

---

## 安装

```bash
pnpm add -D @lhx-kit/config
```

> 需要 Node.js `>= 18.18.0`。

## 使用

### 定义项目配置

```ts title="project.config.ts"
import {defineProjectConfig} from '@lhx-kit/config';

export default defineProjectConfig({
  name: 'my-app',
  framework: 'react',
  pages: {
    home: {title: 'Home'}
  },
  envs: {
    dev: {apiBase: '/api'},
    prod: {apiBase: 'https://api.example.com'}
  }
});
```

### 运行时加载

```ts
import {loadProjectConfig, resolveEnv} from '@lhx-kit/config';

const project = await loadProjectConfig(process.cwd());
const env = resolveEnv(project, 'dev');
console.log(env.apiBase);  // '/api'
```

---

## 公开 API

| 导出 | 作用 |
| --- | --- |
| `defineProjectConfig(cfg)` | 类型推导 identity helper |
| `defineOfflineConfig(cfg)` | 同上，用于 `offline.config.ts` |
| `loadProjectConfig(rootDir)` | 通过 `jiti` + `zod` 加载并校验 |
| `loadOfflineConfig(rootDir, project)` | 可选的离线配置加载 |
| `findNearestProjectRoot(startDir)` | 向上查找配置文件 |
| `resolveEnv(project, mode)` | 按 `[prod, staging, test, dev]` 降级链解析 env |
| `normalizeEnvMode(mode)` | `'production' → 'prod'`、`'development' → 'dev'` |
| `listPages(project, offline?, opts?)` | 按 `offline` 标记或白名单过滤页面 |
| `getPage(project, name)` | 未知名字抛错并列出可用值 |
| `resolveAlias(project, name)` | 从 `aliases` map 取一个 |
| `validateAgainstFilesystem(project, offline)` | 校验入口文件 / alias / prefetch 占位符 |
| `extractPlaceholders(input)` | 提取 `apiUrl` 里的 `${var}` 占位 |

zod 类型定义见 [`src/schema.ts`](./src/schema.ts)。

---

## 设计

### 用 `jiti` 加载 TS 配置

运行时加载 `.ts / .mjs / .js / .json`，**不需要预编译**。关键参数：

```ts
moduleCache: false      // HMR 能拿到新内容
interopDefault: true    // ESM `export default` 读成默认导出
```

### 严格的 zod schema

每个字段都有 schema。`.strict()` 表示**多余字段会报错**而不是静默忽略——防拼写错误。

### 环境降级算法

```ts
const ENV_FALLBACK_ORDER = ['prod', 'staging', 'test', 'dev'];

resolveEnv(project, 'staging')
  → 精确匹配 project.envs.staging
  → 未命中按 ENV_FALLBACK_ORDER 依次找
  → schema 保证至少有一个存在
```

### 文件系统校验

`validateAgainstFilesystem(project, offline)` 做 **6 项检查**：

1. 每个 page 的 `entry` 文件存在
2. 每个 `alias` target 是真实目录
3. `env.apiBase` 缺失 → INFO（非 error）
4. `offline.whitelistPages` 必须是已声明 page 的子集
5. 每条 `prefetch.match.page` 是已声明 page
6. 每个 `prefetch.apiUrl` 的 `${var}` 占位都在 `keys` 里声明

---

## 依赖

| 依赖 | 用途 |
| --- | --- |
| `jiti` ^2.4.2 | 无需构建即可加载 TS 配置 |
| `zod` ^3.24.1 | Schema 定义 + 类型推导 |

**无其他运行时依赖**，解压后约 110 KB。

---

## 文档

- 📖 [架构总览](https://juwenzhang.github.io/lhx-kit/guide/architecture)
- 📝 [配置参考](https://juwenzhang.github.io/lhx-kit/cli/reference)

## License

[MIT](./LICENSE) © luhanxin
