/**
 * lint-staged：仅对 git staged 文件跑 lint/format，提交速度快。
 *
 * 时机：husky 的 pre-commit 钩子触发
 * 行为：把 staged 文件按类型分组执行，修完自动 git add 回去
 *
 * 性能预期：
 *   - 典型 PR <20 文件：<2s
 *   - 大 PR <100 文件：<5s
 *
 * 如果太慢：可以把 typecheck 挪到 pre-push 钩子或 CI。
 */
module.exports = {
  // TS / JS / JSX / TSX：Biome 一次搞定 format + lint + organize imports
  '**/*.{ts,tsx,js,jsx,mjs,cjs}': ['biome check --write --no-errors-on-unmatched --files-ignore-unknown=true'],

  // JSON / JSONC：Biome 格式化（package.json 改动后触发）
  '**/*.{json,jsonc}': ['biome check --write --no-errors-on-unmatched --files-ignore-unknown=true'],

  // Markdown / YAML / CSS 用 prettier 兜底（Biome 2.x 对这些类型支持还不完整）
  // 暂时不做格式化，仅做纯字符检查（避免 BOM / 行尾混乱）。
  // 真要格式化 .md 请用 markdownlint 或手动检查。
  '**/*.{md,mdx}': [],
  '**/*.{yaml,yml}': [],
  '**/*.{css,scss,less}': []

  // package.json 特殊处理：保持字段顺序一致（按 npm 官方推荐顺序）
  // 需要 sort-package-json 包。如果要启用取消注释：
  // '**/package.json': ['sort-package-json']
};
