# ❓ FAQ 常见问题

> 本章收录使用过程中**真实遇到**的问题以及解答。每个问题都标注了**问题等级**——按问题领域逐组呈现。

---

## 一、🏗️ 安装与环境

### Q1：pnpm install 报错 `ERR_PNPM_PEER_DEP_ISSUES`

:::details 展开答案
**现象**：

```text
ERR_PNPM_PEER_DEP_ISSUES  Unmet peer dependencies
  @lhx-kit/renderer
  ├─┬ peer react >= 18
  │ └── ✕ missing
```

**原因**：`@lhx-kit/renderer` 声明 React / Vue 为 peer dependency，**你的项目没装对应框架**。

**修复**：

```bash title="按你的模板选一个安装"
# React 模板
pnpm add react react-dom

# Vue 模板
pnpm add vue
```

模板默认已经装了，只有你是从裸项目集成时才会遇到这个问题。
:::

### Q2：Node 17 / 16 能不能跑

:::danger 不能
lhx-kit 依赖 Node 18.18+ 的特性：

- `jiti@2` 要求 `createRequire` 的现代 interop 语义
- `@lhx-kit/offline` 的 `fs-extra` 使用 `readdir {withFileTypes}`

Node 17 实测偶尔能跑，但偶发 crash；Node 16 完全不兼容。**请升级 Node**。
:::

### Q3：用 npm 不用 pnpm 可以吗

:::warning 不推荐
`pnpm-workspace.yaml` 的 `workspace:*` 协议是 pnpm 专属。

硬要用 npm：
1. 删除 `pnpm-workspace.yaml`
2. 把所有 `workspace:*` 改成文件系统路径或 npm 发包
3. 使用 npm workspaces (`package.json#workspaces` 字段)

这会**失去 pnpm 的硬链接 + 符号链接优势**，`node_modules` 体积会翻倍。
:::

---

## 二、🏗️ 构建与产物

### Q4：build 出来有个小 chunk 被合了，我能不能阻止它合

:::details 展开答案
`experimentalMinChunkSize: 10 * 1024` 是插件的默认值，目前**没有对外开关**。

如果你真的需要某个 chunk 不合并（比如做 A/B 测试想单独统计某个脚本大小）：

**方案 1**：用 `/* webpackChunkName */` hint（Rollup 也支持）

```ts
const Component = () => import(
  /* webpackChunkName: "my-special" */
  './Component'
);
```

即使合并，Rollup 也会把它命名成 `my-special`——但**可能**还是会被合。

**方案 2**：在 vite.config.ts 里覆盖

```ts title="vite.config.ts"
import {lhxKit} from '@lhx-kit/vite-plugin';

export default defineConfig({
  plugins: [lhxKit()],
  build: {
    rollupOptions: {
      output: {
        // 这会覆盖 lhx-kit 的默认值
        experimentalMinChunkSize: 0
      }
    }
  }
});
```

:::

### Q5：为什么 `vendor-react-*.js` 这么大（192KB）

