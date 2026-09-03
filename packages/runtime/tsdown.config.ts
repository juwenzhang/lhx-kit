import {defineConfig} from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    request: 'src/request/index.ts',
    env: 'src/env/index.ts',
    mobile: 'src/mobile/index.ts',
    logger: 'src/logger/index.ts',
    bridge: 'src/bridge/index.ts',
    auth: 'src/auth/index.ts',
    mock: 'src/mock/index.ts',
    experiment: 'src/experiment/index.ts',
    theme: 'src/theme/index.ts',
    'cdn-loader': 'src/cdn-loader/index.ts'
  },
  format: ['esm'],
  target: 'es2022',
  dts: true,
  clean: true,
  sourcemap: true,
  outDir: 'dist',
  outExtensions: () => ({js: '.js', dts: '.d.ts'})
});
