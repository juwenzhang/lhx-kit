import {defineConfig} from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/bin.ts'],
  format: ['esm'],
  target: 'es2022',
  dts: true,
  clean: true,
  sourcemap: true,
  outDir: 'dist',
  shims: true,
  banner: {js: '#!/usr/bin/env node'},
  outExtensions: () => ({js: '.js', dts: '.d.ts'})
});
