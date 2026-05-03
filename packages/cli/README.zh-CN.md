# @lhx-kit/cli

> ⚙️ **lhx-cli** — 一条命令生成真正可上生产的 MPA 项目。
> 不是"hello world + Vite"，而是第一天就有路由、状态、请求、Mock、CI、Docker、测试的**完整项目**。

[![npm](https://img.shields.io/npm/v/@lhx-kit/cli?color=0c9)](https://www.npmjs.com/package/@lhx-kit/cli)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[English](./README.md)

---

## 安装

```bash
# 全局安装
pnpm add -g @lhx-kit/cli

# 或一次性使用（不安装）
pnpm dlx @lhx-kit/cli create my-app
```

> 需要 Node.js `>= 18.18.0`。

## 快速开始

```bash
lhx-cli create my-app
cd my-app
pnpm install && pnpm dev
```

---

## 命令总览

| 命令 | 用途 |
| --- | --- |
| `lhx-cli create <name>` | 🚀 脚手架创建新项目 |
| `lhx-cli add page <name>` | ➕ 增量添加 page（entry / router / render.json / views） |
| `lhx-cli dev [--page]` | 🧪 启动 Vite 开发服务器 |
| `lhx-cli build [--page]` | 🏗️ 生产构建 |
| `lhx-cli info` | 📊 打印项目配置摘要 |
| `lhx-cli doctor` | 🩺 诊断环境与配置 |
| `lhx-cli offline <action>` | 📦 离线包（`build\|manifest\|inspect`） |
| `lhx-cli upgrade` | ⬆️ 升级项目（规划中） |

完整参数参考：[CLI 文档](https://juwenzhang.github.io/lhx-kit/cli/reference)。

---

## 示例

### 交互式创建

```bash
lhx-cli create my-app
# ? 选择模板                  · react-mpa
# ? 启用哪些 feature?         · offline, mock, e2e
# ? 包管理器                   · pnpm
# ? 是否 git init?            · yes
# ? 是否立即安装依赖?          · yes
```

### 非交互（CI 友好）

```bash
lhx-cli create my-app \
  --template=react-mpa \
  --features=offline,e2e,mock \
  --pm=pnpm \
  --yes
```

### 一键生成完整页面

```bash
lhx-cli add page profile
# ✓ src/pages/profile/entry.tsx
# ✓ src/pages/profile/router.tsx
# ✓ src/pages/profile/render.json
# ✓ src/pages/profile/views/ProfileLanding.tsx
# ✓ src/pages/profile/views/ProfileAbout.tsx
# ✓ project.config.ts 通过 AST (ts-morph) 插入新字段
```

### 诊断配置问题

```bash
lhx-cli doctor
# ✅ Node.js 20.18.0
# ✅ pnpm 9.15.0
# ✅ project.config.ts schema
# ❌ LHX_E001: page "profile" 已声明但 src/pages/profile/entry.tsx 不存在
#    修复：lhx-cli add page profile 或从 project.config.ts 删除
```

---

## 模板

内置两套生产级模板：

| 模板 | 框架 | 状态管理 | UI 库 | 路由 |
| --- | --- | --- | --- | --- |
| 🟢 `vue3-mpa` | Vue 3.5 | Pinia | Vant 4 | vue-router 4 |
| 🔵 `react-mpa` | React 19 | Zustand 5 | Ant Design 5 | react-router 6 |

两套模板都自带：**ESLint + Prettier + Husky + Commitlint + lint-staged + Vitest + Playwright + MSW + Docker + GitHub Actions**。

---

## 设计

### AST 级配置改写

`lhx-cli add page` 不用正则或字符串拼接，用 [`ts-morph`](https://ts-morph.com/) 解析 `project.config.ts`，在 AST 层找到 `pages` 节点，插入新的 `PropertyAssignment`。

**效果**：你已有的注释 / 缩进 / 格式**完整保留**。

### 本地模板（无需联网）

模板随 CLI 包一起发布（`packages/cli/templates/`）。运行时不拉 GitHub，不依赖 registry，**离线可用**。

### 基于 `cac` 的命令路由

~15KB 的轻量命令解析器。**不预加载**所有命令模块——`lhx-cli --help` 只需 <50ms，因为子命令按需 lazy load。

---

## 依赖

| 依赖 | 用途 |
| --- | --- |
| `cac` | 命令路由（体积最小 / 最快） |
| `prompts` | 交互式问答 |
| `kolorist` | 终端着色 |
| `execa` | 跨平台子进程（`pnpm install`、`git init`） |
| `fs-extra` | `copy` / `remove` / `ensureDir` |
| `jiti` | 加载用户的 `project.config.ts` |
| `ts-morph` | AST 级配置改写 |
| `giget` | 预留用于未来的远端模板拉取 |
| `@lhx-kit/config` | 配置 schema + loader |
| `@lhx-kit/offline` | `offline` 子命令实现 |

---

## 文档

- 📖 [CLI 命令参考](https://juwenzhang.github.io/lhx-kit/cli/reference)
- 🚀 [快速开始](https://juwenzhang.github.io/lhx-kit/guide/getting-started)
- 🧱 [模板目录](https://juwenzhang.github.io/lhx-kit/templates/catalogue)

## License

[MIT](./LICENSE) © luhanxin

<!-- lhx-readme-footer:begin -->

---

## 📦 安装

```bash
npm install @lhx-kit/cli
# 或
pnpm add @lhx-kit/cli
```

![npm](https://img.shields.io/npm/v/%40lhx-kit%2Fcli.svg) 
![provenance](https://img.shields.io/badge/provenance-verified-brightgreen?logo=npm)

## 📖 文档与延伸阅读

- 🏠 项目首页：<https://juwenzhang.github.io/lhx-kit/>
- 📘 相关文档：[CLI 参考](https://juwenzhang.github.io/lhx-kit/cli/reference) · [架构总览](https://juwenzhang.github.io/lhx-kit/guide/architecture)
- 🛠️ 工程化专栏：[/engineering/overview](https://juwenzhang.github.io/lhx-kit/engineering/overview)
- 💬 Issue / 讨论区：<https://github.com/juwenzhang/lhx-kit/issues>

## 🤝 参与贡献

欢迎 PR！请阅读 [CONTRIBUTING.md](https://github.com/juwenzhang/lhx-kit/blob/master/CONTRIBUTING.md)，用户可见变更请用 `pnpm changeset` 声明。新手友好 label：`good first issue` / `help wanted`。

## 📄 License

[MIT](https://github.com/juwenzhang/lhx-kit/blob/master/LICENSE) © luhanxin

<sub>属于 [`@lhx-kit`](https://github.com/juwenzhang/lhx-kit) monorepo。每次发布都经过 npm Trusted Publishing（OIDC）签名——可在 npm 包页面验证 provenance 证明。</sub>

<!-- lhx-readme-footer:end -->
