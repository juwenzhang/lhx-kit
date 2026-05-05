/**
 * @lib-mono-smoke/core — main entry.
 *
 * The build pipeline (tsup) emits the formats you selected at
 * scaffold: esm + cjs.
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
