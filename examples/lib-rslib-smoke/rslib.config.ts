import {defineConfig} from '@rslib/core';

/**
 * rslib config for lib-rslib-smoke.
 *
 * `lib` is rendered from the format-* features you selected at scaffold:
 *   esm + cjs.
 */
export default defineConfig({
  source: {
    entry: {index: './src/index.ts'}
  },
  lib: [
    {format: 'esm', dts: true, output: {distPath: {root: './dist'}}},
    {format: 'cjs', output: {distPath: {root: './dist'}}}
  ],
  output: {
    target: 'web',
    sourceMap: true
  }
});
