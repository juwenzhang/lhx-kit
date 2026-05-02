# ⚙️ CLI 参考

`lhx-cli` 是 monorepo 的统一入口，覆盖**脚手架 / 增量添加 / 开发构建 / 离线打包 / 诊断**五类能力。

---

## 一、📋 命令总览

| 命令 | 用途 |
| --- | --- |
| [`create`](#create) | 🚀 创建新项目 |
| [`add`](#add) | ➕ 往项目里加 page / component / api / module |
| [`dev`](#dev) | 🧪 启动开发服务器 |
| [`build`](#build) | 🏗️ 生产构建 |
| [`info`](#info) | 📊 打印当前项目的配置摘要 |
| [`doctor`](#doctor) | 🩺 环境 + 项目诊断 |
| [`offline`](#offline) | 📦 离线包相关子命令 |
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

## 九、⬆️ upgrade {#upgrade}

占位命令，规划中。将来会做：

- 🔍 检查 `package.json` 里 `@lhx-kit/*` 的版本
- 🔄 如有 breaking change，自动改 migration
- 📝 提示手动操作事项

---

## 十、📦 CLI 自身依赖

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

## 十二、📖 相关资源

- [🚀 快速开始](../guide/getting-started) — create / add page 实战
- [📦 离线打包](../offline/overview) — offline 子命令完整说明
- [🧱 模板目录](../templates/catalogue) — 可用模板清单
