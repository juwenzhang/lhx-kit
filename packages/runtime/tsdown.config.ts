import {defineConfig} from 'tsdown';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/request.ts',
    'src/env.ts',
    'src/mobile.ts',
    'src/logger.ts',
    'src/bridge.ts',
    'src/auth.ts',
    'src/mock.ts',
    'src/experiment.ts',
    'src/theme.ts',
    'src/cdn-loader.ts'
  ],
  format: ['esm'],
  target: 'es2022',
  dts: true,
  clean: true,
  sourcemap: true,
  outDir: 'dist',
  outExtensions: () => ({js: '.js', dts: '.d.ts'})
});
