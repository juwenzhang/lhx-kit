/**
 * `lhx-cli skills …` — manage agent-agnostic skills (@lhx-kit/skills).
 *
 * Subcommands:
 *   list                               Enumerate bundled skills
 *   add [...names]                     Install specific skills to the project
 *   sync                               Re-render every installed skill target
 *
 * Options:
 *   --targets=codebuddy,cursor,claude,plain   fan out destinations
 *   --all                                     pick every bundled skill
 *   --force                                   overwrite existing files
 *   --yes                                     skip interactive prompts
 *
 * The implementation delegates to `@lhx-kit/skills` — CLI stays a thin
 * shell over the programmatic API, which means `scripts/*.mjs` consumers
 * get the same behaviour.
 */
import {relative as pathRelative} from 'node:path';
import prompts from 'prompts';
import type {CommandDescriptor} from '../core/command';
import type {CliContext} from '../core/context';
import {info, muted, section, success, warn} from '../utils/ui';

export interface SkillsOptions {
  targets?: string;
  all?: boolean;
  force?: boolean;
  yes?: boolean;
}

type SkillsAction = 'list' | 'add' | 'sync';

export async function runSkillsCommand(
  context: CliContext,
  action: SkillsAction | undefined,
  rest: string[],
  options: SkillsOptions
): Promise<void> {
  const skillsMod = await loadSkillsModule();
  if (!skillsMod) {
    warn('@lhx-kit/skills is not installed. Run: pnpm add -D @lhx-kit/skills');
    return;
  }
  const {listSkills, installSkills, getAvailableTargets} = skillsMod;

  const resolvedAction = action ?? (await promptAction(!!options.yes));
  if (!resolvedAction) return;

  const allSkills = await listSkills();
  if (allSkills.length === 0) {
    warn('No skills are bundled with @lhx-kit/skills.');
    return;
  }

  if (resolvedAction === 'list') {
    section('Bundled skills');
    for (const s of allSkills) {
      info(`${s.manifest.name} — ${s.manifest.title}`);
      muted(`    ${s.manifest.description}`);
    }
    muted(`\nTotal: ${allSkills.length} skill(s)`);
    return;
  }

  // Determine which skills to operate on
  let pickedSkillNames: string[];
  if (resolvedAction === 'sync') {
    pickedSkillNames = allSkills.map(s => s.manifest.name);
  } else if (options.all) {
    pickedSkillNames = allSkills.map(s => s.manifest.name);
  } else if (rest.length > 0) {
    pickedSkillNames = rest;
  } else if (options.yes) {
    pickedSkillNames = allSkills.map(s => s.manifest.name);
  } else {
    pickedSkillNames = await promptSkills(allSkills);
  }
  if (pickedSkillNames.length === 0) {
    warn('No skills selected.');
    return;
  }
  const pickedSkills = allSkills.filter(s => pickedSkillNames.includes(s.manifest.name));
  if (pickedSkills.length !== pickedSkillNames.length) {
    const missing = pickedSkillNames.filter(n => !pickedSkills.find(s => s.manifest.name === n));
    warn(`Unknown skill(s): ${missing.join(', ')}`);
    if (pickedSkills.length === 0) return;
  }

  // Resolve targets
  const availableTargets = getAvailableTargets();
  let targets: string[];
  if (options.targets) {
    targets = options.targets
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
  } else if (options.yes) {
    targets = ['plain'];
  } else {
    targets = await promptTargets(availableTargets);
  }
  const unknownTargets = targets.filter(t => !availableTargets.includes(t as never));
  if (unknownTargets.length > 0) {
    warn(`Unknown target(s): ${unknownTargets.join(', ')}. Available: ${availableTargets.join(', ')}`);
    targets = targets.filter(t => availableTargets.includes(t as never));
  }
  if (targets.length === 0) {
    warn('No targets selected.');
    return;
  }

  section(`Installing ${pickedSkills.length} skill(s) → [${targets.join(', ')}]`);
  const result = await installSkills(pickedSkills, {
    projectRoot: context.cwd,
    targets: targets as never[],
    skipIfExists: !options.force
  });

  for (const p of result.written) info(`wrote  ${relative(context.cwd, p)}`);
  for (const p of result.skipped) muted(`skip   ${relative(context.cwd, p)} (exists; use --force to overwrite)`);
  success(`${result.written.length} file(s) written, ${result.skipped.length} skipped.`);
}

async function promptAction(nonInteractive: boolean): Promise<SkillsAction | undefined> {
  if (nonInteractive) return 'list';
  const response = await prompts(
    {
      type: 'select',
      name: 'value',
      message: 'Skills action',
      choices: [
        {title: 'list', description: 'Show bundled skills', value: 'list'},
        {title: 'add', description: 'Install skill(s) into this project', value: 'add'},
        {title: 'sync', description: 'Re-render every skill across selected targets', value: 'sync'}
      ]
    },
    {onCancel: () => process.exit(130)}
  );
  return response.value as SkillsAction | undefined;
}

interface MinimalSkill {
  manifest: {name: string; title: string; description: string};
}

async function promptSkills(all: MinimalSkill[]): Promise<string[]> {
  const response = await prompts(
    {
      type: 'multiselect',
      name: 'value',
      message: 'Select skills to install',
      hint: 'space to toggle, enter to confirm',
      instructions: false,
      choices: all.map(s => ({
        title: `${s.manifest.title}  (${s.manifest.name})`,
        description: s.manifest.description,
        value: s.manifest.name,
        selected: true
      }))
    },
    {onCancel: () => process.exit(130)}
  );
  return (response.value as string[]) ?? [];
}

async function promptTargets(available: readonly string[]): Promise<string[]> {
  const response = await prompts(
    {
      type: 'multiselect',
      name: 'value',
      message: 'Select target agents',
      hint: 'space to toggle, enter to confirm',
      instructions: false,
      choices: available.map(t => ({
        title: t,
        value: t,
        selected: t === 'plain'
      }))
    },
    {onCancel: () => process.exit(130)}
  );
  return (response.value as string[]) ?? [];
}

function relative(from: string, to: string): string {
  return pathRelative(from, to);
}

/**
 * The `@lhx-kit/skills` package is an optional peer: projects that don't
 * care about skills should not be forced to install it. We dynamic-import
 * so the CLI remains usable even when skills isn't a dep.
 */
async function loadSkillsModule(): Promise<typeof import('@lhx-kit/skills') | null> {
  try {
    return (await import('@lhx-kit/skills')) as typeof import('@lhx-kit/skills');
  } catch {
    return null;
  }
}

export const skillsCommand: CommandDescriptor = {
  name: 'skills [action] [...names]',
  description: 'Manage agent-agnostic skills: list | add | sync',
  options: [
    {
      flags: '--targets <list>',
      description: 'Comma-separated targets: codebuddy,cursor,claude,plain',
      default: ''
    },
    {flags: '--all', description: 'Select every bundled skill'},
    {flags: '--force', description: 'Overwrite existing files on disk'},
    {flags: '--yes', description: 'Non-interactive mode (defaults: list / all skills / plain target)'}
  ],
  run: (context, action, names, options) => {
    const normalisedAction = (action as 'list' | 'add' | 'sync' | undefined) ?? undefined;
    return runSkillsCommand(context, normalisedAction, (names as string[] | undefined) ?? [], options as SkillsOptions);
  }
};