参考 [⚡ 性能优化 §4](../guide/performance#四-react-dom-为什么不能再拆)。简答：

- ❌ 不能再拆
- ✅ 走 CDN 外挂是唯一有效优化（但 React 19 没 UMD，需要 Preact 替代方案）
- ✅ 预压缩 brotli 后只有 52KB，生产部署建议开 nginx `brotli_static on`

### Q6：build 很慢（>30s）是什么问题

:::details 展开答案
排查步骤：

```bash title="1. 看是否被第三方插件拖慢"
time pnpm build
```

```bash title="2. 对比关掉 lhx-kit 的情况"
# 临时注释掉 plugins: [lhxKit()]
time vite build
```

**常见原因**：

| 原因 | 修复 |
| --- | --- |
| `@vitejs/plugin-vue` / `@vitejs/plugin-react` 的 `.babel` 转换太慢 | 用 `plugin-react-swc` 替换 |
| 图片资源过大 | 调 `assetsInlineLimit` |
| TS 严格模式 + 大量 type-check | 开 `--skipLibCheck` |
| node_modules 几千个包 | 考虑 `optimizeDeps.include` 预构建 |
:::

---

## 三、📱 移动端适配

### Q7：rem 在桌面浏览器上字体超大

参考 [📱 移动端适配 §3.2](../guide/mobile-adaptation#32-为什么引入桌面居中)。简答：

```ts
setupMobile({
  maxWidth: 750   // ← 加这个
});
```

### Q8：Vant 组件显示尺寸不对

:::details 展开答案
**原因**：postcss-pxtorem 默认会转 **node_modules 里的 px**，把 Vant 内部坐标搞错。

**修复**：

```ts title="vite.config.ts"
pxtorem({
  rootValue: 75,
  exclude: /node_modules/i   // ← 关键
})
```

Vant 自己处理了 rem 转换，不需要插件重复做。
:::

### Q9：我的 `<h1>` 字体巨大

:::details 展开答案
**原因**：浏览器 UA 样式表的 `h1 { font-size: 2em }`，`em` 在 rem 适配下会爆炸。

**修复**：确保 `src/styles/reset.css` 里有：

```css
h1, h2, h3, h4, h5, h6 {
  font-size: inherit;
  font-weight: inherit;
}
```

详见 [📱 移动端适配 §7](../guide/mobile-adaptation#七-resetcss-必须要写)。
:::

---

## 四、🌐 CDN

### Q10：我的 React 项目开了 CDN 后浏览器报 `Failed to resolve module specifier 'react'`

参考 [🌐 CDN 外挂 §三](../guide/cdn#三-核心算法import-改写)。简答：

1. 你可能在 React 19 下尝试了 CDN 外挂——React 19 **没 UMD**
2. 关闭 CDN：`cdn.enabled = false`
3. 或者改走 Preact + compat 方案（完整 recipe 在 [§5.1](../guide/cdn#51-aliasglobals-的由来)）

### Q11：CDN 降级到本地 vendor 后打印很多 warning

:::details 展开答案
这是**正常**的降级过程：

```text
[LhxCdn] dep failed from https://cdn.jsdelivr.net/...
[LhxCdn] trying local fallback
[LhxCdn] local fallback ok (vue)
```

要静默：

```ts title="忽略 fallback 事件"
window.LhxCdn.on('fallback', () => {});  // 不做任何事
```

要监控但不打扰 console：

```ts
window.LhxCdn.on('fallback', ({name}) => {
  analytics.track('cdn.fallback', {pkg: name});
});
```
:::

---

## 五、📦 离线打包

### Q12：offline build 产出的 zip 里少了某个 page

:::details 展开答案
检查 `offline.config.ts` 的 `whitelistPages`：

```ts
export default defineOfflineConfig({
  whitelistPages: ['home']  // ← 只包含 home，其他 page 不进包
});
```

要让所有 page 都进：

```ts
// 方案 1：在 project.config.ts 里标记
pages: {
  home:     {title: 'Home', offline: true},
  settings: {title: 'Settings', offline: true}
}

// 方案 2：在 offline.config.ts 里枚举
whitelistPages: ['home', 'settings', 'dashboard']
```
:::

### Q13：离线包能不能跨版本兼容

:::danger 目前不能
`manifest.schemaVersion = '1.0.0'` 是锁死的。容器侧应该验证 `schemaVersion`，不同版本走不同解析逻辑。

**未来计划**：

- 1.x：在 1.0.0 内保持向后兼容（只添加 optional 字段）
- 2.0.0：breaking change，会在 Migration Guide 里明确说明
:::

---

## 六、🎨 Renderer

### Q14：schema 里能不能调函数？

:::details 展开答案
不能。see [🎨 Renderer §3.2](../renderer/overview#32-expression-沙盒化的路径求值)。

**替代方案**：把复杂逻辑放 state：

```ts title="❌ 错误：试图在 schema 里算"
{"props": {"total": {"$expr": "cart.items.reduce((a,b) => a+b.price, 0)"}}}

// ✅ 正确：在代码里预算好，放进 state
const total = cart.items.reduce((a, b) => a + b.price, 0);
createConfiguredPage({state: {total}});

// schema 里引用：
{"props": {"total": {"$": "state.total"}}}
```
:::

### Q15：远端 schema 拉取失败页面白屏

:::details 展开答案
`fetchRemoteSchema` 失败时返回 `options.schema`（本地 fallback）。确保传了：

```ts
createConfiguredPage({
  schema: localSchema,        // ← fallback
  remote: {url: '...'},
  onDiagnostic: (d) => console.warn('[schema]', d)  // ← 看错误
});
```

白屏通常是因为**没传 schema 参数**。
:::

---

## 七、🧪 开发流程

### Q16：修改 `@lhx-kit/config` 源码后 examples 没反应

:::details 展开答案
`workspace:*` 只建软链，**不自动 build**。

三种解法：

```bash title="方案 1：一次性 build"
pnpm --filter '@lhx-kit/config' build
```

```bash title="方案 2：watch 模式（推荐）"
# 终端 1
pnpm --filter '@lhx-kit/config' dev

# 终端 2
pnpm --filter vmpa dev
```

```bash title="方案 3：source 直接跑（不推荐）"
# 改 packages/config/package.json 的 main 指向 src/index.ts
# 但会让发布出去的包不能正常工作
```

日常开发用方案 2。
:::

### Q17：怎么发布到 npm

:::details 展开答案
**当前没有自动发布流程**。手动步骤：

```bash title="1. 升版本"
cd packages/config
npm version patch    # 或 minor / major

# 2. build
pnpm --filter '@lhx-kit/config' build

# 3. publish
cd packages/config
npm publish --access public
```

:::info 未来计划
准备接入 changesets：

```bash
pnpm changeset          # 交互式声明变更
pnpm changeset version  # bump 版本号 + 生成 CHANGELOG
pnpm changeset publish  # 自动发布全部变更的包
```
:::
:::

---

## 八、📖 学习资源

### Q18：完整的学习路径是什么

:::tip 推荐顺序
1. 📖 [快速开始](../guide/getting-started) — 10 分钟跑起来
2. 🧠 [架构总览](../guide/architecture) — 理解分层
3. ⚡ [性能优化](../guide/performance) — 看 chunk 决策
4. 🌐 [CDN 外挂](../guide/cdn) — 深度看一个 feature
5. 🎨 [Renderer 概览](../renderer/overview) — 可选能力
6. 📦 [离线打包](../offline/overview) — 特殊场景
7. ⚙️ [CLI 参考](../cli/reference) — 工具速查

实战：

- 跟着 [快速开始](../guide/getting-started) 创建一个项目
- 试 `lhx-cli add page`
- 修改 render.json 看渲染器效果
- 尝试 `lhx-cli offline build` 生成离线包
:::

### Q19：遇到 Bug / 想提 PR 怎么做

- 🐛 [GitHub Issues](https://github.com/juwenzhang/lhx-kit/issues) 提 bug / feature request
- 🔀 [GitHub Pull Requests](https://github.com/juwenzhang/lhx-kit/pulls) 提 PR
- 💬 Issue 里附 **最小复现** 会更快得到回应
