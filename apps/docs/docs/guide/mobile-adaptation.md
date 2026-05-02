# 📱 移动端适配方案

> 记录 lhx-kit H5 适配方案从 0 到 1 的**完整决策路径**。
> 每一个看似"常识"的选择，都是在其他方案被证否后剩下的那一个。

---

## 一、🎯 我们要解决什么问题

同一个 H5 产品需要同时在以下环境看起来**像是专门为那个环境做的**：

| 场景 | 典型尺寸 | 约束 |
| --- | --- | --- |
| 📱 iPhone SE | 375 × 667 | 小屏，文字不能太小 |
| 📱 iPhone 15 Pro Max | 430 × 932 | 大屏，元素不能太分散 |
| 📱 Android 各机型 | 360 – 428 | 最常见范围 |
| 📱 iPad 竖屏 | 768 × 1024 | 平板，元素不能过大 |
| 🖥️ 桌面浏览器 | 1440+ | 不能崩，但可以是"放大的手机壳" |

设计师交付 **750px 宽的 2x 设计稿**（业界事实标准，中国团队尤甚）。

---

## 二、📋 方案矩阵

业界四条主流路径。

### 方案 1：Viewport Scale

```html title="HTML 层面"
<meta name="viewport" content="width=750">
```

浏览器把 750 当 CSS viewport 宽度，缩放到实际屏幕。

| 评价 | |
| --- | --- |
| ✅ | 零改造：CSS 里写 `width: 100px` 就是 750 画布上的 100px |
| ❌ | 文字也被缩放，325px 小屏上 14px 文字渲染成 ~6px |
| ❌ | 响应式边界失效（`@media (min-width: 500px)` 不再对应物理屏幕） |
| ❌ | 微信 / 部分 WebView 对 `width=N` 支持不稳定 |

:::danger 业界 2012–2015 主流，已淘汰
:::

### 方案 2：vw / vh 单位

```css
.btn {
  width: 13.33vw;   /* 100 / 750 * 100 */
  height: 5.33vw;
  font-size: 3.73vw;
}
```

| 评价 | |
| --- | --- |
| ✅ | 标准 CSS，现代浏览器 100% 支持 |
| ✅ | 响应式规则照常工作 |
| ❌ | 开发只能写 vw，对手工编码心智负担大 |
| ❌ | Vant / antd-mobile 等组件库内部是 px，需要 postcss 插件转换 |
| ❌ | iOS Safari 的 `vh` 有 bfcache 刷新 bug |

:::tip 适合轻量项目
重型项目会踩到组件库边界。
:::

### 方案 3：rem (lib-flexible)

```js title="运行时脚本"
// 根字体 = clientWidth / 10
document.documentElement.style.fontSize = clientWidth / 10 + 'px';
```

CSS 里写 `rem`，但通过 **postcss 插件把 px 自动转成 rem**。

| 评价 | |
| --- | --- |
| ✅ | 开发**只写 px**，心智零负担 |
| ✅ | 组件库（Vant 等）用 rem 的也兼容 |
| ✅ | 设计稿 750 + `rootValue: 75` → 完美 1:1 |
| ❌ | 桌面浏览器打开 fontSize 会爆（1920 / 10 = 192px） |
| ❌ | 需要 JS 运行时 + postcss 构建插件，双重依赖 |

:::info 淘宝 / 京东 / 百度网盘 / B 站 H5 都用这个
:::

### 方案 4：纯 `@media` 断点

| 评价 | |
| --- | --- |
| ✅ | 无运行时 |
| ❌ | 断点数量爆炸（手机+平板+折叠屏） |
| ❌ | 跨断点的中间尺寸无法平滑过渡 |

:::warning 只适合断点明确的 admin / 桌面产品
:::

---

## 三、✅ 我们选了什么

:::tip 最终方案
**rem (lib-flexible) + postcss-pxtorem + 桌面居中护栏**

也就是方案 3，加上对"桌面浏览器打开"的兜底。
:::

### 3.1 为什么选 rem 而不是 vw

vw 和 rem 在**功能上**基本等价（数学公式几乎相同）。决策因素：

| 场景 | vw 痛点 | rem 优势 |
| --- | --- | --- |
| 心智负担 | 写 `13.33vw` 反直觉 | 写 `100px` 直觉 |
| 组件库 | Vant 内部混用 px/rem，vw 需要复杂 postcss 映射 | rem 原生兼容 |
| iOS Safari 动态工具栏 | `vh` 受动态工具栏影响，计算不稳定 | rem 根据 `clientWidth` 计算，稳定 |
| 已有工程迁移 | 现有 px 代码必须全改 | 开箱即用 |

:::info 开发体验是决定性因素
:::

### 3.2 为什么引入桌面居中

lib-flexible 本来是为**纯移动**设计的。现实：

