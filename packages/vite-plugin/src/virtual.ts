import type {EnvEntry, ResolvedPageDefinition, ResolvedProjectConfig} from '@lhx-kit/config';

export const VIRTUAL_ID = 'virtual:lhx-kit/project-config';
export const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`;

export interface SerializedProjectConfig {
  name: string;
  framework: ResolvedProjectConfig['framework'];
  mode: string;
  env: Omit<EnvEntry, 'proxy'>;
  pages: Array<{
    name: string;
    title: string;
    filename: string;
    namespace: string;
    meta: Record<string, string>;
    offline: boolean;
  }>;
}

export function serializeConfig(project: ResolvedProjectConfig, mode: string, env: EnvEntry): SerializedProjectConfig {
  // Strip proxy (contains dev-only URLs; not useful at runtime).
  const {proxy: _proxy, ...safeEnv} = env;
  return {
    name: project.name,
    framework: project.framework,
    mode,
    env: safeEnv,
    pages: Object.values(project.pages).map(page => toSerializedPage(page))
  };
}

function toSerializedPage(page: ResolvedPageDefinition) {
  return {
    name: page.name,
    title: page.title,
    filename: page.filename,
    namespace: page.namespace,
    meta: page.meta,
    offline: page.offline
  };
}

export function renderVirtualModuleCode(config: SerializedProjectConfig): string {
  const json = JSON.stringify(config, null, 2);
  return `const config = Object.freeze(${json});\nexport default config;\nexport const pages = config.pages;\nexport const env = config.env;\n`;
}
