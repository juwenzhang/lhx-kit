import type {CommandDescriptor} from '../core/command';
import {info, section, success} from '../utils/ui';

export async function runUpgradeCommand(): Promise<void> {
  section('lhx-cli upgrade');
  info('placeholder: version sync and template upgrade flow will land in a later change.');
  success('nothing to do right now');
}

export const upgradeCommand: CommandDescriptor = {
  name: 'upgrade',
  description: 'Upgrade project to the latest runtime / template versions (placeholder)',
  run: () => runUpgradeCommand()
};
