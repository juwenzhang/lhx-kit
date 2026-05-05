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
