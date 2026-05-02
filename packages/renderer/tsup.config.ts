import {defineConfig} from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/vue.ts', 'src/react.tsx', 'src/schema-zod.ts'],
  format: ['esm'],
  target: 'es2022',
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: true,
  outDir: 'dist',
  external: ['vue', 'react', 'react-dom']
});
