/**
 * `lhx-cli add <kind> [name]` — generate one of:
 *   page | component | api | service | store | schema | module | package
 *
 * Every kind reads its template from `templates/_add/<kind>/...` (shipped with
 * the CLI package) and renders `<%= var %>` placeholders against per-kind
 * variables (name, Name, camelName, Title, …). The skip-if-exists semantics
 * apply uniformly: re-running `add` against an existing target leaves files
 * untouched and reports them as skipped, so the command is safely idempotent.
 *
 * `add package` is the odd one out — it operates on a pnpm monorepo's
 * `packages/` directory and does NOT require an lhx-kit project at the cwd.
 * All other kinds upsert into an existing project (project.config.ts /
 * src/<kind>/…).
 */
import {existsSync} from 'node:fs';
import os from 'node:os';
import {dirname, join} from 'node:path';
import fse from 'fs-extra';
import {addPageToProjectConfig, addWhitelistPage} from '../../ast/project-config';
import type {CommandDescriptor} from '../../core/command';
import type {CliContext} from '../../core/context';
import {type ResolvedProjectConfig, requireProject} from '../../core/project';
import {type CopyStubsEntry, copyStubs, renderStubFile} from '../../scaffold/templates';
import {toCamel, toPascal, toTitle} from '../../utils/string';
import {info, muted, section, success, warn} from '../../utils/ui';
import {
  type AddKind,
  ALL_KINDS,
  isInteractive,
  kebabOk,
  promptKind,
  promptName,
  promptPackageName,
  promptPageExtras
} from './prompts';

export type {AddKind};

export interface AddOptions {
  /** For `add page`: override the human-readable title. */
  title?: string;
  /** For `add page`: also register the page under offline whitelist. */
  offline?: boolean;
  /** For `add package`: description written into package.json. */
  description?: string;
  /** For `add package`: force overwrite if target dir exists. */
  force?: boolean;
  /** Non-interactive mode; all required args must come from the CLI. */
  yes?: boolean;
}

export async function runAddCommand(
  context: CliContext,
  kindArg: AddKind | undefined,
  nameArg: string | undefined,
  options: AddOptions = {}
): Promise<void> {
  let kind = kindArg;
  if (!kind) {
    if (options.yes || !isInteractive()) {
      throw new Error(`Missing <kind>. Provide one of: ${ALL_KINDS.join(' | ')}, or omit --yes to run interactively.`);
    }
    kind = await promptKind();
  }
  if (!ALL_KINDS.includes(kind)) {
    throw new Error(`Unsupported add kind "${kind}". Available: ${ALL_KINDS.join(' | ')}`);
  }

  // `add package` works without a project config — it scaffolds a new
  // workspace under `<repoRoot>/packages/<name>`.
  if (kind === 'package') {
    let pkgName = nameArg;
    if (!pkgName) {
      if (options.yes || !isInteractive()) {
        throw new Error('Missing <name> for `add package`. Example: lhx-cli add package my-pkg');
      }
      pkgName = await promptPackageName();
    }
    await addPackage(context, pkgName, options);
    return;
  }

  // All other kinds upsert into the active project.
  const {project, offline} = await requireProject(context.cwd);
  const cfg = project.config;
  const framework = cfg.framework;

  let name = nameArg;
  if (!name) {
    if (options.yes || !isInteractive()) {
      throw new Error(`Missing <name> for \`add ${kind}\`.`);
    }
    const existingPages = new Set(Object.keys(cfg.pages));
    name = await promptName(kind, kind === 'page' ? existingPages : undefined);
  }

  // For `add page`, also offer title + offline prompts when running
  // interactively and neither was passed on the CLI.
  let effectiveOptions: AddOptions = options;
  if (kind === 'page' && !options.yes && isInteractive() && !options.title && options.offline === undefined) {
    const extras = await promptPageExtras();
    effectiveOptions = {...options, ...extras};
  }

  switch (kind) {
    case 'page':
      await addPage(context, project, offline?.file ?? null, name, effectiveOptions);
      return;
    case 'component':
      await addComponent(context, cfg, name);
      return;
    case 'api':
      await addSimpleStub(context, cfg, {
        kind: 'api',
        targetRel: `${cfg.srcDir}/api/${name}.ts`,
        stubRel: 'api/api.ts.template',
        name
      });
      return;
    case 'service':
      await addSimpleStub(context, cfg, {
        kind: 'service',
        targetRel: `${cfg.srcDir}/services/${name}.ts`,
        stubRel: 'service/service.ts.template',
        name
      });
      return;
    case 'store':
      await addSimpleStub(context, cfg, {
        kind: 'store',
        targetRel: `${cfg.srcDir}/stores/${name}.ts`,
        stubRel: framework === 'react' ? 'store/react/store.ts.template' : 'store/vue/store.ts.template',
        name
      });
      return;
    case 'schema': {
      // New canonical location: `src/pages/<name>/render.json`. If the page
      // directory already exists we write there; otherwise we fall back to
      // the legacy `src/schemas/<name>.json` so users migrating existing
      // projects aren't surprised by a missing folder.
      const pageDirAbs = join(cfg.rootDir, `${cfg.pagesDir}/${name}`);
      const targetRel = existsSync(pageDirAbs)
        ? `${cfg.pagesDir}/${name}/render.json`
        : `${cfg.srcDir}/schemas/${name}.json`;
      await addSimpleStub(context, cfg, {
        kind: 'schema',
        targetRel,
        stubRel: 'schema/schema.json.template',
        name
      });
      return;
    }
    case 'module':
      await addSimpleStub(context, cfg, {
        kind: 'module',
        targetRel: `${cfg.srcDir}/modules/${name}.ts`,
        stubRel: 'module/module.ts.template',
        name
      });
      return;
  }
}

