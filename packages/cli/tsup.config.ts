import {defineConfig} from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/bin.ts'],
  format: ['esm'],
  target: 'es2022',
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  outDir: 'dist',
  shims: true,
  banner: {js: '#!/usr/bin/env node'},
  external: ['@lhx-kit/config', '@lhx-kit/offline']
});
