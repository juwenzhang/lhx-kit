import {defineOfflineConfig} from '@lhx-kit/config';

/**
 * Offline packaging config. Only evaluated when `lhx-cli offline build` (or
 * `lhx-cli build --offline`) is invoked. All fields are documented; start
 * minimal and extend as your hybrid pipeline requires.
 */
export default defineOfflineConfig({
  enabled: true,

  // At least one of `test` / `prod` must be set. `lhx-cli offline build`
  // picks one via `--hybrid-type=test|prod`. The resolved version goes into
  // the zip filename: `${YYYYMMDD}_${ts}_${hybridType}_v${version}.zip`.
  versions: {
    test: '0.1.0',
    prod: '0.1.0'
  },

  // Pages to include in the zip. The CLI also treats any page declared as
  // `offline: true` in project.config.ts as offline-eligible, so you can
  // leave this empty if you rely solely on that flag.
  whitelistPages: ['home'],

  // Prefetch rules: requests the runtime should warm before the user hits
  // an offline page. Each rule is addressed either by page name or URL.
  prefetch: [
    // {
    //   name: 'user-profile',
    //   match: {page: 'home'},
    //   apiUrl: '/api/user/${userId}',
    //   keys: ['userId'],
    //   maxAge: 3600,
    //   priority: 'high'
    // }
  ],

  // Rollback strategy when a prefetch / package fails validation.
  //   'previous' (default) → reuse the last successful package
  //   'none'               → drop offline mode and fall through to network
  rollback: {strategy: 'previous'},

  // Free-form metadata forwarded into the manifest. Useful for hybridType
  // / channel / ops tags read by deploy systems.
  metadata: {
    channel: 'default'
  }

  // outDir: 'dist-offline'   // default = `<project.outDir>-offline`
});
