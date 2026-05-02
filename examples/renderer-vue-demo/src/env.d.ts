/// <reference types="vite/client" />

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
