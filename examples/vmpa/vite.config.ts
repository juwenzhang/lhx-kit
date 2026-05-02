import {defineConfig} from 'vite';
import {lhxKit} from '@lhx-kit/vite-plugin';
import vue from '@vitejs/plugin-vue';
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import {TDesignResolver} from 'unplugin-vue-components/resolvers';
import pxtorem from 'postcss-pxtorem';

export default defineConfig({
  plugins: [
    lhxKit(),
    vue(),
    AutoImport({
      imports: [
        'vue',
        'vue-router',
        'pinia',
        {'@lhx-kit/runtime': ['createRequest', 'createLogger', 'detectEnv', 'setupMobile']}
      ],
      dts: 'src/types/auto-imports.d.ts',
      eslintrc: {enabled: true, filepath: './.eslintrc-auto-import.json'}
    }),
    Components({
      dts: 'src/types/components.d.ts',
      resolvers: [TDesignResolver({library: 'mobile-vue'})]
    })
  ],
  css: {
    postcss: {
      plugins: [
        pxtorem({
          rootValue: 75,
          propList: ['*'],
          unitPrecision: 5,
          minPixelValue: 2,
          exclude: /node_modules/i
        })
      ]
    }
  }
});
