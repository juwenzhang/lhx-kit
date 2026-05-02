import type {EnvEntry, EnvMode, ResolvedOfflineConfig, ResolvedPageDefinition, ResolvedProjectConfig} from './schema';

export interface ListPagesOptions {
  /**
   * When true, return only pages that should be shipped in the offline zip:
   * - pages with `page.offline === true`, plus
   * - pages listed in offline.whitelistPages (if offline config provided).
   */
  offline?: boolean;
  /**
   * When provided, restrict to the given page names (used by LHX_PAGES filtering).
   */
  only?: string[];
}

export function listPages(
  project: ResolvedProjectConfig,
  offline?: ResolvedOfflineConfig | null,
  options: ListPagesOptions = {}
): ResolvedPageDefinition[] {
  const all = Object.values(project.pages);

  let filtered = all;
  if (options.offline) {
    const whitelist = new Set<string>();
    for (const p of all) {
      if (p.offline) whitelist.add(p.name);
    }
    for (const name of offline?.whitelistPages ?? []) {
      whitelist.add(name);
    }
    filtered = all.filter(p => whitelist.has(p.name));
  }

  if (options.only && options.only.length > 0) {
    const set = new Set(options.only);
    filtered = filtered.filter(p => set.has(p.name));
  }

  return filtered;
}

export function getPage(project: ResolvedProjectConfig, name: string): ResolvedPageDefinition {
  const page = project.pages[name];
  if (!page) {
    throw new Error(`Unknown page "${name}". Available: ${Object.keys(project.pages).join(', ')}`);
  }
  return page;
}

export function resolveEnv(project: ResolvedProjectConfig, mode: EnvMode): EnvEntry {
  const entry = project.envs[mode];
  if (entry) return entry;
  // Fall back to prod then the first declared env for safety.
  const fallbackOrder: EnvMode[] = ['prod', 'staging', 'test', 'dev'];
  for (const candidate of fallbackOrder) {
    const hit = project.envs[candidate];
    if (hit) return hit;
  }
  // envs schema guarantees at least one entry, so this is unreachable.
  throw new Error(`No env entries declared; mode "${mode}" not available.`);
}

export function resolveAlias(project: ResolvedProjectConfig, name: string): string | null {
  return project.aliases[name] ?? null;
}

export const ENV_MODES: readonly EnvMode[] = ['dev', 'test', 'staging', 'prod'];

export function normalizeEnvMode(mode: string | undefined): EnvMode {
  if (!mode) return 'dev';
  const lowered = mode.toLowerCase();
  if ((ENV_MODES as readonly string[]).includes(lowered)) return lowered as EnvMode;
  if (lowered === 'production') return 'prod';
  if (lowered === 'development') return 'dev';
  return 'dev';
}

/**
 * Extract `${var}` placeholders from a string; used for prefetch apiUrl validation.
 */
export function extractPlaceholders(input: string): string[] {
  const seen = new Set<string>();
  const re = /\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
  for (const match of input.matchAll(re)) seen.add(match[1]);
  return [...seen];
}
