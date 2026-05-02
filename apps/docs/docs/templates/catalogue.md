# 🧱 模板目录

lhx-cli 目前内置两套模板。两者的基础设施**完全对称**（ESLint / Prettier / Husky / Commitlint / Vitest / Playwright / MSW / Docker / CI）——差异仅在 UI 框架和组件库。

---

## 一、📋 可用模板

| 名称 | 框架 | 状态管理 | UI 组件库 | 路由 | 模板大小 | 适用场景 |
| --- | --- | --- | --- | --- | --- | --- |
| 🟢 `vue3-mpa` | Vue 3.5 | Pinia | Vant 4 | vue-router 4 | 35 文件 | 移动端 H5 / 运营落地页 |
| 🔵 `react-mpa` | React 19 | Zustand 5 | Ant Design 5 | react-router 6 | 33 文件 | 管理后台 / 桌面 Web |

---

## 二、🚀 生成一个模板

:::code-group

```bash [交互式]
lhx-cli create my-app
```

```bash [非交互式]
lhx-cli create my-app \
  --template=react-mpa \
  --features=offline,mock,e2e \
  --yes
```

:::

---

## 三、📂 模板结构详解

```text title="packages/cli/templates/react-mpa/"
react-mpa/
├── template.json            # 元数据
├── files/                   # 基础文件（所有人都会得到）
│   ├── package.json.template
│   ├── project.config.ts.template
│   ├── vite.config.ts.template
│   ├── template.html.template
│   ├── tsconfig.json.template
│   ├── eslint.config.js.template
│   ├── commitlint.config.cjs.template
│   ├── lint-staged.config.cjs.template
│   ├── playwright.config.ts.template
│   ├── vitest.config.ts.template
│   ├── Dockerfile.template
│   ├── README.md.template
│   └── src/
│       ├── bootstrap.ts.template
│       ├── pages/home/
│       │   ├── entry.tsx.template
│       │   ├── router.tsx.template
│       │   ├── render.json.template
│       │   └── views/
│       │       ├── HomeLanding.tsx.template
│       │       └── HomeAbout.tsx.template
│       ├── components/
│       ├── stores/
│       ├── services/
│       ├── mocks/
│       └── __tests__/
└── features/                # 按需追加的文件
    └── offline/
        └── offline.config.ts.template
```

### `template.json`

```json title="packages/cli/templates/react-mpa/template.json"
{
  "name": "react-mpa",
  "title": "React 19 Multi-Page (MPA)",
  "description": "A React 19 + Vite multi-page application...",
  "framework": "react",
  "projectType": "admin",
  "tags": ["react", "react19", "vite", "mpa", "renderer"],
  "features": [
    {
      "name": "offline",
      "title": "Offline packaging",
      "defaultEnabled": false
    }
  ],
  "postCreate": [
    "cd <%= projectName %>",
    "pnpm dev",
    "lhx-cli add page dashboard --title='Dashboard'"
  ]
}
```

---

## 四、🔧 占位替换算法

所有 `*.template` 文件在拷贝时被替换占位符。

### 支持的语法

```text title="支持的占位语法"
<%= projectName %>        # EJS-ish 风格
{{ projectName }}         # Mustache-ish 风格
```

### 可用变量

| 变量 | 来源 |
| --- | --- |
| `projectName` | 命令行第一个参数 / 交互回答 |
| `framework` | 模板 metadata |
| `packageManager` | `--pm` 或默认 pnpm |
| `useOffline` | 是否勾选 offline feature |
| `useMock` | 是否勾选 mock feature |
| `useE2e` | 是否勾选 e2e feature |
| `useCdn` | 是否勾选 cdn feature |

### 🔬 为什么不用完整模板引擎

:::details 权衡过程
| 方案 | 问题 |
| --- | --- |
| `lodash.template` | +50KB 依赖，绝大部分功能用不上 |
| `handlebars` | +100KB 依赖，helper 系统复杂 |
| `ejs` | +30KB 依赖，但语法需要学 |
| **纯 regex 替换** ✅ | 零依赖，语法直观 |

我们的模板里没有循环、没有条件分支——完整模板引擎是过度设计。

纯字符串 regex 替换足够：

```ts title="实现示意"
function interpolate(content: string, vars: Record<string, string>): string {
  return content
    .replace(/<%=\s*(\w+)\s*%>/g, (_, k) => vars[k] ?? '')
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? '');
}
```
:::

---

## 五、🧬 AST 级配置合并

拷贝完成后，`ts-morph` 再次读取 `project.config.ts`，根据勾选的 features 在 `defineProjectConfig({ ... })` 里插入对应字段。

:::info 为什么要走 AST
**同一个模板**能生成多种组合而不需要维护 N 份 config 文件。

- 模板只保留**基础** `project.config.ts`
- CLI 按用户勾选动态追加字段
:::

示例：

