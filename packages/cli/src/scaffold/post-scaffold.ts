import {relative} from 'node:path';
import {bold, cyan, dim, green} from 'kolorist';

/**
 * Hardcoded URLs that ship in the post-scaffold handoff message. They are
 * part of the user-facing CLI contract per design.md §3.9.5: changing them
 * requires a major bump and a migration note. Do NOT make them env-overridable
 * — users see them in their terminal scrollback for years and a moving target
 * breaks bookmarks/community links.
 */
export const HANDOFF_URLS = {
  docs: 'https://juwenzhang.github.io/lhx-kit/index.html',
  issues: 'https://github.com/juwenzhang/lhx-kit/issues'
} as const;

export type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun';

export interface PostScaffoldContext {
  /** Project name (basename of the target dir). */
  projectName: string;
  /** Absolute path of the scaffolded project. */
  projectPath: string;
  /** Top-level template name (`vue3-mpa` / `react-mpa` / ...). */
  template: string;
  /** Package manager the user picked. */
  packageManager: PackageManager;
  /** Currently scaffolded features — used to specialize next-steps text. */
  features: string[];
  /** Optional: directory the user invoked the CLI from. Used to render a
   *  relative project path when shorter than the absolute one. */
  cwd?: string;
}

/**
 * Per-template "Next steps" recipe. Returned as plain command lines so
 * a future migration to clack's note() box rendering keeps working.
 */
function nextStepsFor(template: string, pm: PackageManager, projectLabel: string): string[] {
  const cd = `cd ${projectLabel}`;
  const install = `${pm} install`;

  if (template === 'express' || template === 'koa' || template === 'fastify') {
    return [cd, install, 'docker compose up -d  # postgres + redis', `${pm} dev`];
  }
  if (template === 'lib-single') {
    return [cd, install, `${pm} build`, `${pm} test`];
  }
  if (template === 'lib-monorepo') {
    return [cd, install, `${pm} -r build`, 'see CONTRIBUTING.md for changeset workflow'];
  }
  if (template === 'business-mono') {
    return [cd, install, `${pm} -r build`, `${pm} dev:pc  # or dev:mobile / dev:admin`];
  }
  // vue3-mpa / react-mpa default
  return [cd, install, `${pm} dev`];
}

function chooseProjectPathLabel(ctx: PostScaffoldContext): string {
  if (!ctx.cwd) return ctx.projectPath;
  const rel = relative(ctx.cwd, ctx.projectPath);
  // Prefer relative when it doesn't escape upward — `./my-app` reads better
  // than a 60-char absolute path. Fall back to absolute when the project sits
  // outside the cwd subtree (`../foo`) since relative-with-`..` is confusing.
  if (!rel || rel.startsWith('..')) return ctx.projectPath;
  return `./${rel}`;
}

/**
 * Print the success handoff per design.md §3.9. Bilingual (zh + en),
 * one-emoji-per-line max, hardcoded URLs, no telemetry, no version-check
 * ping — see §3.9.5 for the hard rules.
 */
export function printHandoff(ctx: PostScaffoldContext): void {
  const path = chooseProjectPathLabel(ctx);
  const pmCmd = ctx.packageManager;
  const steps = nextStepsFor(ctx.template, pmCmd, path);

  console.log('');
  console.log(`${green('✅')}  Done`);
  console.log('');
  console.log(`📂  ${bold('Project created at')}  /  ${dim('项目已创建')}:`);
  console.log(`    ${cyan(path)}`);
  console.log('');
  console.log(`🚀  ${bold('Next steps')}  /  ${dim('下一步')}:`);
  for (const step of steps) {
    console.log(`    ${step}`);
  }
  console.log('');
  console.log(`📚  ${bold('Docs')}  /  ${dim('文档')}:`);
  console.log(`    ${dim(HANDOFF_URLS.docs)}`);
  console.log('');
  console.log(`💬  ${bold('Issues & PRs')}  /  ${dim('提交问题或贡献代码')}:`);
  console.log(`    ${dim(HANDOFF_URLS.issues)}`);
  console.log('');
  console.log(`Happy hacking!  /  ${dim('祝你编码愉快')} 🎉`);
  console.log('');
}

export interface PartialFailureContext {
  /** Path of the (partially-written) project. */
  projectPath: string;
  /** Files that were successfully written before the error. */
  filesWritten?: string[];
  /** Did the CLI itself create the target directory? Suggests `rm -rf` only when true. */
  createdProjectDir: boolean;
  /** The error that interrupted scaffolding. */
  cause: Error;
}

/**
 * Print a recovery hint for partial-failure cases per §3.9.1. Always
 * includes the issues link so the user has somewhere to file the bug.
 */
export function printPartialFailureHint(ctx: PartialFailureContext): void {
  console.log('');
  console.log(`⚠️  ${bold('Scaffold interrupted')}  /  ${dim('脚手架未完成')}`);
  console.log(`    ${ctx.cause.message}`);
  console.log('');
  if (ctx.filesWritten && ctx.filesWritten.length > 0) {
    console.log(`📁  ${ctx.filesWritten.length} file(s) were already written.`);
  }
  if (ctx.createdProjectDir) {
    console.log(`🧹  ${bold('Rollback')}: rm -rf ${ctx.projectPath}`);
  } else {
    console.log(`🧹  Inspect partial output at: ${ctx.projectPath}`);
  }
  console.log('');
  console.log(`💬  ${bold('Please report')}  /  ${dim('请反馈')}:`);
  console.log(`    ${dim(HANDOFF_URLS.issues)}`);
  console.log('');
}
