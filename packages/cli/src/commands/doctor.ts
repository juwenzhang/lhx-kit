import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {isAbsolute, join, resolve as resolvePath} from 'node:path';
import {extractPlaceholders} from '@lhx-kit/config';
import type {CliContext} from '../context';
import {tryProject} from '../project';
import {listBuiltinTemplates} from '../templates';
import {error, info, muted, section, success, warn} from '../ui';

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
  hint?: string;
  severity?: 'error' | 'warn';
}

function satisfies(version: string, requirement: string): boolean {
  if (!requirement.startsWith('>=')) return true;
  const expected = requirement.slice(2);
  const parts = (input: string): number[] => input.split('.').map(Number);
  const [va, vb, vc] = parts(version);
  const [ea, eb, ec] = parts(expected);
  if (va !== ea) return va > ea;
  if (vb !== eb) return vb > eb;
  return vc >= ec;
}

function toAbs(rootDir: string, relativeOrAbs: string): string {
  return isAbsolute(relativeOrAbs) ? relativeOrAbs : resolvePath(rootDir, relativeOrAbs);
}

const LINTER_FILES: Array<{label: string; files: string[]}> = [
  {
    label: 'ESLint',
    files: [
      'eslint.config.js',
      'eslint.config.mjs',
      'eslint.config.cjs',
      'eslint.config.ts',
      '.eslintrc',
      '.eslintrc.js',
      '.eslintrc.cjs',
      '.eslintrc.json',
      '.eslintrc.yaml',
      '.eslintrc.yml'
    ]
  },
  {
    label: 'Prettier',
    files: [
      'prettier.config.js',
      'prettier.config.mjs',
      'prettier.config.cjs',
      '.prettierrc',
      '.prettierrc.js',
      '.prettierrc.cjs',
      '.prettierrc.json',
      '.prettierrc.yaml',
      '.prettierrc.yml',
      '.prettierrc.toml'
    ]
  },
  {label: 'Biome', files: ['biome.json', 'biome.jsonc']},
  {label: 'Oxlint', files: ['oxlint.config.json', '.oxlintrc.json']},
  {label: 'Rslint', files: ['rslint.config.js', 'rslint.config.mjs', 'rslint.config.ts', 'rslint.config.cjs']}
];

function detectLinters(rootDir: string): string[] {
  const found: string[] = [];
  for (const {label, files} of LINTER_FILES) {
    if (files.some(f => existsSync(join(rootDir, f)))) found.push(label);
  }
  return found;
}

function detectHusky(rootDir: string): {installed: boolean; hooks: string[]; note?: string} {
  const dir = join(rootDir, '.husky');
  if (!existsSync(dir)) {
    // Fall back to package.json "husky" field (classic v4 usage; deprecated but still seen).
    const pkgPath = join(rootDir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {husky?: unknown};
        if (pkg.husky) return {installed: true, hooks: [], note: 'legacy package.json#husky'};
      } catch {
        // ignore malformed package.json
      }
    }
    return {installed: false, hooks: []};
  }
  // Enumerate hook files (pre-commit, commit-msg, pre-push, …). Skip dot files.
  let hooks: string[] = [];
  try {
    if (statSync(dir).isDirectory()) {
      hooks = readdirSync(dir).filter(f => !f.startsWith('.') && !f.endsWith('.sh') && !f.endsWith('_'));
    }
  } catch {
    // ignore
  }
  return {installed: true, hooks};
}

