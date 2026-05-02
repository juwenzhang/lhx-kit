import type {OfflineConfigInput, ProjectConfigInput} from './schema';

/**
 * Identity helper with type inference. Users write:
 *   export default defineProjectConfig({...});
 * and get completion on pages/envs/aliases.
 */
export function defineProjectConfig<T extends ProjectConfigInput>(config: T): T {
  return config;
}

export function defineOfflineConfig<T extends OfflineConfigInput>(config: T): T {
  return config;
}
