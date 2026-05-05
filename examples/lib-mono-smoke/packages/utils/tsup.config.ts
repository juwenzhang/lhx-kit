import {defineConfig} from 'tsup';

/**
 * tsup config for lib-mono-smoke.
 *
 * `format` is rendered from the format-* features you selected at scaffold:
 *   esm + cjs.
 *
 * Switch formats by editing the array; UMD requires `globalName` (set below).
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  globalName: 'LibMonoSmoke',
  outExtension: ({format}) =>
    format === 'esm' ? {js: '.mjs'} : format === 'cjs' ? {js: '.cjs'} : {js: '.umd.js'}
});
