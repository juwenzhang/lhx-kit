# @lhx-kit/vite-plugin

> ⚡ Vite 插件，把 `project.config.ts` 翻译成生产级 MPA 构建管线。
> per-page 输出、家族分组 chunk、CDN import 改写、本地 vendor fallback、gzip + brotli 预压缩——全部开箱即用。

[![npm](https://img.shields.io/npm/v/@lhx-kit/vite-plugin?color=0c9)](https://www.npmjs.com/package/@lhx-kit/vite-plugin)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[English](./README.md)

---

## 安装

```bash
pnpm add -D @lhx-kit/vite-plugin
```

> peer 依赖：`vite ^5 || ^6 || ^7`。需要 Node.js `>= 18.18.0`。

## 使用

```ts title="vite.config.ts"
import {defineConfig} from 'vite';
import {lhxKit} from '@lhx-kit/vite-plugin';

export default defineConfig({
  plugins: [lhxKit()]
});
```

**就这一行**。插件读取项目根目录的 `project.config.ts`，自动配置：

- `build.rollupOptions.input` — 每个 `pages.<name>` 一个入口
- `resolve.alias` — 来自 `aliases` 字段
- `define` — 来自 `envs.<mode>`
- `manualChunks` — 家族分组 vendor chunk
- `output.experimentalMinChunkSize` — <10KB 的 chunk 自动合并

---

## 做了什么

### 🏗️ MPA 编排

```text
project.config.ts
    ↓ (config 钩子)
.lhx-kit/pages/home.html  ← 每个 page 的中间 HTML
.lhx-kit/pages/about.html
    ↓ (rollup)
    ↓ (generateBundle 钩子)
dist/
├── home/index.html
├── home/assets/…
├── about/index.html
├── about/assets/…
└── shared/assets/…         ← 被 2+ 个 page 共用的 chunk
```

### 🎯 Chunk 策略

两层叠加：

```ts
// 第 1 层：家族分组
{
  react: ['react', 'react-dom', 'scheduler'],
  'react-router': ['react-router', 'react-router-dom', 'remix-run-router'],
  vue: ['vue', 'vue-demi'],
  'vue-state': ['pinia', 'vue-router']
}

// 第 2 层：<10KB 自动合并
output.experimentalMinChunkSize = 10 * 1024
```

效果：默认 React MPA 从 13 → 10 个 chunk，全部 > 1 KB。

完整推导见 [性能优化](https://juwenzhang.github.io/lhx-kit/guide/performance)。

### 🌐 CDN 外挂（opt-in）

在 `project.config.ts` 声明：

```ts
cdn: {
  enabled: true,
  entries: [
    {
      name: 'vue',
      globalVar: 'Vue',
      urls: ['https://cdn.jsdelivr.net/npm/vue@3/dist/vue.global.prod.js']
    }
  ]
}
```

插件会：

1. **改写** `import {ref} from 'vue'` → `const {ref} = window.Vue`
2. **注入** classic `<script>` loader 到每个 HTML（ES5 IIFE，无 bundler 依赖）
3. **Emit** 本地 vendor fallback 到 `shared/vendor/vue.js`（CDN 全挂时加载）
4. **支持** `aliasGlobals` / `initScript`，便于框架替换（例如 Preact 替代 React）

完整踩坑记录：[CDN 外挂专题](https://juwenzhang.github.io/lhx-kit/guide/cdn)。

### 🗜️ 预压缩（默认开启）

每个大于 1 KB 的 `.js / .css / .html / .svg / .json` 都会产出：

- `foo.js.gz` — gzip level 9
- `foo.js.br` — brotli quality 11（最高）

nginx 配置 `gzip_static on; brotli_static on;` 直接服务这些文件。

### 🧹 生产环境合理默认值

```ts
target: 'es2018'                 // 现代输出，压缩更小
assetsInlineLimit: 8 * 1024      // 小资源内联成 data URI
cssCodeSplit: true               // per-chunk CSS
esbuild.drop: ['debugger']
esbuild.pure: ['console.log', 'console.debug', 'console.trace']
```

用户的 `vite.config.ts` 仍可覆盖这些。

---

## 插件钩子

| 钩子 | enforce | 职责 |
| --- | --- | --- |
| `config` | `pre` | 把 project.config.ts 翻译成 UserConfig |
| `resolveId` / `load` | – | `@lhx-kit/virtual:config` 虚拟模块 |
| `transform` | – | 改写 bare imports（CDN 启用时） |
| `generateBundle` | `post` | per-page 重组，注入 CDN loader |
| （compress 副插件） | `post` | emit `.gz` / `.br` 文件 |

完整源码见 [`src/plugin.ts`](./src/plugin.ts)。

---

## 选项

```ts
lhxKit({
  root?: string,              // 覆盖项目根目录
  mode?: string,              // 覆盖 env 模式
  pages?: string[],           // 显式 page 列表（通常通过 --page）
  intermediateDir?: string,   // 默认 '.lhx-kit/pages'
  outputLayout?: 'per-page' | 'flat',  // 默认 'per-page'
  sharedDir?: string,         // 默认 'shared'
  cleanUrls?: boolean,        // dev: /home → home.html，默认 true
  compress?: false | {threshold?, extensions?}  // 默认开启
})
```

---

## 依赖

| 依赖 | 用途 |
| --- | --- |
| `@lhx-kit/config` | 加载 project.config.ts |
| `@lhx-kit/runtime` | CDN loader 源码生成器 |
| `vite`（peer） | 宿主构建工具 |

**仅 2 个内部依赖**。无 lodash / glob / chokidar 膨胀。

---

## 文档

- ⚡ [Vite 插件实现详解](https://juwenzhang.github.io/lhx-kit/runtime/vite-plugin)
- 🧠 [性能决策](https://juwenzhang.github.io/lhx-kit/guide/performance)
- 🌐 [CDN 外挂](https://juwenzhang.github.io/lhx-kit/guide/cdn)

## License

[MIT](./LICENSE) © luhanxin
