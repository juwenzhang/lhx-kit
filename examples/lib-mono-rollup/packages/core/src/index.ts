/**
 * @lib-mono-rollup/core — main entry.
 *
 * The build pipeline (rollup) emits the formats you selected at
 * scaffold: esm + cjs + umd.
 */

export const VERSION = '0.0.0';

export interface CoreOptions {
  greeting?: string;
}

export class Core {
  constructor(private readonly options: CoreOptions = {}) {}

  greet(name: string): string {
    return `${this.options.greeting ?? 'Hello'}, ${name}!`;
  }
}
