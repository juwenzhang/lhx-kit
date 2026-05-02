import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {dirname, resolve as resolvePath} from 'node:path';
import type {CliContext} from '../context';
import {requireProject} from '../project';
import {error, info, muted, section} from '../ui';

const require = createRequire(import.meta.url);

export interface DevBuildOptions {
  page?: string;
  pages?: string;
  mode?: string;
  /** Forward to the underlying vite dev/preview server. */
  host?: boolean | string;
  /** Forward to the underlying vite dev/preview server. */
  port?: number | string;
  /** Forward to the underlying vite dev/preview server. */
  open?: boolean | string;
  /** Forward to the underlying vite dev/preview server. */
  strictPort?: boolean;
  /** Forward to the underlying vite dev/preview server. */
  base?: string;
}

function normalizePages(options: DevBuildOptions): string | undefined {
  const raw = options.pages ?? options.page;
  if (!raw) return undefined;
  const list = raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return list.length ? list.join(',') : undefined;
}

/**
 * Translate supported forwarded options back into vite CLI args. Only a small
 * set (host/port/open/strict-port/base) is whitelisted so that unknown flags
 * are surfaced as CLI errors rather than silently ignored.
 */
function buildServerExtraArgs(options: DevBuildOptions): string[] {
  const args: string[] = [];
  if (options.host !== undefined) {
    args.push('--host', typeof options.host === 'string' ? options.host : '');
    if (args[args.length - 1] === '') args.pop();
  }
  if (options.port !== undefined) args.push('--port', String(options.port));
  if (options.strictPort) args.push('--strictPort');
  if (options.open !== undefined) {
    args.push('--open', typeof options.open === 'string' ? options.open : '');
    if (args[args.length - 1] === '') args.pop();
  }
  if (options.base) args.push('--base', options.base);
  return args;
}

function resolveViteBin(cwd: string): string {
  // Prefer the project-local vite (from node_modules) so CLI doesn't pin a
  // version. `paths` lets require.resolve walk from the project cwd.
  const vitePkgPath = require.resolve('vite/package.json', {paths: [cwd]});
  const vitePkg = require(vitePkgPath) as {bin?: string | Record<string, string>};
  const bin = typeof vitePkg.bin === 'string' ? vitePkg.bin : vitePkg.bin?.vite;
  if (!bin) {
    throw new Error(`Could not locate vite binary from ${vitePkgPath}.`);
  }
  return resolvePath(dirname(vitePkgPath), bin);
}

async function spawnVite(
  subcommand: 'dev' | 'build' | 'preview',
  cwd: string,
  lhxPages: string | undefined,
  extra: string[] = []
): Promise<number> {
  const viteBin = resolveViteBin(cwd);
  const env = {...process.env};
  if (lhxPages) env.LHX_PAGES = lhxPages;

  return new Promise<number>((resolveCode, rejectCode) => {
    const child = spawn(process.execPath, [viteBin, subcommand, ...extra], {
      cwd,
      stdio: 'inherit',
      env
    });
    child.on('exit', code => resolveCode(code ?? 0));
    child.on('error', err => rejectCode(err));
  });
}

async function ensurePagesExist(cwd: string, pages: string | undefined): Promise<void> {
  if (!pages) return;
  const {project} = await requireProject(cwd);
  const known = new Set(Object.keys(project.config.pages));
  const unknown = pages.split(',').filter(p => !known.has(p));
  if (unknown.length) {
    throw new Error(`Unknown page(s): ${unknown.join(', ')}. Known: ${[...known].join(', ')}`);
  }
}

export async function runDevCommand(context: CliContext, options: DevBuildOptions): Promise<void> {
  const pages = normalizePages(options);
  await ensurePagesExist(context.cwd, pages);
  section(`lhx-cli dev${pages ? ` (pages: ${pages})` : ''}`);
  if (!pages) muted('tip: pass --page=<name> or --pages=a,b to restrict to specific pages.');
  try {
    const code = await spawnVite('dev', context.cwd, pages, buildServerExtraArgs(options));
    process.exitCode = code;
  } catch (err) {
    error((err as Error).message);
    process.exitCode = 1;
  }
}

export async function runBuildCommand(context: CliContext, options: DevBuildOptions): Promise<void> {
  const pages = normalizePages(options);
  await ensurePagesExist(context.cwd, pages);
  section(`lhx-cli build${pages ? ` (pages: ${pages})` : ''}`);
  try {
    const code = await spawnVite('build', context.cwd, pages);
    process.exitCode = code;
  } catch (err) {
    error((err as Error).message);
    process.exitCode = 1;
  }
}

export async function runPreviewCommand(context: CliContext, options: DevBuildOptions): Promise<void> {
  const pages = normalizePages(options);
  await ensurePagesExist(context.cwd, pages);
  section(`lhx-cli preview${pages ? ` (pages: ${pages})` : ''}`);
  info('Note: full MPA-aware preview server is tracked under add-cdn-and-preview-contract.');
  try {
    const code = await spawnVite('preview', context.cwd, pages, buildServerExtraArgs(options));
    process.exitCode = code;
  } catch (err) {
    error((err as Error).message);
    process.exitCode = 1;
  }
}