/* --------------------------- page --------------------------- */

async function addPage(
  context: CliContext,
  project: {file: string; config: ResolvedProjectConfig},
  offlineFilePath: string | null,
  name: string,
  options: AddOptions
): Promise<void> {
  const cfg = project.config;
  const isReact = cfg.framework === 'react';
  section(`add page ${name}`);

  const vars = {
    name,
    Name: toPascal(name),
    camelName: toCamel(name),
    Title: options.title ?? toTitle(name)
  };
  const pageRel = `${cfg.pagesDir}/${name}`;
  const pageRoot = join(cfg.rootDir, pageRel);

  // 1. Scaffold the framework-specific entry/router/views.
  //    Layout (both frameworks):
  //      src/pages/<name>/
  //        ├── entry.(ts|tsx)        — bootstrap + mount router
  //        ├── router.(ts|tsx)       — HashRouter with / and /about routes
  //        ├── render.json           — renderer schema for the landing view (step 2)
  //        └── views/
  //            ├── <Name>Landing.(vue|tsx)
  //            └── <Name>About.(vue|tsx)
  const frameworkStubDir = join(context.templatesDir, '_add', 'page', isReact ? 'react' : 'vue');
  const frameworkEntries = await copyStubs({sourceDir: frameworkStubDir, targetDir: pageRoot, variables: vars});

  // 2. Scaffold the shared render.json. Lives next to the per-framework
  //    files but is identical across vue/react, so it sits at `_add/page/`.
  const renderStubFile = join(context.templatesDir, '_add', 'page', 'render.json.template');
  const renderEntry = await writeStubIfMissing(renderStubFile, join(pageRoot, 'render.json'), vars);

  const entries: CopyStubsEntry[] = [...frameworkEntries, {rel: 'render.json', ...renderEntry}];
  let createdCount = 0;
  let skippedCount = 0;
  for (const entry of entries) {
    const fullRel = `${pageRel}/${entry.rel}`;
    if (entry.created) {
      success(`created ${fullRel}`);
      createdCount += 1;
    } else {
      muted(`skipped (exists): ${fullRel}`);
      skippedCount += 1;
    }
  }
  if (createdCount === 0 && skippedCount === entries.length) {
    warn(`page "${name}" already fully scaffolded on disk; skipping file generation.`);
  }

  // 3. Upsert into project.config.ts. ts-morph preserves existing fields
  //    if the page is already registered.
  const added = await addPageToProjectConfig(project.file, name, {
    title: options.title ?? toTitle(name),
    offline: options.offline
  });
  if (added) success(`registered page "${name}" in ${relativeToCwd(context, project.file)}`);
  else muted(`page "${name}" already in project.config.ts`);

  // 4. Optionally extend offline whitelist.
  if (options.offline && offlineFilePath) {
    const result = await addWhitelistPage(offlineFilePath, name);
    if (result.updated) {
      success(`added "${name}" to offline.whitelistPages`);
    } else if (result.reason === 'already-present') {
      muted(`"${name}" already in offline.whitelistPages`);
    } else {
      warn(`could not update offline.config.ts (${result.reason}); please add "${name}" to whitelistPages manually.`);
    }
  } else if (options.offline && !offlineFilePath) {
    warn('--offline was passed but no offline.config.ts was found; page flag is set but no whitelist to update.');
  }

  info(`next: \`lhx-cli dev --page=${name}\` to preview, edit \`${pageRel}/render.json\` to tweak the schema`);
}

