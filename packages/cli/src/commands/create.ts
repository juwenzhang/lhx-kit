import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {execa} from 'execa';
import fse from 'fs-extra';
import {bold, dim} from 'kolorist';
import prompts from 'prompts';
import type {CliContext} from '../context';
import {
  copyTemplateDir,
  listBuiltinTemplates,
  readTemplateSource,
  renderString,
  type TemplateManifest,
  type TemplateVariables
} from '../templates';
import {info, section, success, warn} from '../ui';

export interface CreateOptions {
  template?: string;
  features?: string;
  title?: string;
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
}

function toKebab(input: string): string {
  return (
    input
      .replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)
      .replace(/[^a-z0-9-]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'app'
  );
}

async function pickTemplate(templates: TemplateManifest[]): Promise<string> {
  const response = await prompts(
    {
      type: 'select',
      name: 'value',
      message: 'Choose a template',
      choices: templates.map(tpl => ({
        title: `${tpl.title} ${dim(`(${tpl.name})`)}`,
        description: tpl.description,
        value: tpl.name
      }))
    },
    {onCancel: () => process.exit(1)}
  );
  return response.value as string;
}

async function pickFeatures(manifest: TemplateManifest): Promise<string[]> {
  if (!manifest.features?.length) return [];
  const response = await prompts(
    {
      type: 'multiselect',
      name: 'value',
      message: 'Select optional features',
      hint: 'space to toggle, enter to confirm',
      instructions: false,
      choices: manifest.features.map(feature => ({
        title: `${feature.title} ${dim(`(${feature.name})`)}`,
        description: feature.description,
        value: feature.name,
        selected: feature.defaultEnabled ?? false
      }))
    },
    {onCancel: () => process.exit(1)}
  );
  return (response.value as string[]) || [];
}

export async function runCreateCommand(
  context: CliContext,
  projectName: string | undefined,
  options: CreateOptions
): Promise<void> {
  const templates = await listBuiltinTemplates(context.templatesDir);
  let templateRef = options.template;
  let resolvedName = projectName;

  if (!options.yes) {
    if (!resolvedName) {
      const response = await prompts(
        {
          type: 'text',
          name: 'value',
          message: 'Project name',
          initial: 'my-app',
          validate: value => /^[a-zA-Z0-9-_.]+$/.test(value) || 'Only letters, digits, "-", "_", "." allowed'
        },
        {onCancel: () => process.exit(1)}
      );
      resolvedName = response.value as string;
    }
    if (!templateRef) {
      templateRef = await pickTemplate(templates);
    }
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
  let features: string[] = options.features
    ? options.features
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
    : [];
  if (!options.yes && !options.features) {
    features = await pickFeatures(templateSource.manifest);
  } else if (options.yes && !options.features) {
    features = (templateSource.manifest.features || []).filter(f => f.defaultEnabled).map(f => f.name);
  }

  const variables: TemplateVariables = {
    projectName: resolvedName,
    packageName: toKebab(resolvedName),
    appTitle: options.title || resolvedName,
    features,
    year: new Date().getFullYear(),
    // Computed once at `createContext()` from `@lhx-kit/cli/package.json`,
    // so all three consumers (`--version`, `lhx-cli info`, scaffold deps)
    // stay in lockstep with a single source of truth.
    lhxKitVersionRange: context.lhxKitVersionRange
  };

  section(`Creating ${bold(resolvedName)} from ${bold(templateSource.manifest.title)}`);
  await fse.ensureDir(targetDir);
  const baseFiles = await copyTemplateDir({
    sourceDir: resolve(templateSource.directory, 'files'),
    targetDir,
    variables
  });
  info(`base files: ${baseFiles.length}`);

  for (const feature of templateSource.manifest.features || []) {
    if (!features.includes(feature.name)) continue;
    const patchDir = resolve(templateSource.directory, feature.patchDir || `features/${feature.name}`);
    if (!existsSync(patchDir)) {
      warn(`feature patch missing: ${feature.name}`);
      continue;
    }
    const patched = await copyTemplateDir({sourceDir: patchDir, targetDir, variables});
    info(`feature ${feature.name}: ${patched.length} file(s)`);
  }

  if (options.linkWorkspace) {
    const changed = await rewriteLhxKitToWorkspace(targetDir);
    if (changed) info('rewrote @lhx-kit/* dependencies to workspace:* (via --link-workspace)');
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

  if (templateSource.manifest.postCreate?.length) {
    section('Next steps');
    for (const step of templateSource.manifest.postCreate) {
      info(renderString(step, variables));
    }
  }
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
 * Helper for in-monorepo scaffolding: rewrite every `@lhx-kit/*` dependency
 * version in the generated `package.json` to `workspace:*`. Idempotent.
 */
async function rewriteLhxKitToWorkspace(targetDir: string): Promise<boolean> {
  const pkgPath = resolve(targetDir, 'package.json');
  if (!existsSync(pkgPath)) return false;
  const pkg = (await fse.readJson(pkgPath)) as Record<string, unknown>;
  let changed = false;
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
    const deps = pkg[field];
    if (!deps || typeof deps !== 'object') continue;
    const entries = deps as Record<string, string>;
    for (const [name, version] of Object.entries(entries)) {
      if (name.startsWith('@lhx-kit/') && version !== 'workspace:*') {
        entries[name] = 'workspace:*';
        changed = true;
      }
    }
  }
  if (changed) await fse.writeJson(pkgPath, pkg, {spaces: 2});
  return changed;
}
