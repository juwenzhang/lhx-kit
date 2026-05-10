/**
 * Interactive prompts for `lhx-cli add ...`.
 *
 * Kept separate from `index.ts` so the add command's main flow stays readable
 * — the prompt definitions are the noisiest part. Every prompt uses the
 * shared `onCancel` handler so Ctrl+C produces the same exit code (130)
 * regardless of which step was cancelled.
 */
import prompts from 'prompts';
import {muted} from '../../utils/ui';

export type AddKind = 'page' | 'component' | 'api' | 'service' | 'store' | 'schema' | 'module' | 'package';

export const ALL_KINDS: AddKind[] = ['page', 'component', 'api', 'service', 'store', 'schema', 'module', 'package'];

export const KIND_DESCRIPTIONS: Record<AddKind, string> = {
  page: 'A multi-page entry (upserts into project.config.ts)',
  component: 'A reusable UI component',
  api: 'An HTTP API wrapper',
  service: 'A domain service class',
  store: 'A state store (Pinia for vue3, Zustand for react)',
  schema: 'A renderer v1 JSON schema scaffold',
  module: 'A plain TypeScript module',
  package: 'A new publishable workspace under packages/<name> (monorepo only)'
};

export function isInteractive(): boolean {
  // Only prompt when connected to a real TTY; avoid stalling CI pipelines.
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export function onCancel(): void {
  muted('cancelled.');
  process.exit(130);
}

export function kebabOk(name: string): boolean {
  return /^[a-z][a-z0-9-]*$/.test(name);
}

export async function promptKind(): Promise<AddKind> {
  const res = await prompts(
    {
      type: 'select',
      name: 'kind',
      message: 'What do you want to generate?',
      choices: ALL_KINDS.map(k => ({title: k, description: KIND_DESCRIPTIONS[k], value: k})),
      initial: 0
    },
    {onCancel}
  );
  return res.kind as AddKind;
}

export async function promptName(kind: AddKind, existingPages?: Set<string>): Promise<string> {
  const res = await prompts(
    {
      type: 'text',
      name: 'name',
      message: `Name for the new ${kind}`,
      validate: value => {
        if (!value) return 'Name is required.';
        if (kind === 'page' && !kebabOk(value)) return 'Use lowercase kebab-case (e.g. "order-list").';
        if (kind === 'page' && existingPages?.has(value)) return `Page "${value}" already exists.`;
        return true;
      }
    },
    {onCancel}
  );
  return (res.name as string).trim();
}

export async function promptPageExtras(): Promise<{title?: string; offline?: boolean}> {
  const res = await prompts(
    [
      {
        type: 'text',
        name: 'title',
        message: 'Page title (shown in <title>)',
        initial: ''
      },
      {
        type: 'toggle',
        name: 'offline',
        message: 'Include this page in the offline package?',
        initial: false,
        active: 'yes',
        inactive: 'no'
      }
    ],
    {onCancel}
  );
  return {
    title: typeof res.title === 'string' && res.title.trim() ? res.title.trim() : undefined,
    offline: res.offline === true
  };
}

export async function promptPackageName(): Promise<string> {
  const res = await prompts(
    {
      type: 'text',
      name: 'name',
      message: 'Package name (short form, e.g. "my-pkg" — final name will be @lhx-kit/my-pkg)',
      validate: value => {
        if (!value) return 'Name is required.';
        if (!kebabOk(value)) return 'Use lowercase kebab-case (e.g. "my-pkg").';
        return true;
      }
    },
    {onCancel}
  );
  return (res.name as string).trim();
}
