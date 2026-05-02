/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference types="vite/client" />
/// <reference path="./types/auto-imports.d.ts" />
/// <reference path="./types/components.d.ts" />

declare module 'virtual:lhx-kit/project-config' {
  import type {SerializedProjectConfig} from '@lhx-kit/vite-plugin';
  const config: SerializedProjectConfig;
  export default config;
}

declare module '*.vue' {
  import type {DefineComponent} from 'vue';
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
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

// Declare 3rd-party modules that ship without type defs
declare module 'postcss-pxtorem';
