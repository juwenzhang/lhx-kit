# 🔄 迁移指南

本文说明如何把**已有项目**迁移到 lhx-kit 的 `project.config.ts` 体系，以及如何为现有前端项目启用 **offline 离线打包**和接入 **business-mono** 的全栈工作流。

---

## 一、前置条件

| 工具 | 最低版本 |
| --- | --- |
| Node.js | 20.0.0 |
| pnpm | 9.0.0 |
| TypeScript | 5.4.0 |
| Vite | 5.0.0 |

安装 lhx-kit 系列包（前端项目）：

```bash
pnpm add @lhx-kit/runtime @lhx-kit/renderer
pnpm add -D @lhx-kit/config @lhx-kit/tsconfig @lhx-kit/vite-plugin
```

---

## 二、从 vite.config.ts 迁移到 project.config.ts

### 2.1 为什么要迁移

原先 Vite 项目把所有配置（页面入口、proxy、alias、env 注入）都写在 `vite.config.ts` 中，导致：

- 多页配置（MPA）冗长且难维护
- `proxy` 和 `apiBase` 在 `vite.config.ts` 与代码里重复
- 离线打包、CDN 外挂等能力无法声明式配置

`project.config.ts` 是 lhx-kit 的**单一真实来源**，`@lhx-kit/vite-plugin` 读取它并自动生成 Vite 配置。

### 2.2 迁移步骤

**第一步：** 在项目根目录创建 `project.config.ts`：

```ts title="project.config.ts"
import {defineProjectConfig} from '@lhx-kit/config';

export default defineProjectConfig({
  name: 'my-app',
  framework: 'react', // 或 'vue'

  aliases: {
    '@stores': 'src/stores',
    '@services': 'src/services'
  },

  envs: {
    dev: {
      apiBase: '/api',
      proxy: {
        '/api': {target: 'http://localhost:3000', changeOrigin: true}
      }
    },
    prod: {apiBase: 'https://api.yourdomain.com'}
  },

  pages: {
    home: {title: 'My App - Home'},
    dashboard: {title: 'My App - Dashboard'}
  }
});
```

**第二步：** 精简 `vite.config.ts`，让 `lhxKit()` 插件接管：

```ts title="vite.config.ts"
import {defineConfig} from 'vite';
import {lhxKit} from '@lhx-kit/vite-plugin';
import react from '@vitejs/plugin-react'; // 或 @vitejs/plugin-vue

export default defineConfig({
  plugins: [lhxKit(), react()]
});
```

> 原先在 `vite.config.ts` 里写的 `server.proxy`、`resolve.alias`、`define` 现在都通过 `project.config.ts` 的 `envs.dev.proxy`、`aliases`、`envs.dev.define` 声明，删掉 `vite.config.ts` 里的重复项即可。

**第三步：** 将 `index.html` 改为 `template.html`，使用 lhx-kit 的 MPA 模板语法：

```html title="template.html"
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{ title }}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="{{ entry }}"></script>
  </body>
</html>
```

**第四步：** 更新 `package.json` 脚本：

```json title="package.json"
{
  "scripts": {
    "dev": "lhx-cli dev",
    "build": "lhx-cli build",
    "preview": "lhx-cli preview",
    "doctor": "lhx-cli doctor",
    "typecheck": "tsc --noEmit"
  }
}
```

**第五步：** 更新 `tsconfig.json`（继承 lhx-kit 预设）：

```json title="tsconfig.json"
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "@lhx-kit/tsconfig/app-react.json",
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@pages/*": ["./src/pages/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "src/env.d.ts", "project.config.ts"],
  "exclude": ["dist", "node_modules"]
}
```

**第六步：** 添加 `src/env.d.ts`（ambient types for lhx-kit）：

```ts title="src/env.d.ts"
/// <reference types="vite/client" />

declare module 'virtual:lhx-kit/project-config' {
  import type {SerializedProjectConfig} from '@lhx-kit/vite-plugin';
  const config: SerializedProjectConfig;
  export default config;
}

interface ImportMetaEnv {
  readonly LHX_API_BASE: string;
  readonly LHX_MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

---

## 三、为现有项目添加 Offline 离线打包

Offline 打包适用于把前端产物打包进原生 App（混合 WebView / H5 容器）的场景。

### 3.1 安装依赖

```bash
pnpm add -D @lhx-kit/offline
```

### 3.2 在 project.config.ts 启用

```ts title="project.config.ts" {8-10}
export default defineProjectConfig({
  name: 'my-app',
  framework: 'react',
  pages: {
    home: {title: 'Home'}
  },

  offline: {
    enabled: true
  }
});
```

### 3.3 创建 offline.config.ts

在项目根目录（与 `project.config.ts` 同级）新建：

```ts title="offline.config.ts"
import {defineOfflineConfig} from '@lhx-kit/offline';

