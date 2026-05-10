import type {CommandDescriptor} from '../core/command';
import type {CliContext} from '../core/context';
import {tryProject} from '../core/project';
import {error, info, muted, section, warn} from '../utils/ui';

export async function runInfoCommand(context: CliContext): Promise<void> {
  // Always print the CLI version banner first — sourced from the same
  // `context.cliPackage` as `--version`, so they can never disagree.
  muted(`lhx-cli ${context.cliPackage.version}  ·  ${context.packageRoot}`);

  const {value, diagnostics} = await tryProject(context.cwd);
  if (!value) {
    // Missing file → soft warning; schema errors → hard error with details.
    const missingOnly = diagnostics.every(d => d.code === 'project-config/missing');
    if (missingOnly) {
      warn('No project.config.ts found in this path.');
      muted('Tip: run `lhx-cli create` to scaffold one, or `lhx-cli info` inside an existing project.');
      return;
    }
    error('project.config is invalid:');
    for (const d of diagnostics) muted(`  - ${d.code}: ${d.message}`);
    process.exitCode = 1;
    return;
  }

  const {project, offline} = value;
  const cfg = project.config;

  section(cfg.name);
  info(`framework: ${cfg.framework}`);
  info(`config: ${project.file}`);
  info(`rootDir: ${cfg.rootDir}`);

  const envs = Object.keys(cfg.envs).filter(mode => cfg.envs[mode as keyof typeof cfg.envs]);
  info(`envs: ${envs.join(', ') || '(none)'}`);

  const pages = Object.values(cfg.pages);
  info(`pages: ${pages.length}`);
  for (const page of pages) {
    const badges: string[] = [];
    if (page.offline) badges.push('offline');
    const suffix = badges.length ? ` [${badges.join(', ')}]` : '';
    muted(`  - ${page.name} → ${page.entry}${suffix}`);
  }

  if (offline) {
    const oc = offline.config;
    const versions = [
      oc.versions.test ? `test=${oc.versions.test}` : null,
      oc.versions.prod ? `prod=${oc.versions.prod}` : null
    ]
      .filter(Boolean)
      .join(', ');
    info(`offline: ${oc.enabled ? 'enabled' : 'disabled'}${versions ? ` (${versions})` : ''}`);
    if (oc.whitelistPages?.length) {
      muted(`  whitelist: ${oc.whitelistPages.join(', ')}`);
    }
  }
}

export const infoCommand: CommandDescriptor = {
  name: 'info',
  description: 'Show current project info',
  run: context => runInfoCommand(context)
};
