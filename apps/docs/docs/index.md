---
pageType: home
titleSuffix: 一站式 MPA 工程化工具链
hero:
  name: lhx-kit
  text: 一套配置驱动整条链路
  tagline: 📐 MPA 脚手架 · 🧩 运行时能力 · ⚡ Vite 插件 · 🎨 配置驱动渲染 · 📦 离线打包
  actions:
    - theme: brand
      text: 🚀 5 分钟上手
      link: /guide/getting-started
    - theme: alt
      text: 🧠 架构与决策
      link: /guide/architecture
    - theme: alt
      text: ⭐ GitHub
      link: https://github.com/juwenzhang/lhx-kit
features:
  - title: 📐 真实可运行的模板
    details: vue3-mpa / react-mpa 双套模板，覆盖路由、状态、请求、Mock、单测、E2E、Docker、CI。不是 hello-world，是第一天就能跑生产。
    icon: 📐
  - title: 🔗 一份配置贯穿全流程
    details: project.config.ts 被 CLI、Vite 插件、离线打包、运行时共享。改一处字段，整条链路同步生效。
    icon: 🔗
  - title: 📱 移动端适配成体系
    details: runtime/mobile 按百度网盘 / 淘宝 / lib-flexible 思路落地 rem + 桌面居中 + 安全区 + hairline 检测。开发只写 px。
    icon: 📱
  - title: ⚡ MPA 性能优化到位
    details: Rollup manualChunks 家族分组 + experimentalMinChunkSize=10KB + 预压缩 gzip/brotli + CDN 外挂。chunk 数从 13 降到 10。
    icon: ⚡
  - title: 🎨 配置驱动渲染可选开启
    details: JSON schema 渲染器同时提供 Vue3 / React 绑定。zod 走动态 import，默认不打进客户端。
    icon: 🎨
  - title: 📦 离线包算法清晰
    details: 白名单过滤 + sha256 指纹 + AdmZip 打包 + HTML CDN urls 置空。离线产物可直接丢到 WebView 容器里运行。
    icon: 📦
  - title: 🧪 工程质量开箱即用
    details: ESLint / Prettier / Husky / Commitlint / lint-staged / Vitest / Playwright / MSW 全部预置。不用再写配置。
    icon: 🧪
  - title: 🎯 零侵入扩展
    details: 模板即数据，不需要改 CLI 代码就能新增模板。Feature flag 按勾选 AST 级 upsert 到 project.config.ts。
    icon: 🎯
  - title: 🧭 决策透明可追溯
    details: 每一个设计决定都在文档里解释"为什么不是另一种做法"。读完一遍就能给同事讲清楚原理。
    icon: 🧭
---