/* --------------------------- component --------------------------- */

async function addComponent(context: CliContext, cfg: ResolvedProjectConfig, name: string): Promise<void> {
  section(`add component ${name}`);
  const isReact = cfg.framework === 'react';
  const ext = isReact ? 'tsx' : 'vue';
  const targetRel = `${cfg.srcDir}/components/${toPascal(name)}.${ext}`;
  const targetAbs = join(cfg.rootDir, targetRel);
  const stubRel = isReact ? 'component/react/component.tsx.template' : 'component/vue/component.vue.template';
  const stub = join(context.templatesDir, '_add', stubRel);
  const vars = {name, Name: toPascal(name), camelName: toCamel(name), Title: toTitle(name)};
  const {created} = await writeStubIfMissing(stub, targetAbs, vars);
  if (created) success(`created ${targetRel}`);
  else warn(`file already exists: ${targetRel}`);
}

/* ----------------- single-file kinds (api/service/store/schema/module) ----------------- */

interface SimpleStubArgs {
  kind: AddKind;
  /** Destination path relative to the project root. */
  targetRel: string;
  /** Stub path relative to `<templatesDir>/_add/`. */
  stubRel: string;
  name: string;
}

async function addSimpleStub(context: CliContext, cfg: ResolvedProjectConfig, args: SimpleStubArgs): Promise<void> {
  section(`add ${args.targetRel}`);
  const stub = join(context.templatesDir, '_add', args.stubRel);
  const targetAbs = join(cfg.rootDir, args.targetRel);
  const vars = {
    name: args.name,
    Name: toPascal(args.name),
    camelName: toCamel(args.name),
    Title: toTitle(args.name)
  };
  const {created} = await writeStubIfMissing(stub, targetAbs, vars);
  if (created) success(`created ${args.targetRel}`);
  else warn(`file already exists: ${args.targetRel}`);
}

/* --------------------------- add package --------------------------- */

/**
 * Locate the nearest monorepo root (has both `pnpm-workspace.yaml` and a
 * `packages/` directory) by walking up from cwd. Returns null when not in a
 * monorepo — `addPackage` then falls back to an advisory message instead of
 * throwing, since users might run `lhx-cli add package` inside a regular
 * project by mistake and deserve clear guidance.
 */
function findMonorepoRoot(startDir: string): string | null {
  let dir = startDir;
  // Walk up at most 10 levels — enough for any realistic nesting.
  for (let i = 0; i < 10; i += 1) {
    const workspaceYaml = join(dir, 'pnpm-workspace.yaml');
    const packagesDir = join(dir, 'packages');
    if (existsSync(workspaceYaml) && existsSync(packagesDir)) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break; // reached fs root
    dir = parent;
  }
  return null;
}

/**
 * Scaffold a new publishable workspace under `packages/<name>`.
 *
 * Creates a minimal TS library pre-wired for the lhx-kit monorepo conventions:
 *   - package.json with correct `@<scope>/<name>` identity, ESM exports,
 *     `files` allowlist, `publishConfig.access=public`, tsup + typecheck
 *     scripts, workspace-level devDependencies on `@<scope>/tsconfig`.
 *   - tsconfig.json extending `@<scope>/tsconfig/library.json`.
 *   - tsup.config.ts using our standard ESM dual-build settings.
 *   - src/index.ts with a starter named export.
 *   - README.md + README.zh-CN.md skeletons that mention install + link back
 *     to the docs site.
 *   - LICENSE referencing MIT (Changesets will use this on publish).
 *
 * NOT created:
 *   - CHANGELOG.md — owned by Changesets. Writing one here would confuse
 *     `changeset version` into treating it as a stale changelog file.
 *   - tests/ — intentional; keep the starter minimal. Users can add after.
 *
 * Post-scaffold, the function nudges the user toward the three follow-ups
 * that every new package needs (pnpm install, write changeset, configure
 * Trusted Publisher on first publish).
 */
