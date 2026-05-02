import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import type {
  CdnConfig,
  Framework,
  OfflineConfigRaw,
  PageDefinition,
  ProjectConfigRaw,
  ResolvedCdnConfig,
  ResolvedCdnEntry,
  ResolvedOfflineConfig,
  ResolvedPageDefinition,
  ResolvedProjectConfig
} from './schema';

/**
 * Aliases injected for every project. Kept intentionally small: the three
 * shown here are assumed by the MPA convention (`src/` is the source root,
 * pages and components are where the vite plugin / renderer / CLI look).
 *
 * Templates (vue3-mpa, react-mpa, …) may declare additional aliases like
 * `@stores`, `@services`, `@schemas`, `@logs`, `@flags` in their own
 * `project.config.ts`. Do NOT bake those into this defaults table: not every
 * project uses them, and doctor will (correctly) report missing directories
 * for any alias we materialize.
 */
const DEFAULT_ALIASES: Record<string, string> = {
  '@': 'src',
  '@pages': 'src/pages',
  '@components': 'src/components'
};

function pickEntryExt(framework: Framework): string {
  return framework === 'react' ? 'tsx' : 'ts';
}

function resolvePage(
  name: string,
  raw: PageDefinition,
  ctx: {pagesDir: string; publicDir: string; framework: Framework; projectOfflineEnabled: boolean}
): ResolvedPageDefinition {
  const ext = pickEntryExt(ctx.framework);
  const entry = raw.entry ?? `${ctx.pagesDir}/${name}/entry.${ext}`;
  // The default template lives at the project root so it's not treated as a
  // static asset by Vite's publicDir.
  const template = raw.template ?? 'template.html';
  const filename = raw.filename ?? `${name}.html`;
  const namespace = raw.namespace ?? name;
  return {
    ...raw,
    name,
    entry,
    template,
    filename,
    namespace,
    offline: raw.offline ?? false,
    meta: raw.meta ?? {}
  };
}

export function resolveProjectConfig(input: ProjectConfigRaw, cwd: string): ResolvedProjectConfig {
  const rootDir = resolve(cwd, input.rootDir ?? '.');
  const srcDir = input.srcDir ?? 'src';
  const pagesDir = input.pagesDir ?? `${srcDir}/pages`;
  const publicDir = input.publicDir ?? 'public';
  const outDir = input.outDir ?? 'dist';
  const projectOfflineEnabled = input.offline?.enabled === true;

  const aliases = {...DEFAULT_ALIASES, ...(input.aliases ?? {})};

  const pages: Record<string, ResolvedPageDefinition> = {};
  for (const [name, raw] of Object.entries(input.pages)) {
    pages[name] = resolvePage(name, raw, {
      pagesDir,
      publicDir,
      framework: input.framework,
      projectOfflineEnabled
    });
  }

  const cdn = resolveCdnConfig(input.cdn);

  return {
    ...input,
    rootDir,
    srcDir,
    pagesDir,
    publicDir,
    outDir,
    aliases,
    pages,
    cdn
  };
}

/**
 * Default UMD global name: `vue` → `Vue`, `vue-router` → `VueRouter`,
 * `@scope/pkg` → `ScopePkg` (last segment wins after dropping @scope).
 */
function defaultGlobalVar(name: string): string {
  const cleaned = name.replace(/^@[^/]+\//, '');
  return cleaned
    .split(/[-_./]/)
    .filter(Boolean)
    .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join('');
}

function resolveCdnConfig(input: CdnConfig | undefined): ResolvedCdnConfig {
  // Schema defaults only fire when the parent object is provided; otherwise
  // we synthesize a disabled one so consumers never have to null-check.
  if (!input) {
    return {
      enabled: false,
      applyOn: ['build'],
      fallback: 'local',
      timeoutMs: 5000,
      globalNamespace: 'LhxCdn',
      entries: []
    };
  }
  const entries: ResolvedCdnEntry[] = input.entries.map(entry => ({
    ...entry,
    globalVar: entry.globalVar ?? defaultGlobalVar(entry.name),
    externals: entry.externals ?? [entry.name],
    aliasGlobals: entry.aliasGlobals ?? [],
    localFallback: entry.localFallback ?? null,
    initScript: entry.initScript ?? null
  }));
  return {
    enabled: input.enabled,
    applyOn: input.applyOn,
    fallback: input.fallback,
    timeoutMs: input.timeoutMs,
    globalNamespace: input.globalNamespace,
    entries
  };
}

export function resolveOfflineConfig(input: OfflineConfigRaw, project: ResolvedProjectConfig): ResolvedOfflineConfig {
  return {
    ...input,
    outDir: input.outDir ?? `${project.outDir}-offline`
  };
}

/**
 * Resolve an alias target path against the resolved project rootDir.
 */
export function resolveAliasTarget(rootDir: string, target: string): string {
  return resolve(rootDir, target);
}

/**
 * Absolute path of a page entry file.
 */
export function absolutePageEntry(project: ResolvedProjectConfig, page: ResolvedPageDefinition): string {
  return resolve(project.rootDir, page.entry);
}

/**
 * Check if a project directory structure exists on disk (used by doctor, not by loaders).
 */
export function entryExists(project: ResolvedProjectConfig, page: ResolvedPageDefinition): boolean {
  return existsSync(absolutePageEntry(project, page));
}
