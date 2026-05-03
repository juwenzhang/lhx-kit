> 在使用 `lhx-kit` 的过程中，@ai-docs 是一个便捷的工具，用于快速验证文档生成的精确性和一致性。本指南简单介绍如何高效地执行一轮 200 字的“烟雾测试（smoke test）”。

---

## 🎯 什么是 @ai-docs 命令？

`@ai-docs` 是 `lhx-kit` 提供的脚本命令之一，特别设计用来自动化创建、检查和修复文档片段。该命令主要用于简短、快速的文档测试循环，例如检查 Markdown 文件是否合规，或者文档是否清晰准确。

📂 代码路径：`packages/ai-commands/src/ai-docs.ts`

---

## 🧩 如何使用？

1. **运行命令：** 在项目根目录下运行以下命令：
   ```bash
   pnpm run @ai-docs -- [文件路径]
   ```
   例如：
   ```bash
   pnpm run @ai-docs -- apps/docs/docs/engineering/sample-doc.md
   ```

2. **功能选项：** 使用参数自定义生成行为：
   - `--validate-only`：只验证语法与格式，不做更改。
   - `--fix`：尝试自动修复不符合规范的部分。

3. **输出结果：** 在控制台中查看解析反馈，包括错误或改进建议。

> 💡 **提示：** 如果想要生成的文档更符合项目风格，请确保安装并正确配置了 `lhx-kit` 的所有工具依赖。

---

## ⚠️ 常见问题

1. **Q:** 为什么运行失败？
   - **A:** 确保已正确安装和配置 `pnpm`，并且文件路径有效。

2. **Q:** 输出中有大量建议，如何管理？
   - **A:** 使用 IDE 插件或结合命令行工具以分步骤完成。

---

## 📚 相关 / Related

- [🎮 AI 命令使用手册（8 条 workflow 速查）](./ai-commands.md)
- [🤖 GitHub AI 自动流（零成本）](./ai-automation.md)
- [⚙️ CI 策略：paths / 跨平台 / frozen / pre-push](./ci-strategy.md)