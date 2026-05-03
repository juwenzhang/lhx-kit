import {defineConfig} from 'rspress/config';

/**
 * Rspress site configuration.
 *
 * - `base`: GitHub Pages 会把 repo 作为子路径挂载，部署到
 *   `https://juwenzhang.github.io/lhx-kit/`；本地 `pnpm dev` 时 rspress
 *   会自动忽略 base（只有 build 产物才使用）。
 * - `lang`: 主语言；暂时只维护中文，未来补英文时改为 `root.lang` 结构。
 * - `themeConfig.socialLinks`: 顶栏右侧的 GitHub icon。
 * - `themeConfig.editLink`: 每页末尾"在 GitHub 上编辑此页"链接。
 * - `themeConfig.lastUpdated*`: 需要 CI 里 `fetch-depth: 0` 才能读 git log。
 * - `themeConfig.outlineTitle`: 右侧大纲标题（默认 "ON THIS PAGE"）。
 */
export default defineConfig({
  root: 'docs',
  base: '/lhx-kit/',
  lang: 'zh',
  title: 'lhx-kit',
  description: 'MPA 脚手架 · 运行时 · Vite 插件 · 配置驱动渲染 · 离线打包',
  icon: '/favicon.ico',
  logo: {
    light: '/favicon.ico',
    dark: '/favicon.ico'
  },
  logoText: 'lhx-kit',
  themeConfig: {
    enableContentAnimation: true,
    enableScrollToTop: true,
    outlineTitle: '本页导航',
    lastUpdatedText: '最后更新于',
    prevPageText: '上一篇',
    nextPageText: '下一篇',
    searchPlaceholderText: '搜索',
    overview: {
      filterNameText: '筛选',
      filterPlaceholderText: '输入关键词过滤',
      filterNoResultText: '未匹配到结果'
    },
    socialLinks: [
      {
        icon: 'github',
        mode: 'link',
        content: 'https://github.com/juwenzhang/lhx-kit'
      }
    ],
    editLink: {
      docRepoBaseUrl: 'https://github.com/juwenzhang/lhx-kit/tree/master/apps/docs/docs',
      text: '📝 在 GitHub 上编辑此页'
    },
    footer: {
      message:
        '<span>Released under the MIT License. © 2026 <a href="https://github.com/juwenzhang">luhanxin</a></span>'
    },
    nav: [
      {text: '🏠 首页', link: '/'},
      {text: '📖 指南', link: '/guide/getting-started'},
      {text: '⚙️ CLI', link: '/cli/reference'},
      {text: '🧩 Runtime', link: '/runtime/overview'},
      {text: '🎨 Renderer', link: '/renderer/overview'},
      {text: '📦 Offline', link: '/offline/overview'},
      {text: '🛠️ 工程化', link: '/engineering/overview'},
      {text: '🧱 模板', link: '/templates/catalogue'},
      {text: '❓ FAQ', link: '/reference/faq'}
    ],
    sidebar: {
      '/guide/': [
        {
          text: '🚀 入门',
          collapsed: false,
          items: [
            {text: '快速开始', link: '/guide/getting-started'},
            {text: '架构总览', link: '/guide/architecture'},
            {text: '🛠️ 完整搭建流程（从零到发布）', link: '/guide/project-walkthrough'}
          ]
        },
        {
          text: '🧠 深度专题',
          collapsed: false,
          items: [
            {text: '性能优化决策与落地', link: '/guide/performance'},
            {text: 'CDN 外挂方案', link: '/guide/cdn'},
            {text: '移动端适配方案', link: '/guide/mobile-adaptation'}
          ]
        }
      ],
      '/cli/': [
        {
          text: '⚙️ CLI',
          collapsed: false,
          items: [{text: '命令参考', link: '/cli/reference'}]
        }
      ],
      '/runtime/': [
        {
          text: '🧩 Runtime',
          collapsed: false,
          items: [
            {text: 'Runtime 概览', link: '/runtime/overview'},
            {text: 'Vite 插件实现详解', link: '/runtime/vite-plugin'},
            {text: 'Rolldown 迁移记（Vite 8）', link: '/runtime/rolldown-migration'}
          ]
        }
      ],
      '/renderer/': [
        {
          text: '🎨 Renderer',
          collapsed: false,
          items: [{text: 'Renderer 概览', link: '/renderer/overview'}]
        }
      ],
      '/offline/': [
        {
          text: '📦 Offline',
          collapsed: false,
          items: [
            {text: '离线打包', link: '/offline/overview'},
            {text: '打包深度剖析：压缩库 / 哈希 / 算法', link: '/offline/packaging-deep-dive'},
            {text: '升级评估：要不要做？做哪些？', link: '/offline/upgrade-assessment'}
          ]
        }
      ],
      '/engineering/': [
        {
          text: '🛠️ 工程化',
          collapsed: false,
          items: [
            {text: '专栏总览', link: '/engineering/overview'},
            {text: '🚀 发布流水线：Changesets + Trusted Publishing', link: '/engineering/release-pipeline'},
            {text: '⚙️ CI 策略：paths / 跨平台 / frozen / pre-push', link: '/engineering/ci-strategy'},
            {text: '🤖 GitHub AI 自动流（零成本）', link: '/engineering/ai-automation'},
            {text: '🎯 AI 协作策略：多模型 review + 受控修复', link: '/engineering/ai-review-strategy'},
            {text: '🔧 GitHub CLI 实战手册', link: '/engineering/gh-cli-guide'}
          ]
        }
      ],
      '/templates/': [
        {
          text: '🧱 模板',
          collapsed: false,
          items: [{text: '模板目录', link: '/templates/catalogue'}]
        }
      ],
      '/reference/': [
        {
          text: '📚 参考',
          collapsed: false,
          items: [
            {text: 'FAQ 常见问题', link: '/reference/faq'},
            {text: '术语表', link: '/reference/glossary'},
            {text: '版本迁移', link: '/reference/migration'}
          ]
        }
      ]
    }
  },
  markdown: {
    showLineNumbers: false,
    defaultWrapCode: true
  }
});
