import type {ZodError} from 'zod';

export interface Diagnostic {
  level: 'error' | 'warn' | 'info';
  code: string;
  message: string;
  path?: (string | number)[];
  source?: string;
}

export class ConfigError extends Error {
  constructor(public readonly diagnostics: Diagnostic[]) {
    super(formatDiagnostics(diagnostics));
    this.name = 'ConfigError';
  }
}

export function diagnosticsFromZod(err: ZodError, source: string): Diagnostic[] {
  return err.issues.map(issue => ({
    level: 'error',
    code: `zod/${issue.code}`,
    message: issue.message,
    path: issue.path,
    source
  }));
}

export function formatDiagnostics(diagnostics: Diagnostic[]): string {
  return diagnostics
    .map(d => {
      const prefix = `[${d.level}] ${d.code}`;
      const where = d.path && d.path.length ? ` at ${d.path.join('.')}` : '';
      const src = d.source ? ` (${d.source})` : '';
      return `${prefix}${where}${src}: ${d.message}`;
    })
    .join('\n');
}
