import {cac} from 'cac';
import {bold, cyan, dim} from 'kolorist';
import {type AddKind, runAddCommand} from './commands/add';
import {runCreateCommand} from './commands/create';
import {runBuildCommand, runDevCommand, runPreviewCommand} from './commands/dev-build';
import {runDoctorCommand} from './commands/doctor';
import {runInfoCommand} from './commands/info';
import {runOfflineBuild, runOfflineDiff, runOfflineInspect, runOfflineManifest} from './commands/offline';
import {runSkillsCommand} from './commands/skills';
import {runUpgradeCommand} from './commands/upgrade';
import {createContext} from './context';
import {error} from './ui';

export async function main(): Promise<void> {
  const cli = cac('lhx-cli');
  const context = createContext();
  // Version comes from `context.cliPackage.version`, which reads
  // `@lhx-kit/cli/package.json` at startup. Keeping a single source of
  // truth means bumping `package.json#version` is the ONLY place you edit
  // to release — no stale hard-coded constants, no drift.
  const PROGRAM_VERSION = context.cliPackage.version;

  cli
    .command('create [name]', 'Scaffold a new project from a built-in or remote template')
    .option('-t, --template <template>', 'Built-in name, local path, or giget source (gh:user/repo#ref)')
    .option('--features <list>', 'Comma-separated feature names')
    .option('--title <title>', 'Human-readable project title')
    .option('--yes', 'Non-interactive mode (skip prompts)')
    .option('--force', 'Overwrite target directory if it is not empty')
    .option('--link-workspace', 'Rewrite @lhx-kit/* deps to workspace:* (in-monorepo scaffolding)')
    .option('--skip-install', 'Skip automatic dependency installation')
    .option('--skip-git', 'Skip automatic git init')
    .option('--package-manager <pm>', 'Package manager for install (pnpm|npm|yarn)', {default: 'pnpm'})
    .action((name: string | undefined, options: Record<string, unknown>) =>
      runCreateCommand(context, name, options as never)
    );

  cli
    .command('add [kind] [name]', 'Generate a page / component / api / service / store / schema / module')
    .option('--title <title>', 'For `add page`: display title')
    .option('--offline', 'For `add page`: mark the page offline and add to offline.whitelistPages')
    .option('--yes', 'Non-interactive mode (require all arguments to be provided)')
    .action((kind: AddKind | undefined, name: string | undefined, options: Record<string, unknown>) =>
      runAddCommand(context, kind, name, options as never)
    );

  cli
    .command('dev', 'Run the project dev server (multi-page aware)')
    .option('--page <name>', 'Page to run (alias of --pages for a single name)')
    .option('--pages <list>', 'Comma-separated list of pages to include')
    .option('--host [host]', 'Specify hostname (forwarded to vite)')
    .option('--port <port>', 'Specify port (forwarded to vite)')
    .option('--strictPort', 'Exit if port is already in use (forwarded to vite)')
    .option('--open [path]', 'Open browser on startup (forwarded to vite)')
    .option('--base <path>', 'Public base path (forwarded to vite)')
    .action((options: Record<string, unknown>) => runDevCommand(context, options as never));

  cli
    .command('build', 'Build the project (multi-page aware)')
    .option('--page <name>', 'Page to build (alias of --pages for a single name)')
    .option('--pages <list>', 'Comma-separated list of pages to include')
    .action((options: {page?: string; pages?: string}) => runBuildCommand(context, options));

  cli
    .command('preview', 'Preview the built project')
    .option('--page <name>', 'Page to preview')
    .option('--pages <list>', 'Comma-separated list of pages to include')
    .option('--host [host]', 'Specify hostname (forwarded to vite)')
    .option('--port <port>', 'Specify port (forwarded to vite)')
    .option('--strictPort', 'Exit if port is already in use (forwarded to vite)')
    .option('--open [path]', 'Open browser on startup (forwarded to vite)')
    .option('--base <path>', 'Public base path (forwarded to vite)')
    .action((options: Record<string, unknown>) => runPreviewCommand(context, options as never));

  cli.command('info', 'Show current project info').action(() => runInfoCommand(context));

  cli.command('doctor', 'Diagnose environment and project configuration').action(() => runDoctorCommand(context));

  cli
    .command('offline [action] [target]', 'Offline packaging: build | manifest | inspect | diff')
    .option('--build-dir <dir>', 'Override build directory')
    .option('--out-dir <dir>', 'Override offline output directory')
    .option('--no-zip', 'Skip zip generation for offline build')
    .option('--skip-build', 'Skip automatic pnpm build when running offline build')
    .option('--hybrid-type <type>', 'Which version track to package (test | prod)')
    .option('--yes', 'Non-interactive mode')
    .action(async (action: string | undefined, target: string | undefined, options: Record<string, unknown>) => {
      let resolvedAction = action;
      if (!resolvedAction) {
        if (options.yes || !(process.stdin.isTTY && process.stdout.isTTY)) {
          printOfflineHelp();
          return;
        }
        const picked = await (await import('prompts')).default(
          {
            type: 'select',
            name: 'action',
            message: 'Pick an offline action',
            choices: [
              {
                title: 'build',
                description: 'Run project build and package dist-offline + manifest + zip',
                value: 'build'
              },
              {title: 'manifest', description: 'Generate only manifest.json from dist', value: 'manifest'},
              {title: 'inspect', description: 'Inspect a dist-offline directory or zip file', value: 'inspect'},
              {title: 'diff', description: 'Reserved: incremental package output', value: 'diff'}
            ]
          },
          {onCancel: () => process.exit(130)}
        );
        resolvedAction = picked.action as string | undefined;
        if (!resolvedAction) return;
      }
      switch (resolvedAction) {
        case 'build':
          await runOfflineBuild(context, options as never);
          return;
        case 'manifest':
          await runOfflineManifest(context, options as never);
          return;
        case 'inspect':
          await runOfflineInspect(context, target);
          return;
        case 'diff':
          await runOfflineDiff();
          return;
        default:
          printOfflineHelp();
      }
    });

  cli
    .command('upgrade', 'Upgrade project to the latest runtime / template versions (placeholder)')
    .action(() => runUpgradeCommand());

  cli
    .command('skills [action] [...names]', 'Manage agent-agnostic skills: list | add | sync')
    .option('--targets <list>', 'Comma-separated targets: codebuddy,cursor,claude,plain', {default: ''})
    .option('--all', 'Select every bundled skill')
    .option('--force', 'Overwrite existing files on disk')
    .option('--yes', 'Non-interactive mode (defaults: list / all skills / plain target)')
    .action((action: string | undefined, names: string[] | undefined, options: Record<string, unknown>) => {
      const normalisedAction = (action as 'list' | 'add' | 'sync' | undefined) ?? undefined;
      return runSkillsCommand(context, normalisedAction, names ?? [], options as never);
    });

  cli.help(sections => [...sections, {title: '', body: customHelpBody(PROGRAM_VERSION)}]);
  cli.version(PROGRAM_VERSION);

  try {
    cli.parse(process.argv, {run: false});
    await cli.runMatchedCommand();
  } catch (err) {
    error((err as Error).message);
    process.exitCode = 1;
  }
}

