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
    level: 'error' as const,
    code: `zod/${issue.code}`,
    message: issue.message,
    // zod 4 widened `issue.path` to `PropertyKey[]` (can include `symbol`).
    // Collapse to (string | number)[] — our schemas never use symbol keys,
    // and `String(sym)` produces `"Symbol(foo)"` which is a safe fallback.
    path: (issue.path as readonly PropertyKey[]).map(seg => (typeof seg === 'number' ? seg : String(seg))),
    source
  }));
}

export function formatDiagnostics(diagnostics: Diagnostic[]): string {
  return diagnostics
    .map(d => {
      const prefix = `[${d.level}] ${d.code}`;
      const where = d.path?.length ? ` at ${d.path.join('.')}` : '';
      const src = d.source ? ` (${d.source})` : '';
      return `${prefix}${where}${src}: ${d.message}`;
    })
    .join('\n');
}
