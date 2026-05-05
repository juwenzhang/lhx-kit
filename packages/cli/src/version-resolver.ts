import {execa} from 'execa';

/**
 * Strategy for resolving `@lhx-kit/*` dependency versions written into the
 * generated `package.json`:
 *
 *   - `'auto'`   — run `npm view @lhx-kit/cli version` and use the returned
 *                  caret-minor range. The most accurate option for users
 *                  outside the monorepo, but requires network. Falls back to
 *                  `local` on failure (e.g. offline / private registry).
 *   - `'local'`  — use the CLI's own version (`@lhx-kit/cli/package.json`).
 *                  Stable, no network dependency, but may lag if the CLI
 *                  install is older than the latest published kit.
 *   - explicit   — any other string is treated as a literal version range
 *                  (e.g. `^1.2.0`, `workspace:*`, `1.2.3`). Used by users who
 *                  want to pin to a specific kit version intentionally.
 */
export type VersionStrategy = 'auto' | 'local' | string;

/**
 * Convert a SemVer string to its caret-minor range (mirrors `toCaretMinor`
 * in context.ts so users get consistent dep-pinning shape regardless of
 * whether the version was read locally or fetched from npm).
 */
function toCaretMinor(version: string): string {
  if (!version) return '^0.0.0';
  if (/[-+]/.test(version)) return `^${version}`;
  const match = version.match(/^(\d+)\.(\d+)\./);
  if (!match) return `^${version}`;
  return `^${match[1]}.${match[2]}.0`;
}

/**
 * Probe `npm view` for the latest published version of an arbitrary package.
 * Returns `null` (not throws) on any failure — registry unreachable, package
 * unpublished, npm not on PATH, etc. Callers fall back to the local version.
 *
 * Timeout: 10s. Far longer than typical (<1s) but generous enough for slow
 * mirrors and corporate proxies. Beyond that we'd rather scaffold with the
 * local version than block the user.
 */
async function probeNpmRegistry(packageName: string): Promise<string | null> {
  try {
    const {stdout} = await execa('npm', ['view', packageName, 'version'], {
      timeout: 10_000,
      reject: false
    });
    const version = stdout.trim();
    if (!version) return null;
    if (!/^\d+\.\d+\.\d+/.test(version)) return null;
    return version;
  } catch {
    return null;
  }
}

/**
 * In-process cache so repeated lookups during one scaffold (8 `@lhx-kit/*`
 * packages) don't fan out into 8 npm calls when nothing changed. Cleared
 * between distinct CLI invocations because the module is fresh-imported.
 */
const versionCache = new Map<string, string | null>();

async function probeCached(packageName: string): Promise<string | null> {
  if (versionCache.has(packageName)) {
    const cached = versionCache.get(packageName);
    return cached ?? null;
  }
  const version = await probeNpmRegistry(packageName);
  versionCache.set(packageName, version);
  return version;
}

export interface ResolveOptions {
  /** Strategy chosen by the user (CLI flag) or default `'auto'`. */
  strategy: VersionStrategy;
  /** Local fallback range (computed from CLI's own package.json). */
  localRange: string;
  /** Optional callback for surface-level diagnostics — UI module subscribes. */
  onResolved?: (info: {chosen: 'auto' | 'local' | 'explicit'; range: string; reason?: string}) => void;
}

/**
 * Resolve the version range used to pin `@lhx-kit/*` dependencies in the
 * generated project. See `VersionStrategy` for behavior per option.
 */
export async function resolveLhxKitVersionRange(options: ResolveOptions): Promise<string> {
  const {strategy, localRange, onResolved} = options;

  if (strategy === 'local') {
    onResolved?.({chosen: 'local', range: localRange});
    return localRange;
  }
  if (strategy !== 'auto') {
    // Treat any other string as a literal pin (`^1.2.0`, `workspace:*`, etc).
    onResolved?.({chosen: 'explicit', range: strategy});
    return strategy;
  }

  const published = await probeCached('@lhx-kit/cli');
  if (published === null) {
    onResolved?.({
      chosen: 'local',
      range: localRange,
      reason: 'npm view @lhx-kit/cli failed; using local CLI version'
    });
    return localRange;
  }
  const range = toCaretMinor(published);
  onResolved?.({chosen: 'auto', range, reason: `npm view @lhx-kit/cli → ${published}`});
  return range;
}

