import {lhxKit} from '@lhx-kit/vite-plugin';
import vue from '@vitejs/plugin-vue';
import pxtorem from 'postcss-pxtorem';
// lhx:vite-imports
import unocss from 'unocss/vite';
import AutoImport from 'unplugin-auto-import/vite';
import {TDesignResolver} from 'unplugin-vue-components/resolvers';
import Components from 'unplugin-vue-components/vite';
import {defineConfig} from 'vite';

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
      dts: 'src/types/auto-imports.d.ts'
    }),
    Components({
      dts: 'src/types/components.d.ts',
      resolvers: [TDesignResolver({library: 'mobile-vue'})]
    }),
    // lhx:vite-plugins
    unocss()
  ],
  css: {
    postcss: {
      plugins: [
        // lhx:postcss-plugins
        pxtorem({
          rootValue: 75,
          propList: ['*'],
          unitPrecision: 5,
          minPixelValue: 2,
          exclude: /node_modules/i
        })
      ]
    }
    // lhx:css-options
  },
  resolve: {
    alias: {
      // lhx:resolve-alias
    }
  }
});