- 📱 客户端内嵌 WebView 可能在桌面设备模拟器打开
- 📊 B 站 / 网易云 / 百度网盘这类站点有大量桌面流量从 mobile URL 进入
- 🧪 测试同学用桌面 Chrome 开发者工具切换设备也会触发"非移动视口"

不处理的后果：

```text title="1440px 桌面浏览器"
clientWidth = 1440
rootFontSize = 1440 / 10 = 144px
元素尺寸 = 100px(设计稿) → 1.33rem → 1.33 * 144 = 192px
          ↑↑↑
         整个页面放大成马赛克
```

### 3.3 桌面兜底的两种做法

:::code-group

```text [方案 A：响应式重写]
断点判断，桌面走另一套 UI

代价：维护两套代码
对"只想保底能看"的站点过度设计
```

```text [方案 B：桌面模拟器模式]
把整个 H5 当作 750px 的"手机壳"渲染在桌面中央

正是百度网盘 / B 站 H5 落地页的方案

代价：桌面用户看到居中的"手机"
但对运营 H5 完全可接受
```

:::

**我们选方案 B**。

---

## 四、🔧 实现

### 4.1 核心公式

```ts title="packages/runtime/src/mobile.ts" showLineNumbers {3-4}
function updateRem() {
  const rawWidth = document.documentElement.clientWidth;
  const cappedWidth = maxWidth != null ? Math.min(rawWidth, maxWidth) : rawWidth;
  const rem = cappedWidth / 10;
  document.documentElement.style.fontSize = `${rem}px`;
}
```

### 4.2 CSS 注入的居中样式

```css title="runtime 自动注入到 <head>"
body {
  max-width: 750px;
  margin: 0 auto;
  min-height: 100vh;
  background: #fff;
  box-shadow: 0 0 24px rgba(0, 0, 0, 0.08);
}

@media (max-width: 750px) {
  body { box-shadow: none; }
}
```

### 4.3 事件监听

```ts title="packages/runtime/src/mobile.ts"
window.addEventListener('resize', updateRem, {passive: true});

window.addEventListener('orientationchange', () => {
  updateRem();
  // iOS 首次 width 误报，300ms 后再取一次
  setTimeout(updateRem, 300);
});

window.addEventListener('pageshow', (e) => {
  // bfcache 恢复时 inline style 不会自动执行
  if ((e as PageTransitionEvent).persisted) updateRem();
});
```

---

## 五、🎛️ 最终 API

```ts title="src/bootstrap.ts"
import {setupMobile} from '@lhx-kit/runtime/mobile';

setupMobile({
  enableRem: true,         // 默认 true。admin 项目可传 false 关掉
  maxWidth: 750,           // 启用桌面居中 + rem 上限
  safeArea: true,          // 注入 --lhx-safe-top/right/bottom/left CSS 变量
  ensureViewport: true,    // 如缺失则自动插 <meta name=viewport>
  detectHairlines: true,   // DPR>=2 设备上检测 0.5px 边框支持

  deviceOverrides: (rem, ctx) => {
    // iPad 横屏单独缩一档
    if (isIpad() && ctx.clientWidth > ctx.clientHeight) {
      return rem * 0.7 * 0.55;
    }
    return rem;
  }
});
```

### 选项详解

| 选项 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `enableRem` | `boolean` | `true` | 主开关。admin 项目传 `false` |
| `maxWidth` | `number \| false` | `false` | 启用桌面居中 + rem 上限。推荐 `750` |
| `safeArea` | `boolean` | `true` | 注入 `env(safe-area-inset-*)` → `--lhx-safe-*` CSS 变量 |
| `ensureViewport` | `boolean` | `true` | 自动保证 viewport meta 存在 |
| `detectHairlines` | `boolean` | `true` | 检测 0.5px 边框支持，DPR>=2 时给 html 加 `.hairlines` |
| `deviceOverrides` | `function` | – | 针对 iPad / 鸿蒙等设备的定制调整 |

---

## 六、🛠️ postcss-pxtorem 配置

```ts title="vite.config.ts" showLineNumbers {6-14}
import pxtorem from 'postcss-pxtorem';

export default defineConfig({
  css: {
    postcss: {
      plugins: [
        pxtorem({
          rootValue: 75,                 // 750 设计稿 / 10
          unitPrecision: 5,
          propList: ['*'],               // 所有属性都转
          selectorBlackList: [],
          exclude: /node_modules/i       // 不转第三方库
        })
      ]
    }
  }
});
```

:::warning 三个关键参数
- **`rootValue: 75`**：750 设计稿除 10
- **`exclude: /node_modules/`**：不转换第三方库的 px（否则 Vant 等组件内部坐标会错乱）
- **`propList: ['*']`**：所有属性都转（默认只转字体相关）
:::

---

## 七、🎨 reset.css 必须要写

