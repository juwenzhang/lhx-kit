import {existsSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {createJiti} from 'jiti';
import {resolveOfflineConfig, resolveProjectConfig} from './defaults';
import {ConfigError, diagnosticsFromZod} from './diagnostics';
import {
  type OfflineConfigRaw,
  type ProjectConfigRaw,
  type ResolvedOfflineConfig,
  type ResolvedProjectConfig,
  offlineConfigSchema,
  projectConfigSchema
} from './schema';

const PROJECT_FILES = ['project.config.ts', 'project.config.mjs', 'project.config.js', 'project.config.json'];
const OFFLINE_FILES = ['offline.config.ts', 'offline.config.mjs', 'offline.config.js', 'offline.config.json'];

export interface LoadResult<T> {
  config: T;
  file: string;
}

export interface LoadOptions {
  /**
   * When true, throw if the config file is missing. Default: true for project, false for offline.
   */
  required?: boolean;
}

async function importWithJiti(file: string): Promise<unknown> {
  const jiti = createJiti(dirname(file), {moduleCache: false, interopDefault: true});
  const loaded = await jiti.import(file);
  return unwrapDefault(loaded);
}

function unwrapDefault(mod: unknown): unknown {
  if (mod && typeof mod === 'object' && 'default' in (mod as Record<string, unknown>)) {
    const raw = (mod as Record<string, unknown>).default;
    // Nested default (ts-node style) sometimes appears, unwrap one more level.
    if (raw && typeof raw === 'object' && 'default' in (raw as Record<string, unknown>)) {
      return (raw as Record<string, unknown>).default;
    }
    return raw;
  }
  return mod;
}

function findConfigFile(root: string, candidates: string[]): string | null {
  for (const file of candidates) {
    const full = join(root, file);
    if (existsSync(full)) return full;
  }
  return null;
}

/**
 * Load and validate project.config.* from a project root directory.
 * Throws ConfigError with aggregated diagnostics on failure.
 */
export async function loadProjectConfig(
  rootDir: string,
  options: LoadOptions = {}
): Promise<LoadResult<ResolvedProjectConfig>> {
  const file = findConfigFile(rootDir, PROJECT_FILES);
  if (!file) {
    if (options.required === false) {
      throw new ConfigError([
        {
          level: 'info',
          code: 'project-config/missing',
          message: `No project.config.* found in ${rootDir}`
        }
      ]);
    }
    throw new ConfigError([
      {
        level: 'error',
        code: 'project-config/missing',
        message: `No project.config.* found in ${rootDir}. Create one with \`lhx-cli create\` or \`defineProjectConfig({...})\`.`
      }
    ]);
  }

  let raw: unknown;
  try {
    raw = await importWithJiti(file);
  } catch (error) {
    throw new ConfigError([
      {
        level: 'error',
        code: 'project-config/parse-error',
        message: `Failed to evaluate ${file}: ${error instanceof Error ? error.message : String(error)}`,
        source: file
      }
    ]);
  }

  const parsed = projectConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ConfigError(diagnosticsFromZod(parsed.error, file));
  }

  return {
    file,
    config: resolveProjectConfig(parsed.data as ProjectConfigRaw, rootDir)
  };
}

/**
 * Load and validate offline.config.* from a project root directory.
 * If the file does not exist but `project.offline.enabled === true`, returns null and a
 * diagnostic is expected to be raised by the caller (CLI/doctor).
 */
export async function loadOfflineConfig(
  rootDir: string,
  project: ResolvedProjectConfig,
  options: LoadOptions = {}
): Promise<LoadResult<ResolvedOfflineConfig> | null> {
  const file = findConfigFile(rootDir, OFFLINE_FILES);
  if (!file) {
    if (options.required) {
      throw new ConfigError([
        {
          level: 'error',
          code: 'offline-config/missing',
          message: `No offline.config.* found in ${rootDir}`
        }
      ]);
    }
    return null;
  }

  let raw: unknown;
  try {
    raw = await importWithJiti(file);
  } catch (error) {
    throw new ConfigError([
      {
        level: 'error',
        code: 'offline-config/parse-error',
        message: `Failed to evaluate ${file}: ${error instanceof Error ? error.message : String(error)}`,
        source: file
      }
    ]);
  }

  const parsed = offlineConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ConfigError(diagnosticsFromZod(parsed.error, file));
  }

  return {
    file,
    config: resolveOfflineConfig(parsed.data as OfflineConfigRaw, project)
  };
}

/**
 * Walks upward from `startDir` looking for the nearest project.config.*.
 * Returns the directory containing it, or null.
 */
export function findNearestProjectRoot(startDir: string): string | null {
  let current = resolve(startDir);
  while (true) {
    if (findConfigFile(current, PROJECT_FILES)) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * Convenience: load both configs from the same root.
 * Offline config is optional; returns `offline: null` when not present.
 */
export async function loadConfigs(rootDir: string): Promise<{
  project: LoadResult<ResolvedProjectConfig>;
  offline: LoadResult<ResolvedOfflineConfig> | null;
}> {
  const project = await loadProjectConfig(rootDir);
  const offline = await loadOfflineConfig(rootDir, project.config);
  return {project, offline};
}
