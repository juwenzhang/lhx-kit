# 🛡️ Security Policy

## 支持的版本

| Version | Supported |
| ------- | --------- |
| `0.x`   | ✅ 持续 |

在 1.0 发布前，所有修复只会回到最新的 `0.x` 分支。

## 报告漏洞

**请不要在公开 Issue 中直接报告安全问题**。

请通过以下方式私下联系：

- 📧 发邮件到：<safety-report@example.com>（占位；请替换为真实联系方式）
- 🔐 或使用 GitHub 的 [Private Vulnerability Reporting](https://github.com/juwenzhang/lhx-kit/security/advisories/new)

报告请尽量包含：

- 漏洞类型（XSS / 原型污染 / 依赖链 / 其他）
- 受影响的包与版本
- 复现步骤 / PoC
- 潜在影响范围

## 处理流程

1. **24h 内**确认收到
2. **7d 内**评估严重性并给出临时缓解方案
3. **30d 内**发布正式修复版本
4. 修复版本发布后再公开 CVE / Advisory

## 致谢

我们会在修复公告里公开致谢报告者（除非报告者希望匿名）。

## 依赖安全

项目启用了 [Dependabot](https://github.com/juwenzhang/lhx-kit/network/dependencies) 自动扫描依赖漏洞。

常用命令：

```bash
pnpm audit                        # 查看当前依赖的已知漏洞
pnpm audit --fix                  # 尝试自动升级到安全版本
```
