import {defineProjectConfig} from '@lhx-kit/config';

/**
 * Single source of truth for the whole lhx-kit pipeline (CLI / vite-plugin
 * / offline / renderer). Every field not listed here has a sensible default.
 * See the comments below for the full capability surface.
 */
export default defineProjectConfig({
  name: 'vmpa',
  framework: 'vue3',

  // Uncomment to override path defaults (all resolved relative to this file):
  //   srcDir:     'src',
  //   pagesDir:   'src/pages',
  //   publicDir:  'public',
  //   outDir:     'dist',

  // Extra aliases on top of the built-in `@` / `@pages` / `@components`.
  // Only declare the ones you actually want; each alias must resolve to a
  // real directory or `lhx-cli doctor` will fail.
  aliases: {
    '@stores': 'src/stores',
    '@services': 'src/services',
    '@mocks': 'src/mocks'
  },

  envs: {
    dev: {
      apiBase: '/api',
      // Vite dev-server proxy; keys are forwarded verbatim to `server.proxy`.
      proxy: {
        '/api': {target: 'http://localhost:7001', changeOrigin: true}
      }
      // publicPath: '/',            // optional; sets vite `base`
      // define: {__FEATURE_X__: 'true'}  // optional; forwarded to vite `define`
    },
    // test:    {apiBase: 'https://test-api.example.com'},
    // staging: {apiBase: 'https://staging-api.example.com'},
    prod: {apiBase: 'https://api.example.com'}
  },

  pages: {
    home: {
      title: 'VMPA Demo - Home'
    },
    settings: {
      title: 'VMPA Demo - Settings'
    },
    'user-detail': {title: 'User Detail (renderer boundary demo)'}
  },

  // CDN externalisation. When enabled at build/preview time the kit strips
  // these packages from the bundle and injects `<script src>` tags with
  // onerror-chained URL fallback + local vendor chunk fallback. Offline
  // packages (dist-offline) always force the local fallback so the app
  // keeps working without network access.
  cdn: {
    enabled: true,
    applyOn: ['build'],
    fallback: 'local',
    timeoutMs: 5000,
    // globalNamespace: 'LhxCdn',  // default; uncomment+rename if it collides
    entries: [
      {
        name: 'vue',
        urls: [
          'https://unpkg.com/vue@3.5.13/dist/vue.runtime.global.prod.js',
          'https://cdn.jsdelivr.net/npm/vue@3.5.13/dist/vue.runtime.global.prod.js'
        ]
      },
      {
        // Pinia 2.x's IIFE bundle assumes a global `VueDemi` shim is already
        // present (it is NOT bundled inline). Without this entry the loader
        // would set up `window.Pinia` correctly but Pinia itself crashes at
        // module-evaluate time with `VueDemi is not defined`.
        name: 'vue-demi',
        depends: ['vue'],
        urls: [
          'https://unpkg.com/vue-demi@0.14.10/lib/index.iife.js',
          'https://cdn.jsdelivr.net/npm/vue-demi@0.14.10/lib/index.iife.js'
        ]
      },
      {
        name: 'vue-router',
        depends: ['vue'],
        urls: [
          'https://unpkg.com/vue-router@4.4.5/dist/vue-router.global.prod.js',
          'https://cdn.jsdelivr.net/npm/vue-router@4.4.5/dist/vue-router.global.prod.js'
        ]
      },
      {
        name: 'pinia',
        depends: ['vue', 'vue-demi'],
        urls: [
          'https://unpkg.com/pinia@2.2.6/dist/pinia.iife.prod.js',
          'https://cdn.jsdelivr.net/npm/pinia@2.2.6/dist/pinia.iife.prod.js'
        ]
      }
    ]
  }

  // Opt into the offline pipeline by uncommenting below AND creating
  // `offline.config.ts` next to this file. See docs or run:
  //   lhx-cli create --features=offline
  //
  // offline: {enabled: true}
});