```ts title="用户勾选 offline + cdn 后的 project.config.ts"
export default defineProjectConfig({
  name: 'my-app',
  framework: 'react',
  pages: { home: {title: 'Home'} },

  // AST 级追加（因为勾了 offline）
  offline: {enabled: true},

  // AST 级追加（因为勾了 cdn）
  cdn: {
    enabled: true,
    entries: [/* 占位 */]
  }
});
```

---

## 六、🎁 预置能力矩阵

两套模板都预置下列能力，**开箱即用**。

### 6.1 代码质量

| 工具 | 用途 |
| --- | --- |
| 🎨 **ESLint** | flat config，接入 `@typescript-eslint`、`eslint-plugin-react` 或 `eslint-plugin-vue` |
| 🪄 **Prettier** | 与 ESLint 通过 `eslint-config-prettier` 解冲突 |
| 🐕 **Husky** + **lint-staged** | `git commit` 前跑 `eslint --fix` + `prettier --write` |
| 📝 **commitlint** | Conventional Commits 规范（`feat:` / `fix:` / `chore:` ...） |

### 6.2 测试

| 工具 | 用途 |
| --- | --- |
| 🧪 **Vitest** | 单元测试 + 覆盖率；`jsdom` 环境 |
| 🎭 **Playwright** | E2E；`pnpm e2e:install` 装浏览器，`pnpm e2e` 跑 |

### 6.3 Mock

- **MSW**：开发环境注册 Service Worker 拦截 fetch/XHR
- 配置在 `src/mocks/handlers.ts`，`bootstrap.ts` 里按 `import.meta.env.DEV` 条件启用
- `offline.config.ts` 的 `excludeFilenames` 默认含 `mockServiceWorker.js`，离线打包时自动排除

### 6.4 CI / Deployment

- 🐳 **Dockerfile**：多阶段构建（node 构建 → nginx 产出）
- ⚙️ **GitHub Actions** 示例（包含 lint + build + test + e2e）

### 6.5 可选 Features

| Feature | 效果 |
| --- | --- |
| `offline` | 添加 `offline.config.ts` + `offline:build` npm script |
| `cdn` | 在 `project.config.ts` 里生成 CDN entries 占位 |
| `e2e` | 默认已有；关掉可以删除 playwright |
| `mock` | 默认已有；关掉可以删除 msw 依赖 |

---

## 七、🤔 为什么默认就给这么多

### 7.1 权衡

:::details 优势 vs 代价
**优势**：
- ✅ 新项目第一天就有 lint / test / commit 规范 / CI
- ✅ 避免 3 个月后再补时破坏现有代码

**代价**：
- 🟡 `pnpm install` 时间略长（约 30 秒 vs 15 秒）
- 🟡 node_modules 大约 300MB vs 180MB
:::

### 7.2 最终选择

**给全家桶**。理由：

1. 这些工具长期稳定，不会频繁 breaking change
2. 有了脚手架就"**不该**靠开发者自觉去补基础设施"——团队里总有时间紧张的时候
3. 想删某个能力比想加某个能力简单——`pnpm remove` 一个包即可

---

## 八、🚫 不包含的能力（刻意）

:::warning 下面这些我们不默认给
- **CSS 预处理器**：没有默认 Sass / Less / PostCSS-ish 配置
  - `postcss-pxtorem` 是 H5 场景专用，vue3-mpa 模板给，react-mpa 不给
- **UI 框架无关的状态管理**：React 模板用 Zustand，Vue 用 Pinia
  - 和框架生态一致，不引入额外学习成本
- **分析 SDK / 埋点**：业务选型多样
  - 模板只提供 `@lhx-kit/runtime/logger` 抽象，具体 sink 用户自己实现
:::

---

## 九、🧩 扩展模板

想新增 `vue3-admin` / `react-mobile`？参考现有模板复制一份改：

```text title="packages/cli/templates/"
<新模板名>/
├── template.json
├── files/
│   └── ...
└── features/
    └── ...
```

然后在 `packages/cli/src/templates.ts` 的模板 registry 里加一行。

:::tip 不需要改 CLI 逻辑
templates 是**数据驱动**的。
:::

---

## 十、🔭 后续规划

| 模板 | 状态 |
| --- | --- |
| 🟢 `vue3-mpa` | ✅ 可用 |
| 🔵 `react-mpa` | ✅ 可用 |
| 🟢 `vue3-admin` | 🚧 规划中（Element Plus + Vue Router 4） |
| 🔵 `react-h5` | 🚧 规划中（React 19 + antd-mobile） |
| 🎯 `micro-frontend` | 🧪 实验（qiankun / Module Federation） |

---

## 十一、📖 相关资源

- [🚀 快速开始](../guide/getting-started) — 看 create 命令如何拉模板
- [⚙️ CLI 参考](../cli/reference#create) — create 命令完整参数
- [🧠 架构总览](../guide/architecture) — 模板在整个 kit 中的位置