export default defineOfflineConfig({
  // 打包输出目录（默认 dist-offline）
  outDir: 'dist-offline',

  // 要打包的页面列表（对应 project.config.ts pages 的 key）
  pages: ['home'],

  // 是否压缩为 zip（默认 true）
  compress: true,

  // zip 文件名（默认 offline.zip）
  zipName: 'offline.zip',

  // 排除 Service Worker 文件
  excludeFilenames: ['mockServiceWorker.js'],

  // 离线包版本号（注入到清单文件，用于原生 App 的差量更新判断）
  version: '1.0.0'
});
```

### 3.4 添加 npm scripts

```json title="package.json"
{
  "scripts": {
    "offline:build": "lhx-cli offline build --hybrid-type=prod",
    "offline:inspect": "lhx-cli offline inspect dist-offline"
  }
}
```

### 3.5 更新 .gitignore

```text title=".gitignore"
dist-offline
*.zip
```

### 3.6 构建离线包

```bash
pnpm build           # 先构建 web
pnpm offline:build   # 再打包成 zip
pnpm offline:inspect # 查看 zip 内容和清单
```

---

## 四、business-mono 中的 web 迁移

`business-mono` 的 `apps/web` 已使用 lhx-kit MPA 架构（自动脚手架），如需手动为现有 monorepo 迁移，步骤如下：

### 4.1 web 应用结构

```text
apps/web/
├── project.config.ts         # lhx-kit 单一配置（代理到 apps/api）
├── vite.config.ts            # 只保留 lhxKit() + react/vue plugin
├── template.html             # MPA HTML 模板
├── tsconfig.json             # extends @lhx-kit/tsconfig/app-react.json
├── package.json              # lhx-cli 脚本 + @lhx-kit/* 依赖
└── src/
    ├── bootstrap.ts          # MSW dev mock 启动 + setupMobile
    ├── env.d.ts
    ├── pages/home/
    │   ├── entry.tsx
    │   ├── router.tsx
    │   └── views/
    ├── services/             # http.ts（createRequest） + API 层
    ├── stores/               # Zustand stores
    └── mocks/                # MSW handlers
```

### 4.2 添加 Offline 到 business-mono

1. 在 `apps/web/` 安装 `@lhx-kit/offline`：

```bash
cd apps/web && pnpm add -D @lhx-kit/offline
```

2. 取消 `apps/web/project.config.ts` 中的注释：

```ts
offline: {enabled: true}
```

3. 在 `apps/web/` 新建 `offline.config.ts`（内容参考上文 §3.3）

4. 在 `apps/web/package.json` 添加 scripts：

```json
{
  "scripts": {
    "offline:build": "lhx-cli offline build --hybrid-type=prod",
    "offline:inspect": "lhx-cli offline inspect dist-offline"
  }
}
```

5. 在根 `turbo.json` 注册新任务（可选）：

```json
{
  "tasks": {
    "offline:build": {
      "dependsOn": ["build"],
      "outputs": ["dist-offline/**"]
    }
  }
}
```

---

## 五、从 ESLint / Prettier 迁移到 Biome

lhx-kit 模板采用 **Biome-only** 栈（零 ESLint、零 Prettier）。

### 5.1 删除旧工具

```bash
pnpm remove eslint prettier eslint-config-prettier @typescript-eslint/parser \
  @typescript-eslint/eslint-plugin eslint-plugin-react eslint-plugin-vue
rm eslint.config.js .eslintrc.* .prettierrc* .prettierignore
```

### 5.2 安装 Biome

```bash
pnpm add -D @biomejs/biome
```

### 5.3 创建 biome.json

```json title="biome.json"
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {"recommended": true}
  },
  "organizeImports": {"enabled": true},
  "files": {"ignore": ["dist", "dist-offline", "node_modules"]}
}
```

### 5.4 更新 lint-staged.config.cjs

```js title="lint-staged.config.cjs"
module.exports = {
  '*.{ts,tsx,js,jsx,json,css}': ['biome check --write --no-errors-on-unmatched']
};
```

### 5.5 更新 package.json scripts

```json
{
  "scripts": {
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "format": "biome format --write ."
  }
}
```

---

## 六、Changeset 工作流（monorepo 必须）

对 `packages/*` 下的任何改动，都需要在提交前补写 changeset：

```bash
pnpm changeset        # 交互式选择受影响包和版本类型
pnpm changeset status # 查看待发布的变更集
pnpm changeset version # （CI）合并所有 changeset，更新 CHANGELOG
pnpm changeset publish # （CI）发布到 npm
```

> 没有 changeset 的包改动**不会触发**发布流水线。

---

## 七、常见问题

### `lhx-cli dev` 找不到页面入口

确认 `src/pages/<name>/entry.tsx` 存在，且 `project.config.ts` 的 `pages.<name>` 已声明。

### `import.meta.env.LHX_API_BASE` 为 undefined

确认 `src/env.d.ts` 已创建，且 `vite.config.ts` 中使用了 `lhxKit()` 插件。

### Biome 报错但 ESLint 不报

Biome 的规则与 `@typescript-eslint` 存在部分差异。常见调整：

- 关闭 `noExplicitAny`（如果项目尚未完成 any 清理）：在 `biome.json` 的 `linter.rules.suspicious` 中设置 `"noExplicitAny": "off"`
- Biome 对未使用变量的规则 (`noUnusedVariables`) 默认开启，删除或加前缀 `_`

### TypeScript 路径别名不生效

确认 `tsconfig.json` 的 `compilerOptions.paths` 和 `vite.config.ts` / `project.config.ts` 的 `aliases` 保持一致。
