import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {execa} from 'execa';
import fse from 'fs-extra';
import {bold} from 'kolorist';
import prompts from 'prompts';
import type {CommandDescriptor} from '../core/command';
import type {CliContext} from '../core/context';
import {type PackageManager, printHandoff} from '../scaffold/post-scaffold';
import {
  applyFeature,
  copyTemplateDir,
  listBuiltinTemplates,
  loadFeaturesForTemplate,
  readTemplateSource,
  renderString,
  resolveSharedDir,
  type TemplateManifest,
  type TemplateVariables
} from '../scaffold/templates';
import {
  DEFAULT_INTERNAL_PACKAGE_PREFIXES,
  resolveLhxKitDepsPerPackage,
  resolveLhxKitVersionRange,
  type VersionStrategy
} from '../scaffold/version-resolver';
import {runWizard, type WizardAnswers} from '../scaffold/wizard';
import {toKebab, toPascalGlobal} from '../utils/string';
import {info, section, success, warn} from '../utils/ui';

export type TargetMode = 'pc' | 'mobile' | 'hybrid';

export interface CreateOptions {
  template?: string;
  features?: string;
  title?: string;
  /**
   * Frontend deployment target. Maps to a feature in the `target` mutex group:
   * `pc` → `target-pc`, `mobile` → `target-mobile`, `hybrid` → `target-hybrid` (default).
   * Ignored for non-frontend templates.
   */
  target?: TargetMode;
  /** CSS preprocessor: `less` (default) | `sass` | `none`. */
  cssPreprocessor?: 'less' | 'sass' | 'none';
  /** CSS atomic system: `unocss` (default) | `tailwind` | `none`. */
  cssAtomic?: 'unocss' | 'tailwind' | 'none';
  /** Component-level styling: `modules` (default) | `styled` | `vanilla-extract`. */
  cssStyling?: 'modules' | 'styled' | 'vanilla-extract';
  yes?: boolean;
  force?: boolean;
  /**
   * When true, rewrite every `@lhx-kit/*` dependency version in the generated
   * package.json to `workspace:*`. Used to scaffold demos/examples inside this
   * monorepo without publishing the kit packages.
   */
  linkWorkspace?: boolean;
  /**
   * Skip all automatic post-create actions (install deps, run typegen, git
   * init). Useful for CI snapshot tests or when users want to manage these
   * steps themselves.
   */
  skipInstall?: boolean;
  /** Package manager to use for install. Defaults to `pnpm`. */
  packageManager?: 'pnpm' | 'npm' | 'yarn';
  /** Skip `git init`. */
  skipGit?: boolean;
  /**
   * Strategy for resolving `@lhx-kit/*` dependency versions in the generated
   * `package.json`. Defaults to `'auto'` (probe `npm view @lhx-kit/cli version`
   * and use the caret-minor of the result; fall back to `local` on failure).
   * Use `'local'` to skip the network probe or pass an explicit range like
   * `^1.2.0` to pin a specific kit version.
   *
   * Ignored when `--link-workspace` is set (the rewrite step takes precedence).
   */
  lhxVersion?: VersionStrategy;
}

/**
 * Apply the "default + flag + explicit feature" reconciliation to a single
 * mutex group (target, css-preprocessor, css-atomic, css-styling). Throws
 * when a flag and an explicit feature disagree — silent precedence is more
 * confusing than a loud error.
 */
function resolveAxisFeature(features: string[], prefix: string, flag: string | undefined, fallback: string): string[] {
  const explicit = features.find(f => f.startsWith(prefix));
  if (flag && explicit && explicit !== `${prefix}${flag}`) {
    throw new Error(`flag --${prefix.replace(/-$/, '')} disagrees with feature ${explicit}; pick one`);
  }
  if (explicit) return features;
  return [...features, `${prefix}${flag ?? fallback}`];
}

function validateCssCompat(features: string[], manifest: TemplateManifest): void {
  const isReact = manifest.framework === 'react' || manifest.name === 'react-mpa';
  if (features.includes('css-styling-styled') && !isReact) {
    throw new Error(`css-styling-styled is React-only — incompatible with template ${manifest.name}`);
  }
}