function customHelpBody(version: string): string {
  const lines: string[] = [];
  lines.push(`${bold('lhx-cli')} ${dim(`v${version}`)}`);
  lines.push('');
  lines.push(cyan('Usage:'));
  lines.push('  lhx-cli <command> [options]');
  lines.push('');
  lines.push(cyan('Commands:'));
  lines.push('  create [name]                 Scaffold a new project');
  lines.push('  add <kind> <name>             Generate page | component | api | service | store | schema | module');
  lines.push('  dev [--page|--pages <list>]   Run dev server');
  lines.push('  build [--page|--pages <list>] Build project');
  lines.push('  preview [--page|--pages]      Preview built project');
  lines.push('  info                          Show current project info');
  lines.push('  doctor                        Diagnose environment and project config');
  lines.push('  offline <action>              Offline pipeline: build | manifest | inspect | diff');
  lines.push('  skills <action>               Skill pack: list | add | sync (targets: codebuddy|cursor|claude|plain)');
  lines.push('  upgrade                       Upgrade project (placeholder)');
  lines.push('');
  lines.push(cyan('Examples:'));
  lines.push('  lhx-cli create               # interactive');
  lines.push('  lhx-cli add page cashier --offline');
  lines.push('  lhx-cli dev --page=home');
  lines.push('  lhx-cli build --pages=home,profile');
  lines.push('  lhx-cli offline build --hybrid-type=prod');
  lines.push('  lhx-cli skills add configure-cdn --targets=cursor,codebuddy');
  return lines.join('\n');
}

function printOfflineHelp(): void {
  console.log(`${bold('lhx-cli offline')}`);
  console.log('  build      Build project and package dist-offline + manifest + zip');
  console.log('  manifest   Generate only manifest.json from dist');
  console.log('  inspect    Inspect dist-offline directory or zip file');
  console.log('  diff       Reserved: incremental package output');
}

main();
