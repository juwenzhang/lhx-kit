/**
 * lib-rollup-smoke — public surface.
 *
 * Add your library's exports here. The build pipeline emits the formats you
 * selected at scaffold time (esm / cjs / umd).
 */

export const VERSION = '0.0.0';

export interface GreetOptions {
  name: string;
}

export function greet(options: GreetOptions): string {
  return `Hello, ${options.name}!`;
}