interface LibScaffoldVars {
  libBundlerName: string;
  libFormats: string;
  libFormatsHumanList: string;
  libFormatsTsupLiteral: string;
  libFormatsRollupOutputsLiteral: string;
  libFormatsRslibLiteral: string;
  libUmdGlobalName: string;
}

/**
 * Derive bundler / format literals from the resolved feature list. The literals
 * are embedded directly into the bundler config templates (tsup / rslib /
 * rollup) so users get the right `format` array for their selection without a
 * full template-engine. Returns sensible empty defaults for non-library
 * templates so token substitution stays a no-op.
 */
function buildLibScaffoldVars(features: string[], packageName: string): LibScaffoldVars {
  const bundlerFeature = features.find(f => f.startsWith('bundler-'));
  const libBundlerName = bundlerFeature ? bundlerFeature.replace(/^bundler-/, '') : '';

  const formatFeatures = features.filter(f => f.startsWith('format-'));
  const formats = formatFeatures.map(f => f.replace(/^format-/, ''));
  // Stable order so generated configs read consistently.
  const order = ['esm', 'cjs', 'umd'] as const;
  const ordered = order.filter(f => formats.includes(f));

  const libFormats = ordered.join(',');
  const libFormatsHumanList = ordered.length === 0 ? 'none' : ordered.join(' + ');

  const libFormatsTsupLiteral = ordered.length === 0 ? "['esm']" : `[${ordered.map(f => `'${f}'`).join(', ')}]`;

  const libUmdGlobalName = toPascalGlobal(packageName);

  // Rollup outputs: one entry per format, with idiomatic file extensions.
  const rollupOutputs = ordered.map(f => {
    if (f === 'esm') return `{file: 'dist/index.mjs', format: 'es', sourcemap: true}`;
    if (f === 'cjs') return `{file: 'dist/index.cjs', format: 'cjs', sourcemap: true, exports: 'named'}`;
    return `{file: 'dist/index.umd.js', format: 'umd', sourcemap: true, name: '${libUmdGlobalName}'}`;
  });
  const libFormatsRollupOutputsLiteral =
    rollupOutputs.length === 0
      ? `[{file: 'dist/index.mjs', format: 'es', sourcemap: true}]`
      : `[\n      ${rollupOutputs.join(',\n      ')}\n    ]`;

  // rslib lib entries: each format becomes a lib config block.
  const rslibEntries = ordered.map(f => {
    if (f === 'esm') return `{format: 'esm', dts: true, output: {distPath: {root: './dist'}}}`;
    if (f === 'cjs') return `{format: 'cjs', output: {distPath: {root: './dist'}}}`;
    return `{format: 'umd', umdName: '${libUmdGlobalName}', output: {distPath: {root: './dist'}}}`;
  });
  const libFormatsRslibLiteral =
    rslibEntries.length === 0
      ? `[{format: 'esm', dts: true, output: {distPath: {root: './dist'}}}]`
      : `[\n    ${rslibEntries.join(',\n    ')}\n  ]`;

  return {
    libBundlerName,
    libFormats,
    libFormatsHumanList,
    libFormatsTsupLiteral,
    libFormatsRollupOutputsLiteral,
    libFormatsRslibLiteral,
    libUmdGlobalName
  };
}

