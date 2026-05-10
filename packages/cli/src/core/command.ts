/**
 * Tiny abstraction over `cac` so each command file owns its own CLI surface
 * (name + description + options + handler) instead of having the entry point
 * (`bin.ts`) hard-code every option for every command.
 *
 * Design rules:
 * - Descriptors are plain data — easy to enumerate, document, or test.
 * - The `run` handler is invoked with `(context, ...positionalArgs, options)`
 *   in the order cac forwards them. Each descriptor casts the args to its
 *   own typed shape; we don't bake that into the descriptor type because
 *   commands have different positional shapes (0/1/2/variadic) and a generic
 *   would push the complexity up to call sites without buying anything.
 */
import type {CAC, Command} from 'cac';
import type {CliContext} from './context';

export interface CommandOption {
  /** Flag spec passed to `cac.option(...)`, e.g. `'-t, --template <template>'`. */
  flags: string;
  description: string;
  /** Optional default forwarded as `{default: ...}`. */
  default?: unknown;
}

export interface CommandDescriptor {
  /** cac signature, e.g. `'create [name]'` or `'add [kind] [name]'`. */
  name: string;
  /** One-line description shown in `--help` listings. */
  description: string;
  options?: CommandOption[];
  /**
   * Action handler. cac forwards positional args first, then the options
   * record; we prepend `context` so commands don't have to close over it.
   */
  run: (context: CliContext, ...args: unknown[]) => unknown;
}

export function registerCommand(cli: CAC, context: CliContext, descriptor: CommandDescriptor): Command {
  const cmd = cli.command(descriptor.name, descriptor.description);
  for (const option of descriptor.options ?? []) {
    if (option.default !== undefined) {
      cmd.option(option.flags, option.description, {default: option.default});
    } else {
      cmd.option(option.flags, option.description);
    }
  }
  cmd.action((...args: unknown[]) => descriptor.run(context, ...args));
  return cmd;
}

export function registerCommands(cli: CAC, context: CliContext, descriptors: readonly CommandDescriptor[]): void {
  for (const descriptor of descriptors) {
    registerCommand(cli, context, descriptor);
  }
}