export async function runDoctorCommand(context: CliContext): Promise<void> {
  section('lhx-cli doctor');
  const checks: Check[] = [];

  checks.push({
    name: 'Node version',
    ok: satisfies(process.versions.node, '>=18.18.0'),
    detail: `current ${process.versions.node}`,
    hint: 'Install Node >= 18.18.0'
  });

  checks.push({
    name: 'pnpm workspace',
    ok: existsSync(join(context.workspaceRoot, 'pnpm-workspace.yaml')),
    detail: context.workspaceRoot,
    hint: 'Run inside a pnpm workspace or create pnpm-workspace.yaml.'
  });

  const templates = await listBuiltinTemplates(context.templatesDir);
  checks.push({
    name: 'builtin templates',
    ok: templates.length > 0,
    detail: templates.map(tpl => tpl.name).join(', ') || '(none)',
    hint: 'Ensure @lhx-kit/cli ships templates.'
  });

  const {value, diagnostics} = await tryProject(context.cwd);
  const missingOnly = !value && diagnostics.every(d => d.code === 'project-config/missing');

  if (!value) {
    if (missingOnly) {
      checks.push({
        name: 'project config',
        ok: false,
        severity: 'warn',
        detail: 'not found',
        hint: 'Doctor is running outside a project; project-specific checks are skipped.'
      });
    } else {
      checks.push({
        name: 'project config',
        ok: false,
        severity: 'error',
        detail: 'invalid',
        hint: diagnostics.map(d => `${d.code}: ${d.message}`).join('; ')
      });
    }
    report(checks);
    return;
  }

  const {project, offline} = value;
  const cfg = project.config;

  checks.push({
    name: 'project config',
    ok: true,
    detail: `${cfg.name} (${project.file})`
  });

  // 1. Each page entry exists.
  for (const page of Object.values(cfg.pages)) {
    const entryAbs = toAbs(cfg.rootDir, page.entry);
    checks.push({
      name: `page entry: ${page.name}`,
      ok: existsSync(entryAbs),
      detail: entryAbs,
      hint: `Create ${page.entry} or remove the page from project.config.ts`
    });
  }

  // 2. Each alias target is an existing directory.
  for (const [alias, target] of Object.entries(cfg.aliases)) {
    const abs = toAbs(cfg.rootDir, target);
    const exists = existsSync(abs);
    const isDir = exists && statSync(abs).isDirectory();
    checks.push({
      name: `alias: ${alias}`,
      ok: exists && isDir,
      detail: `${target} → ${abs}`,
      hint: exists ? `${abs} is not a directory` : `Create ${target} or remove the alias`
    });
  }

  // 3. For each env, require apiBase when proxy is defined (best-effort sanity).
  for (const [mode, env] of Object.entries(cfg.envs)) {
    if (!env) continue;
    if (!env.apiBase) {
      checks.push({
        name: `env: ${mode}`,
        ok: true,
        severity: 'warn',
        detail: 'no apiBase',
        hint: 'Most templates rely on env.apiBase. Set it unless you handle request base URLs yourself.'
      });
    } else {
      checks.push({name: `env: ${mode}`, ok: true, detail: `apiBase=${env.apiBase}`});
    }
  }

  // 4. Linter / formatter / husky — all advisory (severity='warn' when missing).
  {
    const searchRoots = cfg.rootDir === context.workspaceRoot ? [cfg.rootDir] : [cfg.rootDir, context.workspaceRoot];
    const found = new Set<string>();
    for (const root of searchRoots) {
      for (const label of detectLinters(root)) found.add(label);
    }
    if (found.size > 0) {
      checks.push({name: 'linter / formatter', ok: true, detail: [...found].join(', ')});
    } else {
      checks.push({
        name: 'linter / formatter',
        ok: false,
        severity: 'warn',
        detail: 'none detected',
        hint: 'Add ESLint, Prettier, Biome, Oxlint, or Rslint config at the workspace root for consistent code style.'
      });
    }

    let husky = detectHusky(cfg.rootDir);
    if (!husky.installed && cfg.rootDir !== context.workspaceRoot) {
      husky = detectHusky(context.workspaceRoot);
    }
    if (husky.installed) {
      const detail = husky.hooks.length
        ? `hooks: ${husky.hooks.join(', ')}`
        : (husky.note ?? 'installed (no hook files)');
      checks.push({name: 'husky', ok: true, detail});
    } else {
      checks.push({
        name: 'husky',
        ok: false,
        severity: 'warn',
        detail: 'not installed',
        hint: 'Install husky + lint-staged to guard commits (`pnpm add -Dw husky lint-staged && pnpm husky init`).'
      });
    }
  }

  // 5. Offline cross-checks.
  if (offline) {
    const oc = offline.config;
    const pageNames = new Set(Object.keys(cfg.pages));
    const whitelist = oc.whitelistPages ?? [];
    const unknownWhitelist = whitelist.filter(name => !pageNames.has(name));
    checks.push({
      name: 'offline.whitelistPages ⊆ pages',
      ok: unknownWhitelist.length === 0,
      detail: unknownWhitelist.length ? `unknown: ${unknownWhitelist.join(', ')}` : whitelist.join(', ') || '(none)',
      hint: 'Remove unknown page names from offline.config.ts'
    });

    for (const rule of oc.prefetch ?? []) {
      const placeholders = extractPlaceholders(rule.apiUrl);
      const keys = new Set(rule.keys ?? []);
      const missing = placeholders.filter(p => !keys.has(p));
      checks.push({
        name: `prefetch: ${rule.name}`,
        ok: missing.length === 0,
        detail: missing.length ? `apiUrl placeholders missing keys: ${missing.join(', ')}` : rule.apiUrl,
        hint: 'Declare each ${var} placeholder under prefetch[].keys'
      });
    }
  } else if (cfg.offline?.enabled) {
    checks.push({
      name: 'offline config',
      ok: false,
      detail: 'project.offline.enabled is true but offline.config.ts is missing',
      hint: 'Create offline.config.ts next to project.config.ts'
    });
  }

  report(checks);
}

function report(checks: Check[]): void {
  let issues = 0;
  for (const check of checks) {
    if (check.ok) {
      success(`${check.name}: ${check.detail ?? ''}`);
      continue;
    }
    if (check.severity === 'warn') {
      warn(`${check.name}: ${check.detail ?? ''}`);
    } else {
      error(`${check.name}: ${check.detail ?? ''}`);
      issues += 1;
    }
    if (check.hint) muted(`  hint: ${check.hint}`);
  }
  if (issues > 0) {
    error(`Doctor found ${issues} issue(s).`);
    process.exitCode = 1;
  } else {
    success('Doctor passed.');
  }
  const missingProject = checks.find(c => c.name === 'project config' && !c.ok && c.severity === 'warn');
  if (missingProject) info('Project-specific checks were skipped.');
}
