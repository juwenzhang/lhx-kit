import {cac} from 'cac';
import {bold, cyan, dim} from 'kolorist';
import {addCommand} from './commands/add';
import {createCommand} from './commands/create';
import {buildCommand, devCommand, previewCommand} from './commands/dev-build';
import {doctorCommand} from './commands/doctor';
import {infoCommand} from './commands/info';
import {offlineCommand} from './commands/offline';
import {skillsCommand} from './commands/skills';
import {upgradeCommand} from './commands/upgrade';
import {type CommandDescriptor, registerCommands} from './core/command';
import {createContext} from './core/context';
import {error} from './utils/ui';

/**
 * Master command list. Each entry owns its own CLI surface (name + options +
 * action) inside its respective `commands/*.ts` file; this array exists only
 * to fix the order in which they appear under `--help` and to give
 * `registerCommands` something to iterate.
 */
const COMMANDS: readonly CommandDescriptor[] = [
  createCommand,
  addCommand,
  devCommand,
  buildCommand,
  previewCommand,
  infoCommand,
  doctorCommand,
  offlineCommand,
  upgradeCommand,
  skillsCommand
];

export async function main(): Promise<void> {
  const cli = cac('lhx-cli');
  const context = createContext();
  // Single source of truth for the program version: `@lhx-kit/cli/package.json`,
  // read once at startup. Bumping the published version is therefore the only
  // place you edit to release — no stale hard-coded constants, no drift.
  const PROGRAM_VERSION = context.cliPackage.version;

  registerCommands(cli, context, COMMANDS);
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
  lines.push(
    '  add <kind> <name>             Generate page | component | api | service | store | schema | module | package'
  );
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
  lines.push('  lhx-cli add package my-lib --description="Shared helpers"');
  lines.push('  lhx-cli dev --page=home');
  lines.push('  lhx-cli build --pages=home,profile');
  lines.push('  lhx-cli offline build --hybrid-type=prod');
  lines.push('  lhx-cli skills add configure-cdn --targets=cursor,codebuddy');
  return lines.join('\n');
}

main();
