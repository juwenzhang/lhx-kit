---
"@lhx-kit/cli": patch
---

- 修复所有模板 README 中文档链接死链（`lhx-kit.dev` → `juwenzhang.github.io/lhx-kit`）
- 合并 6 个后端模板为 `micro` + `service` 两个统一模板，framework 改为 feature 轴（`framework-express`/`framework-fastify`/`framework-koa`）
- 精简 CSS styling feature：移除冗余的 `none`/`vue-scoped`/`emotion`
- `business-mono` 模板移除 turbo 依赖，改用 pnpm workspace 原生命令
- `codebuddy-skills` feature 自动添加 `@lhx-kit/skills` 依赖
- 修复 `resolveLhxKitDepsPerPackage` 逐包 npm view 版本解析，支持 monorepo 子包递归
- 修复 release workflow npm 版本锁死导致引擎不兼容问题
- 修复 pre-push hook 缺少 build 步骤导致 typecheck 失败
