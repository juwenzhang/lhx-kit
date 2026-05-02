/**
 * Thin CLI-side adapter over `@lhx-kit/config`.
 *
 * Design:
 * - All project config access in the CLI goes through this file.
 * - Commands that MUST have a config (dev/build/add/offline) call `requireProject()`
 *   which throws ConfigError with aggregated diagnostics.
 * - Commands that are "read-only diagnostics" (info/doctor) call `tryProject()`
 *   which returns `null` when the file is missing, or surfaces diagnostics
 *   without blowing up mid-render.
 */
import {
  ConfigError,
  type Diagnostic,
  type LoadResult,
  type ResolvedOfflineConfig,
  type ResolvedProjectConfig,
  findNearestProjectRoot,
  formatDiagnostics,
  loadOfflineConfig,
  loadProjectConfig
} from '@lhx-kit/config';

export type {ResolvedOfflineConfig, ResolvedProjectConfig} from '@lhx-kit/config';

export interface ProjectBundle {
  project: LoadResult<ResolvedProjectConfig>;
  offline: LoadResult<ResolvedOfflineConfig> | null;
}

export interface TryResult<T> {
  value: T | null;
  diagnostics: Diagnostic[];
}

/**
 * Load project config from the given cwd or throw a `ConfigError`.
 * Use this for commands that cannot proceed without a valid project config.
 */
export async function requireProject(cwd: string): Promise<ProjectBundle> {
  const project = await loadProjectConfig(cwd);
  const offline = await loadOfflineConfig(cwd, project.config);
  return {project, offline};
}

/**
 * Tolerant load: returns null when the file is missing, captures diagnostics
 * for schema failures without throwing.
 */
export async function tryProject(cwd: string): Promise<TryResult<ProjectBundle>> {
  try {
    const bundle = await requireProject(cwd);
    return {value: bundle, diagnostics: []};
  } catch (err) {
    if (err instanceof ConfigError) {
      // If the only diagnostic is `project-config/missing`, callers treat that
      // as "not in a project" rather than a hard failure.
      return {value: null, diagnostics: err.diagnostics};
    }
    throw err;
  }
}

/** Render an array of diagnostics as a single string for CLI output. */
export function describeDiagnostics(diagnostics: Diagnostic[]): string {
  return formatDiagnostics(diagnostics);
}

export {findNearestProjectRoot};
