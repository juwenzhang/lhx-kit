---
"@lhx-kit/cli": patch
---

修复 `lhx-cli skills` 在 pnpm 严格隔离下无法解析 `@lhx-kit/skills` 的问题：改用 `createRequire` 从用户项目根解析模块路径，替代原来的裸 `import()` 调用。