async function addPackage(context: CliContext, name: string, options: AddOptions): Promise<void> {
  section(`add package ${name}`);

  if (!kebabOk(name)) {
    throw new Error(`Package name "${name}" must be lowercase kebab-case (e.g. "my-pkg").`);
  }

  const repoRoot = findMonorepoRoot(context.cwd);
  if (!repoRoot) {
    warn('add package: not running inside a pnpm monorepo.');
    info('Detected missing `pnpm-workspace.yaml` or `packages/` up from cwd.');
    info('');
    info('This command scaffolds a workspace under packages/<name>/. You probably want:');
    info('  • For a single-app project:        lhx-cli add module <name>');
    info('  • For a brand-new project:         lhx-cli create <name>');
    info('  • If you DO want a monorepo here:  cd into its root first, then retry.');
    throw new Error('add package requires a pnpm monorepo root.');
  }

  const pkgDir = join(repoRoot, 'packages', name);
  if (existsSync(pkgDir)) {
    if (options.force) {
      warn(`packages/${name} already exists — overwriting because --force is set.`);
      await fse.remove(pkgDir);
    } else {
      throw new Error(`packages/${name} already exists. Pass --force to overwrite.`);
    }
  }

  // Infer the scope from the root package.json's name when it's scoped;
  // otherwise default to @lhx-kit. This lets forks use their own scope
  // without having to patch the CLI.
  const rootPkgPath = join(repoRoot, 'package.json');
  let scope = '@lhx-kit';
  if (existsSync(rootPkgPath)) {
    try {
      const rootPkg = JSON.parse(await fse.readFile(rootPkgPath, 'utf8')) as {name?: string};
      if (rootPkg.name?.startsWith('@')) {
        scope = rootPkg.name.split('/')[0];
      }
    } catch {
      // ignore; fall back to default scope
    }
  }

  const fullName = `${scope}/${name}`;
  const description = options.description ?? `${fullName} package (scaffolded by lhx-cli add package).`;
  const vars = {
    name,
    fullName,
    scope,
    Name: toPascal(name),
    camelName: toCamel(name),
    description,
    licenseYear: String(new Date().getFullYear()),
    licenseHolder: os.userInfo().username
  };

  const stubDir = join(context.templatesDir, '_add', 'package');
  const entries = await copyStubs({sourceDir: stubDir, targetDir: pkgDir, variables: vars});
  for (const entry of entries) {
    if (entry.created) success(`created packages/${name}/${entry.rel}`);
    else muted(`skipped (exists): packages/${name}/${entry.rel}`);
  }

  section('next steps');
  info('  1. pnpm install                                   ← link the new workspace');
  info(`  2. cd packages/${name} && pnpm build                 ← verify dist/ is produced`);
  info('  3. pnpm changeset                                 ← declare intent before first publish');
  info('  4. (one-time, per package) configure npm Trusted Publisher:');
  info(`       https://www.npmjs.com/package/${fullName}/access`);
  info('');
  muted('See https://juwenzhang.github.io/lhx-kit/engineering/release-pipeline for the full flow.');
}

/* --------------------------- helpers --------------------------- */

async function writeStubIfMissing(
  stubFile: string,
  destAbs: string,
  vars: Record<string, unknown>
): Promise<{created: boolean}> {
  if (existsSync(destAbs)) return {created: false};
  await fse.ensureDir(dirname(destAbs));
  const body = await renderStubFile(stubFile, vars);
  await fse.writeFile(destAbs, body);
  return {created: true};
}

function relativeToCwd(context: CliContext, absolute: string): string {
  const cwd = context.cwd;
  if (absolute.startsWith(cwd)) {
    return absolute.slice(cwd.length + 1);
  }
  return absolute;
}

export const addCommand: CommandDescriptor = {
  name: 'add [kind] [name]',
  description: 'Generate a page / component / api / service / store / schema / module / package',
  options: [
    {flags: '--title <title>', description: 'For `add page`: display title'},
    {flags: '--offline', description: 'For `add page`: mark the page offline and add to offline.whitelistPages'},
    {flags: '--description <text>', description: 'For `add package`: short description written into package.json'},
    {flags: '--force', description: 'For `add package`: overwrite target directory if it already exists'},
    {flags: '--yes', description: 'Non-interactive mode (require all arguments to be provided)'}
  ],
  run: (context, kind, name, options) =>
    runAddCommand(context, kind as AddKind | undefined, name as string | undefined, options as AddOptions)
};
