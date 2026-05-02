/**
 * Commitlint 规则。遵循 Conventional Commits 1.0。
 *
 * 本地：husky commit-msg 钩子触发
 * 远端：CI 里 commitlint --from=origin/master --to=HEAD 扫整个 PR
 *
 * 通过示例：
 *   feat(cli): add `lhx-cli add page` command
 *   fix(vite-plugin): correct chunk ownership for lazy routes
 *   docs(guide): rewrite performance chapter
 *   chore(deps): bump vite to 6.0.3
 *   ci(docs): deploy rspress to GitHub Pages
 *
 * 拒绝示例：
 *   update stuff                         ← 缺少 type
 *   feat: add feature.                   ← 句末不要句号
 *   FEAT: add feature                    ← type 必须小写
 *   feat(Vite): ...                      ← scope 必须小写
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // type 枚举。覆盖日常 PR 全部场景。
    'type-enum': [
      2,
      'always',
      [
        'feat', // 新功能
        'fix', // bug 修复
        'docs', // 文档
        'style', // 格式化（不影响代码行为）
        'refactor', // 重构（既不是新功能也不是修 bug）
        'perf', // 性能优化
        'test', // 测试
        'build', // 构建系统或外部依赖
        'ci', // CI 配置
        'chore', // 其他（deps bump / 改 .gitignore）
        'revert' // revert 前一次 commit
      ]
    ],
    'type-case': [2, 'always', 'lower-case'],
    'type-empty': [2, 'never'],

    // scope 用于标注影响的子包
    'scope-case': [2, 'always', 'lower-case'],
    'scope-enum': [
      1, // 警告级别：允许新 scope，但 PR review 时提醒
      'always',
      [
        'cli',
        'config',
        'runtime',
        'renderer',
        'offline',
        'vite-plugin',
        'docs',
        'templates',
        'vmpa',
        'rmpa',
        'deps',
        'ci',
        'release',
        'repo'
      ]
    ],

    // subject 长度 + 大小写
    'subject-empty': [2, 'never'],
    'subject-case': [2, 'never', ['upper-case', 'pascal-case', 'start-case']],
    'subject-full-stop': [2, 'never', '.'],

    // header 长度
    'header-max-length': [2, 'always', 100],

    // body / footer 空行分隔
    'body-leading-blank': [2, 'always'],
    'footer-leading-blank': [2, 'always']
  }
};