export async function runCreateCommand(
  context: CliContext,
  projectName: string | undefined,
  options: CreateOptions
): Promise<void> {
  const templates = await listBuiltinTemplates(context.templatesDir);
  let templateRef = options.template;
  let resolvedName = projectName;
  let wizardAnswers: WizardAnswers | undefined;

  // Interactive wizard fires whenever (a) the user did NOT pass --yes AND
  // (b) at least one prompt-worthy field is missing from the flag set. In
  // mixed-mode (some flags present), the wizard skips the supplied steps and
  // only prompts for what's missing.
  const featuresFromFlag = options.features
    ? options.features
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    : undefined;
  const needsWizard = !options.yes && (!resolvedName || !templateRef || featuresFromFlag === undefined);

  if (needsWizard) {
    wizardAnswers = await runWizard({
      partial: {
        projectName: resolvedName,
        template: templateRef,
        target: options.target,
        features: featuresFromFlag,
        packageManager: options.packageManager
      },
      templates
    });
    resolvedName = wizardAnswers.projectName;
    templateRef = wizardAnswers.template;
  }

  if (!resolvedName) throw new Error('Missing project name');
  if (!templateRef) templateRef = templates[0]?.name;
  if (!templateRef) throw new Error('No templates available');

  const targetDir = resolve(context.cwd, resolvedName);
  if (existsSync(targetDir) && !options.force) {
    const isEmpty = (await fse.readdir(targetDir)).length === 0;
    if (!isEmpty) {
      if (options.yes) throw new Error(`Directory not empty: ${targetDir}`);
      const confirm = await prompts(
        {
          type: 'confirm',
          name: 'value',
          message: `Directory ${targetDir} is not empty. Overwrite?`,
          initial: false
        },
        {onCancel: () => process.exit(1)}
      );
      if (!confirm.value) process.exit(1);
      await fse.emptyDir(targetDir);
    }
  }

  const templateSource = await readTemplateSource(context.templatesDir, templateRef);
  let features: string[] = wizardAnswers?.features ?? featuresFromFlag ?? [];
  if (options.yes && !featuresFromFlag) {
    features = (templateSource.manifest.features || []).filter(f => f.defaultEnabled).map(f => f.name);
  }
  // Wizard already prompted for target — fold it back into the flag-shape so
  // the downstream resolver doesn't need to know about wizard answers.
  if (wizardAnswers?.target) options.target = wizardAnswers.target;

  // Frontend templates: every project must select exactly one `target` feature.
  // The CLI auto-injects target-hybrid when neither --target nor an explicit
  // target-* feature is supplied — keeps `lhx create -t vue3-mpa --yes` flowing
  // without forcing the user to memorize the target dimension.
  if (templateSource.manifest.category === 'frontend' || templateSource.manifest.framework) {
    const targetFlag: TargetMode | undefined = options.target;
    const explicitTarget = features.find(f => f.startsWith('target-'));
    if (targetFlag && explicitTarget && explicitTarget !== `target-${targetFlag}`) {
      throw new Error(`--target=${targetFlag} conflicts with feature ${explicitTarget}; pick one or the other`);
    }
    if (!explicitTarget) {
      const chosenTarget: TargetMode = targetFlag ?? 'hybrid';
      features = [...features, `target-${chosenTarget}`];
    }
    // `offline` is opt-in only as of 2026-05 — previously auto-enabled by
    // target=hybrid, which leaked offline tooling into admin / desktop
    // scaffolds whose `target=hybrid` just meant "responsive". Users who
    // need offline packaging now pass `--features=offline` explicitly.

    // CSS axes — same shape as target. One feature per mutex group, default
    // injected when neither flag nor explicit feature was supplied. Mismatch
    // between flag and feature is a hard error to prevent silent overrides.
    const wizardCssPre = wizardAnswers?.cssPreprocessor;
    const wizardCssAtomic = wizardAnswers?.cssAtomic;
    const wizardCssStyling = wizardAnswers?.cssStyling;

    features = resolveAxisFeature(features, 'css-pre-', options.cssPreprocessor ?? wizardCssPre, 'less');
    features = resolveAxisFeature(features, 'css-atomic-', options.cssAtomic ?? wizardCssAtomic, 'unocss');
    features = resolveAxisFeature(features, 'css-styling-', options.cssStyling ?? wizardCssStyling, 'modules');

    // Compatibility narrowing: emotion/styled are React-only; vue-scoped is Vue-only.
    validateCssCompat(features, templateSource.manifest);
  }

  // Library templates: inject the default bundler (tsup) and at least one
  // format (esm) when the user didn't specify either via flag/feature. The
  // bundler axis is mutex; format is multi-select so only the absence-of-any
  // case gets a default.
  if (templateSource.manifest.category === 'library') {
    const explicitBundler = features.find(f => f.startsWith('bundler-'));
    if (!explicitBundler) features = [...features, 'bundler-tsup'];
    const hasAnyFormat = features.some(f => f.startsWith('format-'));
    if (!hasAnyFormat) features = [...features, 'format-esm'];
  }

  // Backend templates: default to pg + redis when no db/cache feature is
  // provided. Micro templates have Redis built-in (not a feature), so only
  // the db axis gets a default injection for them.
  const isMicroTemplate = templateSource.manifest.name === 'micro';
  if (templateSource.manifest.category === 'backend') {
    const hasAnyDb = features.some(f => f.startsWith('db-'));
    if (!hasAnyDb) features = [...features, 'db-pg'];
    if (!isMicroTemplate) {
      const hasAnyCache = features.some(f => f.startsWith('cache-'));
      if (!hasAnyCache) features = [...features, 'cache-redis'];
    }
  }

  // Resolve `@lhx-kit/*` dep version range. When --link-workspace is set,
  // the local CLI version is fine — the rewrite step replaces every range
  // with `workspace:*` afterward. Otherwise (real users), default to `auto`
  // which queries `npm view @lhx-kit/cli` and uses the latest published
  // version. Falls back gracefully to local when offline.
  const versionStrategy: VersionStrategy = options.linkWorkspace ? 'local' : (options.lhxVersion ?? 'auto');
  const lhxKitVersionRange = await resolveLhxKitVersionRange({
    strategy: versionStrategy,
    localRange: context.lhxKitVersionRange,
    onResolved: ({chosen, range, reason}) => {
      if (chosen === 'auto') info(`@lhx-kit/* version range: ${range} (${reason ?? 'auto'})`);
      else if (chosen === 'local' && reason) warn(reason);
    }
  });

  const packageName = toKebab(resolvedName);
  const libVars = buildLibScaffoldVars(features, packageName);

  const variables: TemplateVariables = {
    projectName: resolvedName,
    packageName,
    appTitle: options.title || resolvedName,
    features,
    year: new Date().getFullYear(),
    lhxKitVersionRange,
    ...libVars
  };

  section(`Creating ${bold(resolvedName)} from ${bold(templateSource.manifest.title)}`);
  await fse.ensureDir(targetDir);

  // Optional shared layer: copied first so template files can override and
  // append-mode files (.gitignore) accumulate the right rules.
  if (templateSource.manifest.extends === '_shared') {
    const sharedDir = resolveSharedDir(context.templatesDir);
    if (sharedDir) {
      const sharedFiles = await copyTemplateDir({sourceDir: sharedDir, targetDir, variables});
      info(`shared layer: ${sharedFiles.length} file(s)`);
    } else {
      warn('template extends _shared but the shared layer is missing on disk');
    }
  }

  const baseFiles = await copyTemplateDir({
    sourceDir: resolve(templateSource.directory, 'files'),
    targetDir,
    variables
  });
  info(`base files: ${baseFiles.length}`);

  // New manifest-driven feature pipeline: features under <template>/features
  // OR _features/ (cross-template) that ship a feature.json get applied via
  // the priority-sorted, anchor-validated path. Legacy features without a
  // manifest fall through to the original "copy patchDir verbatim" flow.
  const manifestFeatures = await loadFeaturesForTemplate(
    context.templatesDir,
    templateSource.directory,
    templateSource.manifest.name,
    features
  );
  const consumedByManifest = new Set(manifestFeatures.map(f => f.name));
  for (const feature of manifestFeatures) {
    const written = await applyFeature({
      feature,
      targetDir,
      variables,
      templateName: templateSource.manifest.name
    });
    info(`feature ${feature.name}: ${written.length} file(s) [priority ${feature.manifest.priority}]`);
  }

  for (const feature of templateSource.manifest.features || []) {
    if (!features.includes(feature.name)) continue;
    if (consumedByManifest.has(feature.name)) continue;
    const patchDir = resolve(templateSource.directory, feature.patchDir || `features/${feature.name}`);
    if (!existsSync(patchDir)) {
      warn(`feature patch missing: ${feature.name}`);
      continue;
    }
    const patched = await copyTemplateDir({sourceDir: patchDir, targetDir, variables});
    info(`feature ${feature.name}: ${patched.length} file(s) [legacy]`);
  }

  // Resolve which scope prefixes count as "internal" for this template.
  // Templates can extend the default set (@lhx-kit/, @lhx-cli/, @lhx-business/)
  // via `template.json#internalPackagePrefixes` so business / micro-frontend
  // monorepos can dynamically resolve their own scopes too.
  const templateInternalPrefixes = (templateSource.manifest as TemplateManifest & {internalPackagePrefixes?: string[]})
    .internalPackagePrefixes;
  const internalPrefixes: readonly string[] =
    templateInternalPrefixes && templateInternalPrefixes.length > 0
      ? Array.from(new Set([...DEFAULT_INTERNAL_PACKAGE_PREFIXES, ...templateInternalPrefixes]))
      : DEFAULT_INTERNAL_PACKAGE_PREFIXES;

  if (options.linkWorkspace) {
    const changed = await rewriteInternalDepsToWorkspace(targetDir, internalPrefixes);
    if (changed)
      info(`rewrote internal-scope deps (${internalPrefixes.join(', ')}) to workspace:* (via --link-workspace)`);
  } else {
    // Per-package dynamic resolution: query `npm view` for each individual
    // internal-scope dep so each one gets its actual latest version, not a
    // single CLI-derived range. Cached across deps so the network cost is
    // bounded; in linked-publish mode all kit packages share the same range.
    const pkgPath = resolve(targetDir, 'package.json');
    if (existsSync(pkgPath)) {
      const original = (await fse.readJson(pkgPath)) as Record<string, unknown>;
      const rewritten = await resolveLhxKitDepsPerPackage(original, {
        strategy: versionStrategy,
        fallbackRange: lhxKitVersionRange,
        internalPrefixes,
        onResolvedDep: ({name, range, source}) => {
          if (source === 'auto') info(`  ${name} → ${range}`);
        }
      });
      if (JSON.stringify(rewritten) !== JSON.stringify(original)) {
        await fse.writeJson(pkgPath, rewritten, {spaces: 2});
      }
    }
  }

  success(`Project created at ${targetDir}`);

  // --- Automatic initialisation -------------------------------------------------
  // The manifest's `postCreate` entries are treated as hints for the user; the
  // items below are the actions we run automatically so the generated project is
  // ready to `pnpm dev` right away (deps installed, typegen files produced, git
  // initialised). Each step is best-effort: a failure only warns, never aborts.
  const autoSteps = resolveAutoInitSteps(options);
  if (autoSteps.install) {
    await runInstallStep(targetDir, autoSteps.packageManager);
  }
  if (autoSteps.git) {
    await runGitInitStep(targetDir);
  }

  // The legacy `postCreate` strings are kept for templates that still ship them
  // (back-compat for any local/remote template not on the new shape). Templates
  // that opted into `_shared/` (the new layout) rely on `printHandoff` below
  // for the friendly footer instead — printing both would just be duplication.
  const usesNewHandoff = templateSource.manifest.extends === '_shared';
  if (!usesNewHandoff && templateSource.manifest.postCreate?.length) {
    section('Next steps');
    for (const step of templateSource.manifest.postCreate) {
      info(renderString(step, variables));
    }
  }

  printHandoff({
    projectName: resolvedName,
    projectPath: targetDir,
    template: templateSource.manifest.name,
    packageManager: ((wizardAnswers?.packageManager ?? autoSteps.packageManager) as PackageManager) ?? 'pnpm',
    features,
    cwd: context.cwd
  });
}

