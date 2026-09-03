import {defineConfig} from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/vue.ts', 'src/react.tsx', 'src/schema-zod.ts'],
  format: ['esm'],
  target: 'es2022',
  dts: true,
  clean: true,
  sourcemap: true,
  outDir: 'dist',
  outExtensions: () => ({js: '.js', dts: '.d.ts'})
});
