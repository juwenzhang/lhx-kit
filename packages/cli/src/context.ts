import {existsSync, readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

/**
 * A lean view of the CLI's own `package.json`. Only the fields we actually
 * read elsewhere are typed — everything else would be unused churn. Extend
 * here (and in `readOwnPackage` below) when a new consumer needs more.
 */
export interface CliPackageInfo {
  name: string;
  version: string;
}

export interface CliContext {
  /** Directory the CLI was invoked from (user's project root in normal use). */
  cwd: string;
  /** The monorepo root when the CLI runs inside a pnpm workspace; otherwise `cwd`. */
  workspaceRoot: string;
  /** Absolute path of the CLI package (`@lhx-kit/cli`) on disk. */
  packageRoot: string;
  /** Bundled template directory — `${packageRoot}/templates`. */
  templatesDir: string;
  /** Parsed CLI `package.json` (name + version). */
  cliPackage: CliPackageInfo;
  /**
   * Caret-pinned semver range derived from `cliPackage.version`. Used by
   * `lhx-cli create` to write the `@lhx-kit/*` dependency versions into
   * generated `package.json` files, so bumping the CLI automatically
   * updates what new projects install.
   *
   *   0.0.1 → ^0.0.1     (pre-release; patch bumps auto-pick up)
   *   0.3.5 → ^0.3.0     (stable minor; minor bumps are deliberate)
   *   1.2.3 → ^1.2.0     (same; majors never leak)
   *
   * Rewritten to `workspace:*` when `--link-workspace` is passed, for
   * in-monorepo scaffolding.
   */
  lhxKitVersionRange: string;
}

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Walk up from `start` looking for a `pnpm-workspace.yaml`. Returns the
 * directory that contains it, or `start` itself if the CLI is run outside
 * a pnpm workspace (the common case for user projects).
 */
export function findWorkspaceRoot(start: string): string {
  let current = start;
  while (true) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) return current;
    const parent = dirname(current);
    if (parent === current) return start;
    current = parent;
  }
}

/**
 * Load the CLI's own `package.json`. A sync read at context-creation time
 * is acceptable: it happens once, before any command executes, and both
 * `bin.ts` (for `--version`) and `create.ts` (for dep pinning) need the
 * result before making user-visible decisions.
 *
 * Robustness: a missing/malformed package.json never aborts the CLI —
 * falls back to `{name: '@lhx-kit/cli', version: '0.0.0'}` so everything
 * continues to function, just with a conservative version string.
 */
function readOwnPackage(packageRoot: string): CliPackageInfo {
  try {
    const raw = readFileSync(resolve(packageRoot, 'package.json'), 'utf8');
    const json = JSON.parse(raw) as {name?: string; version?: string};
    return {
      name: json.name ?? '@lhx-kit/cli',
      version: json.version ?? '0.0.0'
    };
  } catch {
    return {name: '@lhx-kit/cli', version: '0.0.0'};
  }
}

/**
 * Convert a SemVer string to its caret-minor range.
 *
 *   "0.3.5"        → "^0.3.0"
 *   "1.2.3"        → "^1.2.0"
 *   "2.0.0-beta.1" → "^2.0.0-beta.1"    (pre-releases kept verbatim as a safe-default)
 *   "" / garbage   → "^0.0.0"
 */
function toCaretMinor(version: string): string {
  if (!version) return '^0.0.0';
  // Pre-release / build metadata: keep exact — we don't want `^0.5.0-beta.3`
  // to silently match a newer pre-release that breaks API.
  if (/[-+]/.test(version)) return `^${version}`;
  const match = version.match(/^(\d+)\.(\d+)\./);
  if (!match) return `^${version}`;
  return `^${match[1]}.${match[2]}.0`;
}

export function createContext(cwd = process.cwd()): CliContext {
  const packageRoot = resolve(here, '..');
  const cliPackage = readOwnPackage(packageRoot);
  return {
    cwd,
    workspaceRoot: findWorkspaceRoot(cwd),
    packageRoot,
    templatesDir: resolve(packageRoot, 'templates'),
    cliPackage,
    lhxKitVersionRange: toCaretMinor(cliPackage.version)
  };
}