interface AutoInitSteps {
  install: boolean;
  git: boolean;
  packageManager: 'pnpm' | 'npm' | 'yarn';
}

function resolveAutoInitSteps(options: CreateOptions): AutoInitSteps {
  return {
    install: options.skipInstall !== true,
    git: options.skipGit !== true,
    packageManager: options.packageManager ?? 'pnpm'
  };
}

async function runInstallStep(targetDir: string, pm: 'pnpm' | 'npm' | 'yarn'): Promise<void> {
  section(`Installing dependencies with ${pm}`);
  try {
    await execa(pm, ['install'], {cwd: targetDir, stdio: 'inherit'});
    success('dependencies installed');
  } catch (err) {
    warn(`install failed: ${(err as Error).message}`);
    warn(`you can retry manually:  cd ${targetDir} && ${pm} install`);
  }
}

async function runGitInitStep(targetDir: string): Promise<void> {
  if (existsSync(resolve(targetDir, '.git'))) return;
  try {
    await execa('git', ['init', '--initial-branch=main'], {cwd: targetDir, stdio: 'ignore'});
    await execa('git', ['add', '-A'], {cwd: targetDir, stdio: 'ignore'});
    // Commit is best-effort: it requires user.name/email; if missing, skip silently.
    try {
      await execa('git', ['commit', '-m', 'chore: initial commit'], {cwd: targetDir, stdio: 'ignore'});
    } catch {
      /* no-op: likely missing git identity */
    }
    info('git repository initialised');
  } catch (err) {
    warn(`git init skipped: ${(err as Error).message}`);
  }
}

