#!/usr/bin/env node
/**
 * Generic launcher for the lhx-kit vite demos.
 *
 * This is a demo-scoped reference implementation. The real, project-wide
 * equivalent will eventually live as a shared CLI (e.g. `lhx-kit dev|build`)
 * baked into the official project template.
 *
 * Usage (via pnpm run):
 *   pnpm run dev                         # all pages
 *   pnpm run dev --page=home             # only `home`
 *   pnpm run dev --pages=home,profile    # multiple pages
 *   pnpm run dev home                    # shorthand: first bare arg = page list
 *   pnpm run build --page=profile
 *   pnpm run preview --page=home
 *
 * Any flags not recognized here are forwarded to vite as-is, e.g.
 *   pnpm run dev --page=home --host --port=4000
 */
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {dirname, resolve as resolvePath} from 'node:path';

const require = createRequire(import.meta.url);

/**
 * Extract the page selector from argv.
 * Supports `--page=xxx`, `--pages=a,b`, `--page xxx`, `--pages a,b`,
 * and a single bare positional argument like `home` or `home,profile`.
 * Returns {pages: string|undefined, rest: string[]}.
 */
function extractPages(argv) {
  const rest = [];
  let pages;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--page' || arg === '--pages') {
      pages = argv[++i];
      continue;
    }
    const m = /^--(?:page|pages)=(.+)$/.exec(arg);
    if (m) {
      pages = m[1];
      continue;
    }
    // First bare (non-flag) positional is treated as the page list.
    if (pages === undefined && !arg.startsWith('-')) {
      pages = arg;
      continue;
    }
    rest.push(arg);
  }
  return {pages, rest};
}

function normalizePages(raw) {
  if (!raw) return undefined;
  const list = raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return list.length ? list.join(',') : undefined;
}

const [subcommand, ...userArgs] = process.argv.slice(2);
if (!subcommand || !['dev', 'build', 'preview'].includes(subcommand)) {
  console.error('Usage: run.mjs <dev|build|preview> [--page=<name>|--pages=a,b] [...vite args]');
  process.exit(1);
}

const {pages, rest} = extractPages(userArgs);
const normalized = normalizePages(pages);

const env = {...process.env};
if (normalized) {
  env.LHX_PAGES = normalized;
  console.log(`[lhx-kit] LHX_PAGES=${normalized}`);
} else if (env.LHX_PAGES) {
  console.log(`[lhx-kit] LHX_PAGES=${env.LHX_PAGES} (from environment)`);
} else {
  console.log('[lhx-kit] LHX_PAGES not set → build/serve ALL pages');
}

// vite's package.json does not expose `./bin/vite.js` via "exports",
// so we resolve the binary through the bin field instead.
const vitePkgPath = require.resolve('vite/package.json');
const vitePkg = require(vitePkgPath);
const viteBinRel = typeof vitePkg.bin === 'string' ? vitePkg.bin : vitePkg.bin?.vite;
if (!viteBinRel) {
  console.error('[lhx-kit] Could not locate vite binary from vite/package.json');
  process.exit(1);
}
const viteBin = resolvePath(dirname(vitePkgPath), viteBinRel);

const child = spawn(process.execPath, [viteBin, subcommand, ...rest], {
  stdio: 'inherit',
  env
});

child.on('exit', code => process.exit(code ?? 0));
child.on('error', err => {
  console.error(err);
  process.exit(1);
});
