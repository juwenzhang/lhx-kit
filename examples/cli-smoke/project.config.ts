import {defineProjectConfig} from '@lhx-kit/config';

/**
 * Single source of truth for the whole lhx-kit pipeline (CLI / vite-plugin
 * / offline / renderer). Every field not listed here has a sensible default.
 * See the comments below for the full capability surface.
 */
export default defineProjectConfig({
  name: 'examples-cli-smoke',
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
      title: 'examples/cli-smoke - Home'
      // entry:     'src/pages/home/entry.ts',   // default = src/pages/<name>/entry.ts
      // template:  'template.html',              // default = project-root template.html
      // filename:  'home.html',                  // default = <name>.html
      // namespace: 'home',                       // default = <name>
      // offline:   false,                        // true → also packaged into offline zip
      // meta:      {description: 'Home page'}    // fills `{{ meta.description }}` in template.html
    },
    settings: {
      title: 'examples/cli-smoke - Settings'
    }
  }

  // ---------------------------------------------------------------------
  // CDN externalisation. When enabled at build/preview, listed packages are
  // stripped from the bundle and injected as <script src=https://…> with
  // onerror chained between mirrors and a final `import()` of a local
  // vendor chunk we also bundle on disk. The browser exposes a public API
  // at `window.<globalNamespace>` (default `'LhxCdn'`):
  //
  //   await window.LhxCdn.whenReady(['vue']);
  //   window.LhxCdn.on('fallback', ({name}) => console.warn('cdn fail', name));
  //   window.LhxCdn.state.vue;  // 'pending' | 'ok' | 'fallback' | 'failed'
  //
  // Offline packages (`lhx-cli offline build`) automatically force the local
  // fallback path so the app keeps working in fully air-gapped environments.
  //
  // cdn: {
  //   enabled: true,
  //   applyOn: ['build'],          // 'build' | 'preview' | 'dev'
  //   fallback: 'local',           // 'local' (recommended) | 'error'
  //   timeoutMs: 5000,
  //   globalNamespace: 'LhxCdn',   // override if it collides with your own globals
  //   entries: [
  //     {
  //       name: 'vue',
  //       urls: [
  //         'https://unpkg.com/vue@3.5.13/dist/vue.runtime.global.prod.js',
  //         'https://cdn.jsdelivr.net/npm/vue@3.5.13/dist/vue.runtime.global.prod.js'
  //       ]
  //     },
  //     {name: 'vue-demi', depends: ['vue'], urls: ['https://unpkg.com/vue-demi@0.14.10/lib/index.iife.js']},
  //     {name: 'vue-router', depends: ['vue'], urls: ['https://unpkg.com/vue-router@4.4.5/dist/vue-router.global.prod.js']},
  //     {name: 'pinia', depends: ['vue', 'vue-demi'], urls: ['https://unpkg.com/pinia@2.2.6/dist/pinia.iife.prod.js']}
  //   ]
  // }

  // Opt into the offline pipeline by uncommenting below AND creating
  // `offline.config.ts` next to this file. See docs or run:
  //   lhx-cli create --features=offline
  //
  // offline: {enabled: true}
});
