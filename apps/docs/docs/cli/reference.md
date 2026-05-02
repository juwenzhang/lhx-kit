# ⚙️ CLI 参考

`lhx-cli` 是 monorepo 的统一入口，覆盖**脚手架 / 增量添加 / 开发构建 / 离线打包 / 诊断**五类能力。

---

## 一、📋 命令总览

| 命令 | 用途 |
| --- | --- |
| [`create`](#create) | 🚀 创建新项目 |
| [`add`](#add) | ➕ 往项目里加 page / component / api / module / **package** |
| [`dev`](#dev) | 🧪 启动开发服务器 |
| [`build`](#build) | 🏗️ 生产构建 |
| [`info`](#info) | 📊 打印当前项目的配置摘要 |
| [`doctor`](#doctor) | 🩺 环境 + 项目诊断 |
| [`offline`](#offline) | 📦 离线包相关子命令 |
| [`skills`](#skills) | 🧠 AI 编程助手的 skill 包管理（Cursor / CodeBuddy / Claude / plain） |
| [`upgrade`](#upgrade) | ⬆️ 升级项目（规划中） |

---

## 二、🚀 create {#create}

```bash title="基础用法"
lhx-cli create <name>
lhx-cli create <name> --template=react-mpa --features=offline,e2e --yes
```

### 选项

| 选项 | 类型 | 说明 |
| --- | --- | --- |
| `name` | positional | 目标目录名 |
| `--template` / `-t` | `vue3-mpa \| react-mpa` | 不传走交互式选择 |
| `--features` | 逗号分隔 | `offline / mock / e2e / cdn` 可选 |
| `--yes` / `-y` | flag | 跳过所有交互，用默认答案 |
| `--pm` | `pnpm \| npm \| yarn` | 包管理器，默认 pnpm |
| `--git` / `--no-git` | flag | 创建完是否 `git init`，默认 true |
| `--install` / `--no-install` | flag | 是否自动安装依赖，默认 true |

### 🔬 行为详解

:::details 完整创建流程
```text
1. prompts 收集交互答案（或 --yes 走默认）
2. fs-extra.copy 复制 packages/cli/templates/<template>/files/
3. 对每个勾选的 feature，拷贝 templates/<template>/features/<feature>/
4. 遍历所有 *.template 文件：
   - 正则替换 <%= projectName %> / {{ projectName }}
   - 去掉 .template 后缀写入
5. ts-morph 打开 project.config.ts：
   - 找到 defineProjectConfig({...}) 的 ObjectLiteralExpression
   - 为每个勾选的 feature 调用 addPropertyAssignment 插入对应字段
   - 保留原有格式 / 注释 / tab 风格
6. 若 --git，执行 execa('git', ['init']) + 首次 commit
7. 若 --install，执行 execa(pm, ['install'])
8. 打印后续操作提示
```
:::

:::tip 为什么不用 giget / degit
| 方案 | 问题 |
| --- | --- |
| `giget` 远程拉取 | CI 网络不可控；内网环境 GitHub 访问不稳 |
| `degit` | 不支持本地 template 混合覆盖 |
| **本地 templates** ✅ | npm 发包时打进去，npx 下来就能用；支持离线 |

所以模板放 `packages/cli/templates/`，走本地 `fs-extra.copy`。
:::

### 示例

```bash title="常见用法"
# 交互式创建 React MPA 项目
lhx-cli create my-app

# CI 中非交互式
lhx-cli create my-app \
  --template=react-mpa \
  --features=offline,e2e,mock \
  --pm=pnpm \
  --yes

# 创建后不安装依赖
lhx-cli create my-app -t vue3-mpa --no-install
```

---

## 三、➕ add {#add}

```bash
lhx-cli add page <name>
lhx-cli add package <name>     # 在 monorepo 里 scaffold 一个新 workspace
lhx-cli add component <name>   # （规划中）
lhx-cli add api <name>         # （规划中）
lhx-cli add module <name>      # （规划中）
```

### `add page <name>`

一次生成页面所需的**整套文件**：

```text title="生成结果"
src/pages/<name>/
├── entry.tsx / entry.ts       # 根据 framework
├── router.tsx / router.ts     # HashRouter + 两个 lazy route
├── render.json                # 配置渲染器的就近 schema
└── views/
    ├── <Name>Landing.tsx
    └── <Name>About.tsx
```

同时 **AST 级**修改 `project.config.ts`：

```ts title="project.config.ts" {5}
// 修改前
export default defineProjectConfig({
  pages: {
    home: {title: 'Home'},
    settings: {title: 'Settings'}
  }
});

// 修改后（自动插入第 5 行）
export default defineProjectConfig({
  pages: {
    home: {title: 'Home'},
    settings: {title: 'Settings'},
    profile: {title: 'profile'}
  }
});
```

### 🔬 AST 修改 vs 字符串拼接

:::danger 字符串拼接的三个坑
1. 用户加了注释，正则位置错位
2. 用户改成多行格式，缩进对不上
3. 用户用 `pages:{...}` 无空格写法，regex 直接 miss
:::

```ts title="ts-morph 实现（零踩坑）" showLineNumbers
import {Project, SyntaxKind} from 'ts-morph';

const project = new Project();
const source = project.addSourceFileAtPath(configPath);

// 找到 defineProjectConfig({...}) 调用
const defineCall = source.getFirstDescendantByKindOrThrow(
  SyntaxKind.CallExpression
);
const configObj = defineCall.getArguments()[0] as ObjectLiteralExpression;

// 定位 pages 字段的对象字面量
const pagesAssign = configObj.getProperty('pages') as PropertyAssignment;
const pagesObj = pagesAssign.getInitializerIfKindOrThrow(
  SyntaxKind.ObjectLiteralExpression
);

// AST 级插入新字段
pagesObj.addPropertyAssignment({
  name: pageName,
  initializer: `{title: '${pageName}'}`
});

source.saveSync();
```

:::tip 保留所有细节
ts-morph 把 TS 源码 parse 成 AST，在 PropertyAssignment 层面插值。

**零踩坑**，保留用户所有原有格式 / 注释 / 行尾风格。
:::

### `add package <name>` {#add-package}

在 **pnpm monorepo 根目录**一键 scaffold 一个全新的可发布 workspace。和
`add page` 不同，这条命令**不需要**位于 lhx-kit 项目里——它是 monorepo 级别
的操作，专为"新包维护者"设计。

```bash
lhx-cli add package <name> [options]

# 示例
lhx-cli add package my-lib
lhx-cli add package renderer-plugins --description="渲染器插件 API"
lhx-cli add package legacy-shim --force        # 覆盖已存在目录
```

#### 选项

| 选项 | 说明 |
| --- | --- |
| `--description <text>` | 写入 `package.json` 的 description（默认是通用占位） |
| `--force` | 目标 `packages/<name>/` 已存在时允许覆盖 |
| `--yes` | 非交互模式（name 必须作为 CLI 参数传入） |

#### 产物

在 `packages/<name>/` 下生成 **7 个文件**：

```text title="scaffold 产物"
packages/my-lib/
├── package.json         # ESM + tsup scripts + files 白名单 + publishConfig.access=public
├── tsconfig.json        # extends <scope>/tsconfig/library.json + ignoreDeprecations:"6.0"
├── tsup.config.ts       # ESM-only + dts + target node18
├── src/
│   └── index.ts         # 起步导出：helloXxx() + xxxVersion
├── README.md            # 安装 / 用法 / 文档链接
├── README.zh-CN.md      # 中文版
└── LICENSE              # MIT
```

#### 故意**不**生成的文件

| 文件 | 原因 |
| --- | --- |
| `CHANGELOG.md` | 由 Changesets 管理。模板里先写会让 `changeset version` 把它当成过期 changelog 处理。 |
| `tests/` | 保持起步最小化。用到 Vitest/Jest 时再 `pnpm -C packages/<name> add -D vitest` 添加。 |
| 独立的 `CI yaml` | CI 统一跑 `pnpm --filter './packages/*' build`，不需要按包切分。 |

#### 关键设计

- **Monorepo 根检测**：命令会从 cwd 往上找 `pnpm-workspace.yaml` + `packages/`
  目录。**不在 monorepo 里**直接打印友好提示（建议改用 `add module` / `create`），
  不会误写破坏性文件。
- **npm scope 自动推导**：读根 `package.json#name`：
  - `@lhx-kit/root` → 新包叫 `@lhx-kit/<name>`
  - `@acme/root`   → 新包叫 `@acme/<name>`（fork 友好，无需 CLI flag）
  - 非 scoped 包 → 回退到默认的 `@lhx-kit`

#### 生成后必做的 4 步

CLI 末尾会打印这个 "next steps" 块——按顺序执行：

```bash
# 1. 让 pnpm 识别新 workspace
pnpm install

# 2. 验证构建管线
cd packages/<name> && pnpm build
ls dist/            # 期望: index.js + index.d.ts

# 3. 声明意图（发布前必做）
pnpm changeset
# 选 <name> → patch/minor/major → 写清楚 summary
git add .changeset/
git commit -m "feat(<name>): initial scaffold"

# 4. 一次性：在 npmjs.com 给新包配 Trusted Publisher
#    https://www.npmjs.com/package/<scope>/<name>/access
#    填 GitHub Actions / juwenzhang / <repo> / release.yaml / (环境留空)
```

完整的发布逻辑见 [🚀 发布流水线](../engineering/release-pipeline)。

#### 异常处理示例

**不在 monorepo 根目录**：

```bash
$ cd /tmp/some-regular-project
$ lhx-cli add package my-lib
⚠ add package: not running inside a pnpm monorepo.
ℹ Detected missing `pnpm-workspace.yaml` or `packages/` up from cwd.

ℹ This command scaffolds a workspace under packages/<name>/. You probably want:
ℹ   • For a single-app project:        lhx-cli add module <name>
ℹ   • For a brand-new project:         lhx-cli create <name>
ℹ   • If you DO want a monorepo here:  cd into its root first, then retry.
```

**目录已存在**：

```bash
$ lhx-cli add package existing-lib
Error: packages/existing-lib already exists. Pass --force to overwrite.
```

**name 不是 kebab-case**：

```bash
$ lhx-cli add package MyLib
Error: Package name "MyLib" must be lowercase kebab-case (e.g. "my-pkg").
```

#### 验证安装后的产物正确

```bash
# dry-run 看发布 tarball 会包含哪些文件
cd packages/my-lib
npm pack --dry-run
# 期望输出恰好 7 个文件：
#   package.json / tsconfig.json / dist/index.{js,d.ts}
#   + README.md / README.zh-CN.md / LICENSE
# 多出任何其他文件 = files 白名单配置有漏
```

---

## 四、🧪 dev {#dev}

```bash
lhx-cli dev                    # 全量页面
lhx-cli dev --page home        # 只激活 home 页
```

:::info `--page` 的用途
减少 dev server 启动时间：只编译指定的 pages 入口。

大项目（10+ pages）冷启动能从 15s 降到 3s。
:::

**内部**：`jiti` 加载 project.config.ts → 组装 Vite UserConfig → `vite dev`。

---

## 五、🏗️ build {#build}

```bash
lhx-cli build
lhx-cli build --page home,settings       # 仅构建选中页
lhx-cli build --offline                  # 等同 lhx-cli offline build
lhx-cli build --hybrid-type=test         # offline 场景下指定版本
```

### 输出结构

```text
dist/
├── home/index.html + home/assets/*
├── settings/...
└── shared/assets/*
```

per-page chunk 分配策略详见 [⚡ 性能优化](../guide/performance)。

---

## 六、📊 info {#info}

```bash
lhx-cli info
```

输出示例：

```text title="控制台输出"
Project:    rmpa
Framework:  react
Pages:      home, settings, dashboard
Aliases:    @stores, @services, @mocks
Envs:       dev, prod
Offline:    enabled (whitelist: home)
CDN:        disabled
```

---

## 七、🩺 doctor {#doctor}

```bash
lhx-cli doctor
```

### 检查项

| 类别 | 检查项 |
| --- | --- |
| 🟢 Node 环境 | 版本 >= 18.18 |
| 🟢 包管理器 | pnpm 版本 >= 9 |
| 🟢 配置语法 | `project.config.ts` 能被 zod schema 通过 |
| 🟢 文件存在性 | page entry 存在、alias target 存在 |
| 🟢 prefetch 规则 | apiUrl 里的 `${var}` 必须在 keys 里 |
| 🟢 offline 配置 | `offline.config.ts`（如启用）字段合法 |
| 🟢 依赖完整 | 必要 devDependencies 是否安装（vite / @lhx-kit/vite-plugin） |

:::tip doctor 输出带 error code
失败时给出 **error code + 修复建议**（不是只说"失败"）。示例：

```text
❌ LHX_E001: page "profile" 在 project.config.ts 声明但 src/pages/profile/entry.tsx 不存在
   修复：
     1. 运行 lhx-cli add page profile 生成文件
     2. 或从 project.config.ts 删除 profile 字段
```
:::

---

## 八、📦 offline {#offline}

```bash
lhx-cli offline build --hybrid-type=test   # 完整流程
lhx-cli offline manifest                    # 只生成 manifest.json
lhx-cli offline inspect dist-offline        # 校验已有离线包
lhx-cli offline diff old.zip new.zip        # 对比（规划中）
```

详见 [📦 离线打包](../offline/overview)。

---

## 九、🧠 skills {#skills}

把 [`@lhx-kit/skills`](https://www.npmjs.com/package/@lhx-kit/skills) 里
**agent-agnostic** 的 8 个知识模块一键安装到你当前用的 AI 编程助手
（Cursor / CodeBuddy / Claude Code / 纯 Markdown）。

```bash
lhx-cli skills [action] [...names] [options]
```

### 9.1 子命令

| 子命令 | 作用 |
| --- | --- |
| `list` | 列出所有内置 skill（name / title / tags / triggers） |
| `add <name...>` | 把指定 skill 安装到一个或多个目标 adapter 目录 |
| `sync` | 用当前 skills 包的最新版本覆盖磁盘上所有已安装 skill |

### 9.2 常用选项

```bash
--targets <list>   逗号分隔：codebuddy,cursor,claude,plain （默认: plain）
--all              选择全部内置 skill
--force            覆盖磁盘上同名文件
--yes              非交互模式
```

### 9.3 实操示例

```bash
# 看看有哪些 skill
lhx-cli skills list

# 把 CDN 配置 skill 同时装到 Cursor 和 CodeBuddy
lhx-cli skills add configure-cdn --targets=cursor,codebuddy

# 一次性把所有 skill 装到 Cursor
lhx-cli skills add --all --targets=cursor

# 升级一轮（重新生成 .cursor/rules/ 下的 mdc 文件等）
lhx-cli skills sync --targets=cursor,codebuddy
```

产物举例（以 `--targets=cursor` 为例）：

```text
.cursor/
└── rules/
    ├── add-page.mdc
    ├── configure-cdn.mdc
    ├── create-package.mdc
    ├── offline-packaging.mdc
    └── ...
```

### 9.4 内置的 8 个 skill

| Skill | 类型 | 对应 CLI 命令（若有） |
| --- | --- | --- |
| `add-page` | 行为型 | `lhx-cli add page <name>` |
| `offline-packaging` | 行为型 | `lhx-cli offline build` |
| `create-package` | 行为型 | `lhx-cli add package <name>` |
| `configure-cdn` | 知识型（部分行为型） | — |
| `chunk-optimization` | 知识型 | — |
| `mobile-adaptation` | 知识型 | — |
| `renderer-schema` | 知识型 | — |
| `troubleshooting` | 知识型 | — |
| `lhx-project-overview` | 元信息 | — |

### 9.5 skill 清单字段（`skill.json`）

开发者自己写 skill 时需要填的字段：

```json title="skills/<name>/skill.json"
{
  "name": "add-page",
  "title": "Add a Page",
  "description": "<=400 chars. 人类和 LLM 都用这段判断要不要激活这个 skill。",
  "version": "0.1.0",
  "tags": ["page", "routing"],
  "triggers": ["add a page", "new page", "create a page"],
  "globs": ["project.config.ts", "src/pages/**"],
  "alwaysApply": false,
  "command": "lhx-cli add page <name> [--title=<text>] [--offline]",
  "references": [
    { "title": "Getting started", "url": "https://juwenzhang.github.io/lhx-kit/guide/getting-started" }
  ]
}
```

#### `command` 字段（0.0.4+ 新增）

可选字段，**把 skill 和 CLI 命令正式绑定起来**。规则：

- **行为型 skill**：必须填。填完之后 AI agent 读到这条 skill 时就知道
  "比起改代码，应该跑这个命令"。例：`add-page` / `offline-packaging` /
  `create-package`。
- **知识型 skill**：留空。比如 `troubleshooting` / `mobile-adaptation`
  本质是解释概念，没有对应 CLI 命令。

AI agent 看到 `command` 字段时的期望行为：

1. **优先推荐 CLI**（而不是鼓励用户手动改代码）；
2. **把 CLI 输出回显给用户**，让 CLI 的"next steps"引导后续操作；
3. 只有用户明确拒绝用 CLI，或 CLI 不可用，才退回手动模式。

### 9.6 常见问答

:::info 我的仓库没装 lhx-cli，能用 skill 吗？
可以。每个 skill 都包含"Manual Alternative"章节 —— 没装 CLI 时按手动流程走。
但强烈建议装上 CLI，行为型 skill 的 AST 级修改手动做会出错。
:::

:::info skill 会被自动更新吗？
不会自动。`pnpm add -D @lhx-kit/skills@latest` 升包，然后
`lhx-cli skills sync` 再走一次 adapter 渲染才会覆盖磁盘文件。
有意识地"刷新"，避免惊喜变更。
:::

:::tip 自己写 skill
fork 一下 `packages/skills/skills/add-page/`，改 `skill.json` + `SKILL.md`，
`pnpm --filter @lhx-kit/skills build`，然后 `lhx-cli skills list` 就能看到
你的 skill 了。发给上游可以合并到内置集里。
:::

---

## 十、⬆️ upgrade {#upgrade}

占位命令，规划中。将来会做：

- 🔍 检查 `package.json` 里 `@lhx-kit/*` 的版本
- 🔄 如有 breaking change，自动改 migration
- 📝 提示手动操作事项

---

## 十一、📦 CLI 自身依赖

| 依赖 | 用途 |
| --- | --- |
| `cac` | 子命令路由 + argv 解析 |
| `prompts` | 交互式问答 |
| `kolorist` | 终端着色（`c.green('ok')` / `c.red('x')`） |
| `execa` | 跨平台执行 `pnpm install` / `git init` |
| `fs-extra` | 便利的 fs API |
| `giget` | （备用）从 GitHub / tarball 拉模板，目前未用 |
| `jiti` | 加载用户的 `project.config.ts` |
| `ts-morph` | AST 级修改 `project.config.ts` |
| `@lhx-kit/config` | 加载并校验用户配置 |
| `@lhx-kit/offline` | offline 子命令的实现 |

:::info 为什么选 cac 不选 commander / yargs
| 对比 | cac | commander | yargs |
| --- | --- | --- | --- |
| 打包体积 | 🟢 15KB | 🟡 50KB | 🔴 120KB |
| TS 支持 | 🟢 原生 | 🟡 社区 | 🟡 社区 |
| 链式 API | 🟢 | 🟢 | 🟡 |
| 默认帮助文本 | 🟢 简洁 | 🟢 丰富 | 🟡 啰嗦 |

选 cac 因为**体积最小**且默认提示风格符合现代 CLI 审美。
:::

---

## 十一、🎯 bin.ts 入口

```ts title="packages/cli/src/bin.ts"
#!/usr/bin/env node
import {cli} from './index';
cli(process.argv.slice(2));
```

```json title="packages/cli/package.json"
{
  "bin": {
    "lhx-cli": "./dist/bin.js"
  }
}
```

`pnpm install` 时在 `node_modules/.bin/` 里建符号链接，所以全局命令和项目本地命令都能调用。

---

## 十三、📖 相关资源

- [🚀 快速开始](../guide/getting-started) — create / add page 实战
- [📦 离线打包](../offline/overview) — offline 子命令完整说明
- [🧱 模板目录](../templates/catalogue) — 可用模板清单
