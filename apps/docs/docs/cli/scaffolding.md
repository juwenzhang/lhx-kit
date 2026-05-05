# 🪄 lhx-cli create · 脚手架使用

`lhx-cli create` 是 lhx-kit 的入口命令。从 2026-05 Phase 1 起，它支持**交互式向导**、**混合模式**（命令行 + 提示）、**全旗标 CI 模式**和**双语扫尾提示**。

## 三种使用方式

### 1. 交互式（推荐 · 新手 / 多选项时）

```bash
lhx-cli create
# 或带项目名：
lhx-cli create my-app
```

CLI 进入向导，按 10 步顺序询问：

```
[1/N]  📁  Project name?                          (default: my-app)
[2/N]  📦  Pick a template:                       vue3-mpa | react-mpa | …
[3/N]  📱  (frontend) Target:                     hybrid（默认）/ pc / mobile
[4/N]  🎨  CSS preprocessor:                      less（默认）/ sass / none
[5/N]  🎨  CSS atomic:                            unocss（默认）/ tailwind / none
[6/N]  🎨  Component styling:                     modules（默认）/ emotion / styled / vanilla-extract / vue-scoped / none
[7/N]  ⚙️  Optional features:                     offline / codebuddy-skills（多选）
[8/N]  📦  Package manager:                       pnpm（默认）/ npm / yarn / bun
[9/N]  📋  Summary                                显示总览 → 确认或返回修改
```

**关键行为：**

- **类型即过滤**：列表 >5 项时支持 type-to-filter（例：键入 `el` → 只剩 `element-plus`）
- **兼容性收窄**：选了 `vue3-mpa + target=mobile` 后，UI 列表自动隐藏 `element-plus`（PC-only）
- **分支跳过**：选 `express` 等后端模板时，CSS 三轴提示直接跳过
- **取消即清场**：任何步骤按 `ESC` → 二次确认 → 不写入任何文件

### 2. 混合模式（命令行 + 向导）

供给已知字段，剩下的让向导提示：

```bash
lhx-cli create my-app -t vue3-mpa --ui=element-plus
# 项目名、模板、UI 已知 → 向导从「target?」开始
```

### 3. 全旗标 CI 模式（`--yes`）

```bash
lhx-cli create my-app -t vue3-mpa --yes \
  --target=hybrid \
  --css-preprocessor=less --css-atomic=unocss --css-styling=modules \
  --features=offline,codebuddy-skills
```

不显示任何提示。未指定的字段使用 [文档化的默认值](#默认值)。

## 旗标参考

| 旗标 | 适用 | 默认 | 说明 |
| --- | --- | --- | --- |
| `-t, --template` | 全部 | 提示 | 内置名 / 本地路径 / `gh:user/repo#ref` |
| `--target <pc\|mobile\|hybrid>` | 前端 | `hybrid` | 互斥组 `target`，hybrid 自动开启 offline |
| `--css-preprocessor <less\|sass\|none>` | 前端 | `less` | |
| `--css-atomic <unocss\|tailwind\|none>` | 前端 | `unocss` | |
| `--css-styling <modules\|emotion\|styled\|vanilla-extract\|vue-scoped\|none>` | 前端 | `modules` | React-only / Vue-only 错配会失败 |
| `--features <list>` | 全部 | `[]` | CSV，例：`offline,codebuddy-skills` |
| `--package-manager <pnpm\|npm\|yarn\|bun>` | 全部 | `pnpm` | |
| `--lhx-version <auto\|local\|range>` | 全部 | `auto` | `auto` 跑 `npm view`；`local` 用 CLI 自身版本；其余视为 literal pin |
| `--link-workspace` | monorepo | off | 把 `@lhx-kit/*` 重写为 `workspace:*` |
| `--skip-install` | 全部 | off | 不自动 `pnpm install` |
| `--skip-git` | 全部 | off | 不 `git init` |
| `--force` | 全部 | off | 目标目录非空时也覆盖 |
| `--yes` | 全部 | off | 跳过所有提示 |

## 动态版本解析（`--lhx-version`）

当**不**带 `--link-workspace` 时，CLI 会逐个查询 `@lhx-kit/*` 包的最新发布版：

```text
› @lhx-kit/* version range: ^1.0.0 (npm view @lhx-kit/cli → 1.0.1)
›   @lhx-kit/renderer → ^1.0.0
›   @lhx-kit/runtime → ^1.0.0
›   @lhx-kit/config → ^1.0.0
›   @lhx-kit/vite-plugin → ^1.0.0
```

- **`auto`（默认）**：每个 `@lhx-kit/*` 依赖独立跑 `npm view <pkg> version`，写 caret-minor。进程内缓存确保 8 个包不会跑 8 次网络。
- **`local`**：跳过网络，使用 CLI 自身的版本范围（`@lhx-kit/cli/package.json` 版本）。
- **explicit**：传一个具体版本范围，例 `--lhx-version=^0.5.0`，所有 `@lhx-kit/*` 都用这个值。

任意单个 `npm view` 失败时**不会中断脚手架** — 自动回落到 `local` 范围并以 `⚠` 警示。

## 扫尾提示（双语）

每次成功脚手架后，CLI 都会打印：

```
✅  Done

📂  Project created at  /  项目已创建:
    ./my-app

🚀  Next steps  /  下一步:
    cd ./my-app
    pnpm install
    pnpm dev

📚  Docs  /  文档:
    https://juwenzhang.github.io/lhx-kit/index.html

💬  Issues & PRs  /  提交问题或贡献代码:
    https://github.com/juwenzhang/lhx-kit/issues

Happy hacking!  /  祝你编码愉快 🎉
```

**契约**（Phase 1 锁定，详见 [openspec/changes/expand-cli-template-ecosystem/design.md §3.9](https://github.com/juwenzhang/lhx-kit)）：

- URL 是用户面契约 — 修改需要 major bump
- 双语：zh + en，意译而非直译
- 单行最多一个 emoji
- **没有遥测** — 不会发任何网络请求收集使用数据
- **没有版本检查 ping** — 脚手架不会在结尾敲打"是否升级 CLI"

## 默认值（`--yes` 模式）

| 字段 | 默认 |
| --- | --- |
| 项目名 | 必传，否则 exit 2 |
| 模板 | `templates[0].name`（按字母序，目前 `react-mpa`） |
| `target` | `hybrid` |
| CSS preprocessor | `less` |
| CSS atomic | `unocss` |
| CSS styling | `modules` |
| 包管理器 | `pnpm` |
| `@lhx-kit/*` 版本 | `auto`（npm view） |

## 失败模式

| 场景 | 行为 |
| --- | --- |
| 模板不存在 | exit 2 + 列出可用模板 |
| 旗标与模板兼容性冲突（例：`vue3-mpa --css-styling=emotion`） | exit 2 + 提示「emotion 仅 React」 |
| 旗标互斥（例：`--target=pc --features=target-mobile`） | exit 2 |
| `npm view` 全部失败 | 警示并落回 `local` 范围，**继续脚手架** |
| 写文件中途失败 | 打印「Scaffold interrupted」+ 已写文件数 + rollback hint + issues 链接 |

## 进一步阅读

- [模板目录](/templates/catalogue) — 内置模板矩阵
- [Changeset 使用手册](/engineering/changeset-handbook) — 修改 packages/* 后必须配 changeset
- [Biome 取代 ESLint](/engineering/typescript-no-any) — 模板栈 2026-05 切换说明