/**
 * Default set of npm-scope prefixes that are treated as "internal" — i.e.
 * dynamically resolved against the registry on scaffold. Anything matching
 * these prefixes is also the safe target of `--link-workspace`'s rewrite to
 * `workspace:*`, since they're authored in this monorepo.
 *
 * Ordering matters only for readability — matching is by `startsWith`, so
 * `@lhx-kit/` and `@lhx-business/` don't overlap.
 */
export const DEFAULT_INTERNAL_PACKAGE_PREFIXES: readonly string[] = ['@lhx-kit/', '@lhx-cli/', '@lhx-business/'];

function isInternalDep(name: string, prefixes: readonly string[]): boolean {
  return prefixes.some(prefix => name.startsWith(prefix));
}

export interface PerPackageRewriteOptions {
  strategy: VersionStrategy;
  /** Range to use when `strategy === 'local'` or npm view fails for a package. */
  fallbackRange: string;
  /**
   * Scope prefixes to treat as internal (rewriteable). Defaults to
   * `DEFAULT_INTERNAL_PACKAGE_PREFIXES`. Templates can extend this via
   * `template.json#internalPackagePrefixes` so future business / micro-frontend
   * packages also get dynamic version resolution.
   */
  internalPrefixes?: readonly string[];
  /** Optional progress hook — receives `{name, range, source}` per dep. */
  onResolvedDep?: (info: {name: string; range: string; source: 'auto' | 'fallback' | 'explicit'}) => void;
}

/**
 * Per-package dynamic resolution: walk every internal-scope entry across
 * `dependencies` / `devDependencies` / `peerDependencies` in the parsed
 * `package.json` and ask the registry for each one independently. With the
 * in-process cache, duplicates across dep sections only cost one npm call.
 *
 * "Internal" is defined by `internalPrefixes` (defaults to `@lhx-kit/`,
 * `@lhx-cli/`, `@lhx-business/`). Anything outside the prefix list is left
 * untouched — third-party deps keep whatever range the template author wrote.
 *
 * Returns a NEW package.json object with the resolved ranges; the caller
 * persists it. Mutating in place is avoided so callers can diff.
 *
 * Behavior per strategy:
 *   - `'auto'` (default): query `npm view <pkg> version` per matched dep,
 *                         write `^x.y.0`. Falls back to `fallbackRange` for
 *                         any package whose probe fails.
 *   - `'local'` / explicit: skip the network and use the value as-is.
 */
export async function resolveLhxKitDepsPerPackage(
  pkg: Record<string, unknown>,
  options: PerPackageRewriteOptions
): Promise<Record<string, unknown>> {
  const {strategy, fallbackRange, onResolvedDep, internalPrefixes = DEFAULT_INTERNAL_PACKAGE_PREFIXES} = options;
  const next: Record<string, unknown> = {...pkg};

  for (const field of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
    const original = next[field];
    if (!original || typeof original !== 'object' || Array.isArray(original)) continue;
    const updated: Record<string, string> = {...(original as Record<string, string>)};
    for (const depName of Object.keys(updated)) {
      if (!isInternalDep(depName, internalPrefixes)) continue;
      if (strategy === 'local') {
        updated[depName] = fallbackRange;
        onResolvedDep?.({name: depName, range: fallbackRange, source: 'fallback'});
        continue;
      }
      if (strategy !== 'auto') {
        updated[depName] = strategy;
        onResolvedDep?.({name: depName, range: strategy, source: 'explicit'});
        continue;
      }
      const published = await probeCached(depName);
      if (published === null) {
        updated[depName] = fallbackRange;
        onResolvedDep?.({name: depName, range: fallbackRange, source: 'fallback'});
      } else {
        const range = toCaretMinor(published);
        updated[depName] = range;
        onResolvedDep?.({name: depName, range, source: 'auto'});
      }
    }
    next[field] = updated;
  }

  return next;
}
