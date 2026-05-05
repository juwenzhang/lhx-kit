import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';

/**
 * Rollup config for lib-rollup-smoke.
 *
 * Outputs are rendered from the format-* features you selected at scaffold:
 *   esm + cjs + umd.
 *
 * The second config block emits the `.d.ts` bundle.
 */
export default [
  {
    input: 'src/index.ts',
    plugins: [resolve(), commonjs(), typescript({tsconfig: './tsconfig.json'})],
    output: [
      {file: 'dist/index.mjs', format: 'es', sourcemap: true},
      {file: 'dist/index.cjs', format: 'cjs', sourcemap: true, exports: 'named'},
      {file: 'dist/index.umd.js', format: 'umd', sourcemap: true, name: 'LibRollupSmoke'}
    ]
  },
  {
    input: 'src/index.ts',
    plugins: [dts()],
    output: [{file: 'dist/index.d.ts', format: 'es'}]
  }
];