:::danger 很多 rem 翻车的项目忽略这一点
浏览器 UA 样式表里，`h1/h2/p/ul/ol/blockquote` 等元素的 margin/padding/font-size **默认用 `em` 单位**。

如果不 reset：
- `<h1>` 默认 `font-size: 2em`
- `em` 不是 `rem`——它是**相对父元素的 font-size**
- 在 rem 适配下 html font-size 已经被你改成动态值，`2em` 就是 `2 * clientWidth / 10 = 巨大`
:::

必须至少 reset 这些：

```css title="src/styles/reset.css" showLineNumbers
html, body, h1, h2, h3, h4, h5, h6,
p, blockquote, dl, dd, ol, ul, figure, hr {
  margin: 0;
  padding: 0;
}

h1, h2, h3, h4, h5, h6 {
  font-size: inherit;   /* 关键：不要让 h1 default 2em */
  font-weight: inherit;
}

body {
  font-size: 14px;
  line-height: 1.5;
  font-family:
    -apple-system,
    BlinkMacSystemFont,
    'PingFang SC',
    'Helvetica Neue',
    sans-serif;
}

/* 0.5px hairlines 支持的设备 */
.hairlines .lhx-border-bottom { border-bottom-width: 0.5px; }
```

`examples/vmpa` 和 `examples/rmpa` 的 bootstrap 文件会 `import './styles/reset.css'`，脚手架生成项目时自动包含。

---

## 八、🐛 踩过的坑

### 8.1 iOS Safari 首次 resize 报错 width

:::details 问题与修复
**现象**：orientationchange 事件触发时 `document.documentElement.clientWidth` 还是旧值。

**解决**：在 orientationchange handler 里设 `setTimeout(updateRem, 300)` 二次触发。

这个 trick 从 lib-flexible 源码继承。
:::

### 8.2 bfcache 恢复后 fontSize 丢失

:::details 问题与修复
**现象**：页面从 back/forward cache 恢复时，inline style 不会自动重新执行。

**解决**：监听 `pageshow` 事件的 `persisted` 字段，恢复时重新计算。

```ts
window.addEventListener('pageshow', (e) => {
  if ((e as PageTransitionEvent).persisted) updateRem();
});
```
:::

### 8.3 刚加载时闪一下

:::details 问题与修复
**现象**：第一次 JS 执行前 html font-size 还是 16px，那几毫秒里 CSS 用 rem 的元素会渲染成"默认尺寸"，JS 执行完立即正确，造成闪烁。

**解决**：把初始化脚本 **inline 到 `<head>` 里**，在任何 CSS 加载前执行：

```html title="template.html" {4-10}
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0,viewport-fit=cover">
  <script>
    !function(){
      var d = document.documentElement;
      var w = Math.min(d.clientWidth, 750);
      d.style.fontSize = w / 10 + 'px';
    }();
  </script>
  <link rel="stylesheet" href="...">
</head>
```

模板里的 `template.html` 已经包含这一段。
:::

### 8.4 桌面 Chrome 设备模拟器的奇怪 clientWidth

:::details 问题与修复
**现象**：Chrome DevTools 的 "Responsive" 模式有时报告 `clientWidth === 0`（特别是首次进入时）。

**解决**：

```ts
if (!rawWidth) return;  // 直接放弃这次更新，等下次 resize
```
:::

---

## 九、📥 跨项目复用建议

如果你要在一个**已有**的非 lhx-kit 项目里落地：

```bash title="一键迁移"
pnpm add @lhx-kit/runtime postcss-pxtorem
```

```ts title="1. src/main.ts 顶部"
import {setupMobile} from '@lhx-kit/runtime/mobile';
setupMobile({maxWidth: 750});
```

```ts title="2. vite.config.ts"
css: {
  postcss: {
    plugins: [pxtorem({rootValue: 75, exclude: /node_modules/})]
  }
}
```

```css title="3. src/styles/reset.css"
/* 见第七节 */
```

```html title="4. index.html"
<!-- 见 8.3 的 inline script -->
```

**整个迁移约半天**。

---

## 十、🚫 何时**不**用这套方案

:::warning 下列场景不适合
- **纯桌面管理后台**：用 px + `@media` 断点即可，不需要 rem
- **无视觉还原要求的轻量页面**：比如只有一个登录表单，用 vw / vh 甚至纯 px 都行
- **跨端 App（小程序 + H5 + App）**：考虑 Taro / uni-app 的体系，他们的适配方案和 H5 不完全兼容
:::

---

## 十一、📚 相关资源

- [lib-flexible 源码](https://github.com/amfe/lib-flexible/blob/master/src/flexible.js)
- [postcss-pxtorem 文档](https://github.com/cuth/postcss-pxtorem)
- [百度 amis 组件库（思路参考）](https://github.com/baidu/amis)
- [B 站 H5 技术方案分享](https://juejin.cn/post/6844903591502651405)
