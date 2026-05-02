/**
 * Bridge `@lhx-kit/config` (project+offline resolved configs) into the shape
 * that `@lhx-kit/offline` consumes today.
 *
 * Context:
 * - `@lhx-kit/offline` still owns its own `OfflineConfig` schema (pages as an
 *   explicit array, prefetch list, rollback strategy, …).
 * - `@lhx-kit/config` stores offline as "versions + whitelist + prefetch rules",
 *   while pages live under `project.config`.
 * - Fully merging them is tracked in align §4. Until then this adapter keeps
 *   the CLI behaviour correct: offline pages are derived from project.pages
 *   intersected with `page.offline === true` OR `offline.whitelistPages`.
 */
import {relative, resolve as resolvePath} from 'node:path';
import type {ResolvedOfflineConfig, ResolvedProjectConfig} from '@lhx-kit/config';
import type {OfflineConfig as OfflinePackageConfig, OfflinePage, OfflinePrefetch} from '@lhx-kit/offline';

export type HybridType = 'prod' | 'test';

export interface DeriveOptions {
  hybridType?: HybridType;
  /** Override buildDir; defaults to `<project.outDir>` (usually `dist`). */
  buildDir?: string;
  /** Override outDir; defaults to `<rootDir>/dist-offline`. */
  outDir?: string;
}

function pickVersion(
  offline: ResolvedOfflineConfig,
  hybridType: HybridType | undefined
): {version: string; resolvedHybridType: HybridType} {
  const ht = hybridType ?? (offline.versions.prod ? 'prod' : 'test');
  const version = ht === 'prod' ? offline.versions.prod : offline.versions.test;
  if (!version) {
    const available =
      [offline.versions.prod ? 'prod' : null, offline.versions.test ? 'test' : null].filter(Boolean).join(', ') ||
      '(none)';
    throw new Error(
      `offline.versions.${ht} is not declared; available: ${available}. Pass --hybrid-type to pick a declared version.`
    );
  }
  return {version, resolvedHybridType: ht};
}

function deriveOfflinePages(project: ResolvedProjectConfig, offline: ResolvedOfflineConfig): OfflinePage[] {
  const byFlag = new Set<string>();
  for (const page of Object.values(project.pages)) {
    if (page.offline) byFlag.add(page.name);
  }
  for (const name of offline.whitelistPages ?? []) {
    byFlag.add(name);
  }

  const result: OfflinePage[] = [];
  for (const page of Object.values(project.pages)) {
    if (!byFlag.has(page.name)) continue;
    // Per-page build layout writes `<page>/index.html` under dist/.
    const file = `${page.name}/index.html`;
    const route = `/${page.name}`;
    const entry: OfflinePage = {
      name: page.name,
      title: page.title,
      route,
      file
    };
    // Map prefetch rules that target this page.
    const prefetch: string[] = [];
    for (const rule of offline.prefetch ?? []) {
      if ('page' in rule.match && rule.match.page === page.name) {
        prefetch.push(rule.name);
      }
    }
    if (prefetch.length) entry.prefetch = prefetch;
    result.push(entry);
  }

  return result;
}

function deriveGlobalPrefetch(offline: ResolvedOfflineConfig): OfflinePrefetch[] {
  const out: OfflinePrefetch[] = [];
  for (const rule of offline.prefetch ?? []) {
    out.push({
      name: rule.name,
      // Offline package uses `path` semantically; we reuse apiUrl here.
      path: rule.apiUrl,
      as: 'fetch',
      priority: rule.priority === 'normal' ? 'medium' : (rule.priority ?? 'medium')
    });
  }
  return out;
}

/**
 * Build a filename like `20260501_1714699200_prod_v1.2.3.zip`.
 */
export function formatOfflineZipName(version: string, hybridType: HybridType, now: Date = new Date()): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const ts = Math.floor(now.getTime() / 1000);
  return `${yyyy}${mm}${dd}_${ts}_${hybridType}_v${version}.zip`;
}

export interface DerivedOfflineConfig {
  config: OfflinePackageConfig;
  resolvedHybridType: HybridType;
  buildDirAbs: string;
  outDirAbs: string;
}

export function deriveOfflineConfig(
  project: ResolvedProjectConfig,
  offline: ResolvedOfflineConfig,
  options: DeriveOptions = {}
): DerivedOfflineConfig {
  const {version, resolvedHybridType} = pickVersion(offline, options.hybridType);
  const pages = deriveOfflinePages(project, offline);
  if (pages.length === 0) {
    throw new Error(
      'No offline pages resolved. Mark pages with `offline: true` in project.config.ts ' +
        'or list them under offline.whitelistPages.'
    );
  }

  const rootDir = project.rootDir;
  const buildDirAbs = resolvePath(rootDir, options.buildDir ?? project.outDir);
  const outDirAbs = resolvePath(rootDir, options.outDir ?? offline.outDir);

  const config: OfflinePackageConfig = {
    enabled: offline.enabled,
    packageName: project.name,
    version,
    // The offline package stores these relative-ish; keep consistent with today's CLI.
    buildDir: relative(rootDir, buildDirAbs) || '.',
    outDir: relative(rootDir, outDirAbs) || '.',
    basePath: '/',
    pages,
    prefetch: deriveGlobalPrefetch(offline),
    rollback: {strategy: offline.rollback?.strategy === 'none' ? 'online' : 'previous'},
    metadata: {
      ...(offline.metadata ?? {}),
      hybridType: resolvedHybridType
    },
    // Packaging-time filters. Defaults keep MSW and other dev-only public
    // assets out of the offline bundle; users can extend via offline.config.ts
    // `excludeFilenames` / `excludePaths` (future – not wired through yet).
    sharedDir: 'shared',
    excludeFilenames: ['mockServiceWorker.js'],
    excludePaths: []
  };

  return {config, resolvedHybridType, buildDirAbs, outDirAbs};
}
