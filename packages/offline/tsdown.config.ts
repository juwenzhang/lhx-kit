import {defineConfig} from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'es2022',
  dts: true,
  clean: true,
  sourcemap: true,
  outDir: 'dist',
  outExtensions: () => ({js: '.js', dts: '.d.ts'})
});
