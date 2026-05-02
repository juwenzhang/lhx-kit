/// <reference types="vite/client" />

declare module 'virtual:lhx-kit/project-config' {
  import type {SerializedProjectConfig} from '@lhx-kit/vite-plugin';
  const config: SerializedProjectConfig;
  export default config;
  export const pages: SerializedProjectConfig['pages'];
  export const env: SerializedProjectConfig['env'];
}
