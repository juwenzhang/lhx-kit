/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference types="vite/client" />

declare module 'virtual:lhx-kit/project-config' {
  import type {SerializedProjectConfig} from '@lhx-kit/vite-plugin';
  const config: SerializedProjectConfig;
  export default config;
}

interface ImportMetaEnv {
  readonly LHX_API_BASE: string;
  readonly LHX_MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Public API exposed by the lhx-kit CDN loader at build time.
 *
 * The window property name is configurable via `cdn.globalNamespace` in
 * `project.config.ts` (default: `'LhxCdn'`). If you change it, also rename
 * this declaration so IDE completion stays accurate.
 */
declare interface Window {
  LhxCdn?: import('@lhx-kit/runtime/cdn-loader').LhxCdnApi;
}