/**
 * Helper for in-monorepo scaffolding: rewrite every internal-scope dependency
 * (any name matching one of `prefixes`) to `workspace:*`. Idempotent.
 */
async function rewriteInternalDepsToWorkspace(targetDir: string, prefixes: readonly string[]): Promise<boolean> {
  const pkgPath = resolve(targetDir, 'package.json');
  if (!existsSync(pkgPath)) return false;
  const pkg = (await fse.readJson(pkgPath)) as Record<string, unknown>;
  let changed = false;
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
    const deps = pkg[field];
    if (!deps || typeof deps !== 'object') continue;
    const entries = deps as Record<string, string>;
    for (const [name, version] of Object.entries(entries)) {
      const isInternal = prefixes.some(prefix => name.startsWith(prefix));
      if (isInternal && version !== 'workspace:*') {
        entries[name] = 'workspace:*';
        changed = true;
      }
    }
  }
  if (changed) await fse.writeJson(pkgPath, pkg, {spaces: 2});
  return changed;
}

export const createCommand: CommandDescriptor = {
  name: 'create [name]',
  description: 'Scaffold a new project from a built-in or remote template',
  options: [
    {flags: '-t, --template <template>', description: 'Built-in name, local path, or giget source (gh:user/repo#ref)'},
    {flags: '--features <list>', description: 'Comma-separated feature names'},
    {flags: '--target <mode>', description: 'Frontend deploy target: pc | mobile | hybrid (default hybrid)'},
    {flags: '--css-preprocessor <pre>', description: 'CSS preprocessor: less (default) | sass | none'},
    {flags: '--css-atomic <atomic>', description: 'CSS atomic system: unocss (default) | tailwind | none'},
    {
      flags: '--css-styling <styling>',
      description: 'CSS styling: modules (default) | emotion | styled | vanilla-extract | vue-scoped | none'
    },
    {flags: '--title <title>', description: 'Human-readable project title'},
    {flags: '--yes', description: 'Non-interactive mode (skip prompts)'},
    {flags: '--force', description: 'Overwrite target directory if it is not empty'},
    {flags: '--link-workspace', description: 'Rewrite @lhx-kit/* deps to workspace:* (in-monorepo scaffolding)'},
    {flags: '--lhx-version <strategy>', description: '@lhx-kit/* version: auto (npm view, default) | local | <range>'},
    {flags: '--skip-install', description: 'Skip automatic dependency installation'},
    {flags: '--skip-git', description: 'Skip automatic git init'},
    {flags: '--package-manager <pm>', description: 'Package manager for install (pnpm|npm|yarn)', default: 'pnpm'}
  ],
  run: (context, name, options) => runCreateCommand(context, name as string | undefined, options as CreateOptions)
};
