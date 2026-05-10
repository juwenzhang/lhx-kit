import {defineProjectConfig} from '@lhx-kit/config';

/**
 * Single source of truth for the whole lhx-kit pipeline (CLI / vite-plugin
 * / offline / renderer). Every field not listed here has a sensible default.
 * See the comments below for the full capability surface.
 */
export default defineProjectConfig({
  name: 'rmpa',
  framework: 'react',

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
      title: 'RMPA Demo - Home'
      // entry:     'src/pages/home/entry.tsx',  // default = src/pages/<name>/entry.tsx
      // template:  'template.html',              // default = project-root template.html
      // filename:  'home.html',                  // default = <name>.html
      // namespace: 'home',                       // default = <name>
      // offline:   false,                        // true → also packaged into offline zip
      // meta:      {description: 'Home page'}    // fills `{{ meta.description }}` in template.html
    },
    settings: {
      title: 'RMPA Demo - Settings'
    },
    dashboard: {title: 'Dashboard'},
    'user-detail': {title: 'User Detail (renderer boundary demo)'}
  },

  // ---------------------------------------------------------------------
  // CDN externalisation is OFF for this demo — React 19 no longer ships a
  // UMD bundle, and `react-router-dom` UMD expects three pre-existing
  // globals (React, ReactRouter, @remix-run/router, the last of which
  // has no UMD at all). Shipping React + router inside the per-page
  // bundle keeps things simple and offline-friendly out of the box.
  //
  // If you absolutely need CDN externalisation for a React project, the
  // Preact + `preact/compat` recipe is documented in the kit; it uses
  // the kit's `aliasGlobals` / `initScript` / `localFallback` capabilities
  // to bridge `window.preactCompat` to `window.React` and polyfill
  // `createRoot`. See `docs/cdn-preact-recipe.md` for the full plan;
  // this demo stays on stock React so the `pnpm build` smoke test is
  // maximally deterministic.

  // Offline pipeline is enabled. See `offline.config.ts` next to this
  // file for whitelist / prefetch / rollback configuration. Build via:
  //   lhx-cli offline build --hybrid-type=test
  offline: {enabled: true}
});
