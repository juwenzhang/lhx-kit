import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir, readFile, stat, writeFile} from 'node:fs/promises';
import {dirname, join, posix, relative, resolve} from 'node:path';
import {promisify} from 'node:util';
import {brotliCompress, gzip, constants as zlibConstants} from 'node:zlib';
import AdmZip from 'adm-zip';
import fse from 'fs-extra';
import {z} from 'zod';

const brotliAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

export const OfflinePageSchema = z.object({
  name: z.string(),
  title: z.string().optional(),
  route: z.string(),
  file: z.string(),
  prefetch: z.array(z.string()).optional()
});

export const OfflinePrefetchSchema = z.object({
  name: z.string(),
  path: z.string(),
  as: z.enum(['document', 'script', 'style', 'image', 'font', 'fetch']).default('fetch'),
  priority: z.enum(['high', 'medium', 'low']).default('medium')
});

export const OfflineRollbackSchema = z.object({
  strategy: z.enum(['previous', 'online']).default('previous'),
  fallbackVersion: z.string().optional()
});

export const OfflineConfigSchema = z.object({
  enabled: z.boolean().default(true),
  packageName: z.string(),
  version: z.string().default('0.0.0'),
  buildDir: z.string().default('dist'),
  outDir: z.string().default('dist-offline'),
  basePath: z.string().default('/'),
  pages: z.array(OfflinePageSchema).min(1),
  prefetch: z.array(OfflinePrefetchSchema).default([]),
  rollback: OfflineRollbackSchema.default({strategy: 'previous'}),
  metadata: z.record(z.string(), z.unknown()).default({}),
  /** Directory under buildDir that holds chunks shared across all pages. */
  sharedDir: z.string().default('shared'),
  /**
   * File names (basename, case-insensitive) to exclude from the package. These
   * are dev-only artefacts vite copies from `public/` into `dist/` but should
   * never ship to an offline container (e.g. MSW's service worker).
   */
  excludeFilenames: z.array(z.string()).default(['mockServiceWorker.js']),
  /** Extra glob-ish path prefixes (relative to buildDir) to exclude. */
  excludePaths: z.array(z.string()).default([]),
  /**
   * Concurrency for fingerprint / copy IO. Defaults balance CPU (sha256) and
   * filesystem fd budgets on typical laptops. Lower to avoid `EMFILE` on very
   * restricted environments; raise on beefy CI if profiling says IO idle.
   */
  hashConcurrency: z.number().int().min(1).max(64).default(8),
  copyConcurrency: z.number().int().min(1).max(64).default(16)
});

export type OfflineConfig = z.infer<typeof OfflineConfigSchema>;
export type OfflinePage = z.infer<typeof OfflinePageSchema>;
export type OfflinePrefetch = z.infer<typeof OfflinePrefetchSchema>;

export interface OfflineManifestAsset {
  path: string;
  size: number;
  hash: string;
  contentType?: string;
}

export interface OfflineManifest {
  /**
   * Schema version of the manifest. Stays at `1.0.0` for the package-hash
   * addition: all new fields are **optional** on top of 1.0.0, so existing
   * consumers (hybrid containers, ops platforms) keep working unchanged.
   * A breaking schema change would bump to `1.1.0` and signal consumers
   * to migrate.
   */
  schemaVersion: string;
  packageName: string;
  version: string;
  generatedAt: string;
  basePath: string;
  pages: OfflinePage[];
  prefetch: OfflinePrefetch[];
  rollback: z.infer<typeof OfflineRollbackSchema>;
  metadata: Record<string, unknown>;
  totalSize: number;
  assets: OfflineManifestAsset[];
  /**
   * SHA-256 of the produced zip as a whole. Present only after
   * `buildOfflinePackage` with `zip: true`. Ops systems can use this as the
   * authoritative version identifier (more stable than the filename
   * convention, which bakes in a timestamp). Absent on directory-only output
   * and on pre-0.0.3 manifests.
   */
  packageHash?: string;
  /** Size in bytes of the zip archive. Companion to `packageHash`. */
  packageSize?: number;
}

export interface InspectionResult {
  packageName?: string;
  version?: string;
  /** `true` iff there are **no missing files** (hard errors). Warnings do not flip this. */
  valid: boolean;
  pageCount: number;
  assetCount: number;
  totalSize: number;
  largeAssets: OfflineManifestAsset[];
  /** Hard errors: files declared in the manifest that aren't physically present. Keeps `valid` honest. */
  missingFiles: string[];
  /**
   * Soft diagnostics that *strongly suggest* a broken build without being
   * definitely fatal. Printed by the CLI; does NOT affect `valid`. Exposed
   * so callers can decide their own strictness (`--strict` on CI, etc.).
   */
  warnings?: string[];
  manifestPath?: string;
  /** Whole-package SHA-256 — mirrors `OfflineManifest.packageHash`. */
  packageHash?: string;
  packageSize?: number;
}

const EXT_CONTENT_TYPE: Record<string, string> = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.map': 'application/json'
};

function contentTypeOf(file: string): string | undefined {
  const dot = file.lastIndexOf('.');
  if (dot < 0) return undefined;
  return EXT_CONTENT_TYPE[file.slice(dot).toLowerCase()];
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log10(bytes) / 3));
  const value = bytes / 10 ** (exponent * 3);
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 2)} ${units[exponent]}`;
}

export function normalizeOfflineConfig(input: unknown): OfflineConfig {
  return OfflineConfigSchema.parse(input);
}

/**
 * Minimal promise-concurrency limiter. Used to parallelize fingerprint / copy
 * IO without taking on a full `p-limit` dependency (we'd be the only
 * consumer). Behaviour matches `p-limit@4` for our uses:
 *   - Returns an async function; each invocation queues a task.
 *   - Never runs more than `max` tasks simultaneously.
 *   - Propagates both resolve and reject, maintaining arrival order of
 *     queued tasks (not strict completion order, same as p-limit).
 */
function createLimiter(max: number): <T>(fn: () => Promise<T>) => Promise<T> {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = (): void => {
    if (active >= max || queue.length === 0) return;
    active++;
    const run = queue.shift();
    run?.();
  };
  return function run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolvePromise, rejectPromise) => {
      const task = (): void => {
        fn()
          .then(resolvePromise, rejectPromise)
          .finally(() => {
            active--;
            next();
          });
      };
      if (active < max) {
        active++;
        task();
      } else {
        queue.push(task);
      }
    });
  };
}

async function hashFile(filePath: string): Promise<string> {
  return new Promise((resolveHash, rejectHash) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', rejectHash);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolveHash(hash.digest('hex')));
  });
}

/**
 * Streaming SHA-256 over an on-disk file. Kept private; used for the
 * whole-package hash (see `buildOfflinePackage`). Streaming keeps memory
 * constant even for 100+MB zips.
 */
async function hashFileAtPath(filePath: string): Promise<string> {
  return hashFile(filePath);
}

async function walkFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  async function walk(current: string): Promise<void> {
    const entries = await fse.readdir(current, {withFileTypes: true});
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        result.push(full);
      }
    }
  }
  await walk(root);
  return result.sort();
}

/**
 * Decide whether a file inside `buildDir` is part of the offline package for
 * the given config. A file is INCLUDED when any of:
 *   - it lives under a whitelisted page directory (`<pageName>/...`);
 *   - it lives under the shared chunks directory (`<sharedDir>/...`);
 *   - it is a top-level static asset (e.g. `favicon.ico`) that isn't a page
 *     directory and is not in the exclusion list.
 *
 * It is EXCLUDED when:
 *   - its basename matches `excludeFilenames` (case-insensitive);
 *   - its path starts with any entry in `excludePaths`;
 *   - it lives in a page directory that isn't part of `config.pages`.
 */
function buildOfflineFileFilter(config: OfflineConfig): (relPath: string) => boolean {
  const pageDirs = new Set(config.pages.map(p => p.name));
  const sharedDir = (config.sharedDir || 'shared').replace(/^\/+|\/+$/g, '');
  const excludeFilenames = new Set((config.excludeFilenames ?? []).map(n => n.toLowerCase()));
  const excludePaths = (config.excludePaths ?? []).map(p => p.replace(/^\/+|\/+$/g, ''));

  return (relPath: string) => {
    const normalized = relPath.split('\\').join('/').replace(/^\/+/, '');
    const base = normalized.split('/').pop() ?? normalized;

    if (excludeFilenames.has(base.toLowerCase())) return false;
    for (const prefix of excludePaths) {
      if (prefix && (normalized === prefix || normalized.startsWith(`${prefix}/`))) {
        return false;
      }
    }

    const firstSegment = normalized.split('/')[0];
    // A directory at the top level that *looks* like a page dir but isn't
    // whitelisted → drop it entirely. We detect "looks like a page dir" by
    // requiring the file to live inside that directory (i.e. there is a `/`).
    if (normalized.includes('/')) {
      if (firstSegment === sharedDir) return true;
      if (pageDirs.has(firstSegment)) return true;
      // Top-level nested directory that isn't shared nor a whitelisted page
      // is treated as "another page's output" and excluded.
      return false;
    }

    // Top-level files (favicon, robots.txt, etc.) are always included unless
    // explicitly excluded above.
    return true;
  };
}

export async function generateOfflineManifest(config: OfflineConfig, buildDir: string): Promise<OfflineManifest> {
  const files = await walkFiles(buildDir);
  const filter = buildOfflineFileFilter(config);
  const hashLimit = createLimiter(config.hashConcurrency ?? 8);

  // Pre-filter to avoid doing any IO on files we already know don't belong.
  const targets = files
    .map(file => ({file, rel: posix.normalize(relative(buildDir, file).split('\\').join('/'))}))
    .filter(t => filter(t.rel));

  // Fan out stat + hash in parallel. Prior to 0.0.3 this was a tight
  // `for...of await` loop and dominated the offline build on projects with
  // 100+ assets (every file serialised a ~5ms sha256 stream). Under the
  // concurrency cap the wall time collapses to ~`total / concurrency` with
  // no change to the produced bytes.
  const entries = await Promise.all(
    targets.map(t =>
      hashLimit(async () => {
        const [stats, hash] = await Promise.all([stat(t.file), hashFile(t.file)]);
        return {
          path: t.rel,
          size: stats.size,
          hash,
          contentType: contentTypeOf(t.rel)
        } satisfies OfflineManifestAsset;
      })
    )
  );

  // Keep the on-disk manifest deterministic by sorting. `walkFiles` already
  // returns sorted paths, but Promise.all resolves in arrival order; we
  // re-sort defensively so two runs of the same dist/ always produce the
  // same manifest.json (byte-identical aside from `generatedAt`).
  const assets = entries.sort((a, b) => a.path.localeCompare(b.path));
  const totalSize = assets.reduce((s, a) => s + a.size, 0);

  return {
    schemaVersion: '1.0.0',
    packageName: config.packageName,
    version: config.version,
    generatedAt: new Date().toISOString(),
    basePath: config.basePath,
    pages: config.pages,
    prefetch: config.prefetch,
    rollback: config.rollback,
    metadata: config.metadata,
    totalSize,
    assets
  };
}

export async function writeOfflineManifest(manifest: OfflineManifest, outDir: string): Promise<string> {
  await mkdir(outDir, {recursive: true});
  const manifestPath = join(outDir, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  return manifestPath;
}

async function copyBuildToOffline(
  buildDir: string,
  outDir: string,
  assets: OfflineManifestAsset[],
  copyConcurrency: number
): Promise<string> {
  // Copy exactly the assets listed in the manifest. This keeps the manifest
  // and the on-disk `files/` folder 100% in sync and avoids shipping anything
  // the filter decided to drop (e.g. non-whitelisted pages, MSW sw).
  const filesDir = join(outDir, 'files');
  await fse.remove(filesDir);
  await mkdir(filesDir, {recursive: true});

  // Pre-create every unique directory sequentially (cheap) so the parallel
  // copy tasks below don't race on `mkdir -p`. This also bounds the number
  // of distinct inode-creation syscalls before we open file descriptors.
  const dirs = new Set<string>();
  for (const asset of assets) {
    dirs.add(dirname(join(filesDir, asset.path)));
  }
  for (const dir of dirs) {
    await mkdir(dir, {recursive: true});
  }

  const limit = createLimiter(copyConcurrency);
  // Phase 1: copy all files in parallel. HTML rewrites happen in phase 2 to
  // keep each task single-purpose (easier to reason about error modes).
  await Promise.all(
    assets.map(asset =>
      limit(async () => {
        const src = join(buildDir, asset.path);
        const dst = join(filesDir, asset.path);
        await fse.copyFile(src, dst);
      })
    )
  );

  // Phase 2: post-process HTML files. Offline packages must work in fully
  // air-gapped environments; we rewrite each HTML's CDN loader plan so the
  // urls list is empty — the loader falls through to `loadLocalFallback`
  // immediately. After the rewrite, any precompressed siblings (`.html.br`
  // / `.html.gz`, produced by `@lhx-kit/vite-plugin`'s compress side-plugin)
  // must be regenerated, otherwise a container doing Content-Encoding
  // negotiation would serve the stale pre-rewrite bytes — causing DNS
  // lookups for CDN hosts that are unreachable offline.
  const htmlAssets = assets.filter(a => a.path.endsWith('.html'));
  await Promise.all(
    htmlAssets.map(asset =>
      limit(async () => {
        const dst = join(filesDir, asset.path);
        const rewritten = await stripCdnUrlsFromHtml(dst);
        if (!rewritten) return;
        await regeneratePrecompressedSiblings(dst);
      })
    )
  );

  return filesDir;
}

/**
 * In-place HTML rewrite that does two things:
 *   1. Empties `urls:[…]` inside the inlined CDN plan JSON so the loader
 *      runs `loadLocalFallback` on first failUrl call;
 *   2. Removes the trailing `<script src="https://…" onerror=…></script>`
 *      tags injected for each CDN entry, so no network request is even
 *      attempted.
 *
 * The kit owns the surrounding `<!-- lhx-kit: CDN loader -->` comment block
 * markers, which makes the rewrite range easy to delimit. Files without a
 * loader block are left untouched.
 *
 * Returns `true` iff the file was actually rewritten (caller then knows to
 * regenerate `.br`/`.gz` siblings). Returns `false` for HTML without the
 * loader block (no-op) or files we couldn't read (missing, corrupt — we
 * don't want to take down the whole build for a non-HTML-ish asset).
 */
async function stripCdnUrlsFromHtml(htmlPath: string): Promise<boolean> {
  let html: string;
  try {
    html = await readFile(htmlPath, 'utf8');
  } catch {
    return false;
  }
  const start = html.indexOf('<!-- lhx-kit: CDN loader -->');
  const end = html.indexOf('<!-- /lhx-kit: CDN loader -->');
  if (start < 0 || end < 0) return false;

  const before = html.slice(0, start);
  const block = html.slice(start, end);
  const after = html.slice(end);

  // Empty all `"urls":[...]` arrays inside the plan JSON. We use a simple
  // tolerant pattern (matches any non-greedy `[...]` directly after `"urls":`)
  // which is fine because the plan is generated by us and never contains
  // nested arrays inside `urls`.
  const blockNoUrls = block.replace(/"urls":\s*\[[^\]]*\]/g, '"urls":[]');
  // Drop the per-entry `<script src="https://…">` tags entirely; the empty
  // urls list above is sufficient on its own, but removing the tags avoids
  // even DNS lookups in environments where CDN hosts are unreachable.
  const blockNoTags = blockNoUrls.replace(/<script\s+src="https?:[^"]*"[^>]*><\/script>\s*/g, '');

  const next = before + blockNoTags + after;
  if (next === html) return false;
  await writeFile(htmlPath, next);
  return true;
}

/**
 * After an in-place HTML rewrite, regenerate any `.br` / `.gz` siblings that
 * `@lhx-kit/vite-plugin`'s compress side-plugin may have emitted alongside
 * the original file. We only touch siblings that already exist — we do NOT
 * create new ones: if the vite build chose not to precompress this file,
 * neither should we.
 *
 * Failure here is non-fatal: at worst the container falls back to serving
 * the (already-rewritten) identity file, which is still correct.
 */
async function regeneratePrecompressedSiblings(htmlPath: string): Promise<void> {
  let buf: Buffer;
  try {
    buf = await readFile(htmlPath);
  } catch {
    return;
  }
  const brPath = `${htmlPath}.br`;
  const gzPath = `${htmlPath}.gz`;
  const [hasBr, hasGz] = await Promise.all([fse.pathExists(brPath), fse.pathExists(gzPath)]);

  const tasks: Promise<void>[] = [];
  if (hasBr) {
    tasks.push(
      brotliAsync(buf, {
        params: {
          [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
          [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_TEXT
        }
      })
        .then(out => writeFile(brPath, out))
        // Swallow: precompressed siblings are an optimisation, not critical.
        .catch(() => undefined)
    );
  }
  if (hasGz) {
    tasks.push(
      gzipAsync(buf, {level: 9})
        .then(out => writeFile(gzPath, out))
        .catch(() => undefined)
    );
  }
  await Promise.all(tasks);
}

async function createZip(outDir: string, packageName: string, version: string): Promise<string> {
  const zip = new AdmZip();
  const manifestPath = join(outDir, 'manifest.json');
  const filesDir = join(outDir, 'files');
  if (await fse.pathExists(manifestPath)) {
    zip.addLocalFile(manifestPath);
  }
  if (await fse.pathExists(filesDir)) {
    zip.addLocalFolder(filesDir, 'files');
  }
  const zipPath = join(outDir, `${packageName}-${version}.zip`);
  zip.writeZip(zipPath);
  return zipPath;
}

export interface BuildOptions {
  projectRoot: string;
  config: OfflineConfig;
  zip?: boolean;
}

export interface BuildResult {
  outDir: string;
  manifestPath: string;
  zipPath?: string;
  validation: InspectionResult;
  /** SHA-256 of the produced zip (only set when `zip !== false`). */
  packageHash?: string;
  packageSize?: number;
}

export async function buildOfflinePackage(options: BuildOptions): Promise<BuildResult> {
  const buildDir = resolve(options.projectRoot, options.config.buildDir);
  const outDir = resolve(options.projectRoot, options.config.outDir);
  await mkdir(outDir, {recursive: true});

  // 1. Compute the filtered asset list (manifest) first.
  const manifest = await generateOfflineManifest(options.config, buildDir);
  // 2. Copy exactly those assets into files/.
  await copyBuildToOffline(buildDir, outDir, manifest.assets, options.config.copyConcurrency ?? 16);
  // 3. Write the manifest (without packageHash for now — we don't know it yet).
  let manifestPath = await writeOfflineManifest(manifest, outDir);

  // 4. Optional zip + whole-package hash. The hash is streamed, so even a
  //    few hundred MB costs ~constant memory. We then rewrite the manifest
  //    so the on-disk copy carries `packageHash` / `packageSize`, which
  //    ops platforms can treat as the authoritative version identifier.
  //    The copy INSIDE the zip does NOT contain packageHash (the zip is
  //    sealed the moment it is produced, and it'd otherwise need a
  //    self-referencing hash).
  let zipPath: string | undefined;
  let packageHash: string | undefined;
  let packageSize: number | undefined;
  if (options.zip !== false) {
    zipPath = await createZip(outDir, manifest.packageName, manifest.version);
    packageHash = await hashFileAtPath(zipPath);
    const zipStats = await stat(zipPath);
    packageSize = zipStats.size;
    const enriched: OfflineManifest = {...manifest, packageHash, packageSize};
    manifestPath = await writeOfflineManifest(enriched, outDir);
  }

  const validation = await inspectOfflineOutput(outDir);
  return {outDir, manifestPath, zipPath, validation, packageHash, packageSize};
}

function manifestFromJson(input: unknown): OfflineManifest | undefined {
  if (!input || typeof input !== 'object') return undefined;
  return input as OfflineManifest;
}

async function readManifestFromDir(dir: string): Promise<{manifest?: OfflineManifest; path?: string}> {
  const manifestPath = join(dir, 'manifest.json');
  if (!(await fse.pathExists(manifestPath))) return {};
  const parsed = manifestFromJson(JSON.parse(await readFile(manifestPath, 'utf8')));
  return {manifest: parsed, path: manifestPath};
}

async function readManifestFromZip(zipPath: string): Promise<{manifest?: OfflineManifest; zip: AdmZip}> {
  const zip = new AdmZip(zipPath);
  const entry = zip.getEntry('manifest.json');
  if (!entry) return {zip};
  const parsed = manifestFromJson(JSON.parse(entry.getData().toString('utf8')));
  return {manifest: parsed, zip};
}

/**
 * Soft diagnostics that suggest the build is broken without being definitely
 * fatal. These surface as `InspectionResult.warnings`, printed by the CLI
 * but NOT affecting `valid` — callers can opt into `--strict` to escalate.
 *
 * Heuristics we learned the hard way (see apps/docs/runtime/rolldown-migration):
 *   - A page declared in the manifest should have at least one `.js` chunk
 *     sitting under its own directory. An HTML-only page is almost always
 *     a sign that the bundler's rename hook silently no-oped (Rolldown
 *     ignoring `bundle[x] = …` being the canonical example).
 *   - Fewer than 5 assets total, or a total size under 20KB, almost always
 *     means the build scope was misconfigured.
 */
function collectWarnings(manifest: OfflineManifest): string[] {
  const warnings: string[] = [];
  const assetPaths = manifest.assets.map(a => a.path);

  for (const page of manifest.pages) {
    // Page directory is the first path segment of page.file, e.g.
    // `home/index.html` → `home/`. Anything under that prefix counts.
    const pageDir = page.file.includes('/') ? `${page.file.split('/')[0]}/` : '';
    if (!pageDir) continue;
    const jsChunks = assetPaths.filter(p => p.startsWith(pageDir) && /\.[cm]?js$/.test(p));
    if (jsChunks.length === 0) {
      warnings.push(
        `page "${page.name}" has no .js chunk under "${pageDir}" — bundler rename hook may have silently failed`
      );
    }
  }

  if (manifest.assets.length > 0 && manifest.assets.length < 5) {
    warnings.push(
      `assets count=${manifest.assets.length} looks suspiciously small — verify the build output contains per-page files`
    );
  }
  if (manifest.totalSize > 0 && manifest.totalSize < 20 * 1024) {
    warnings.push(`totalSize=${manifest.totalSize}B looks suspiciously small — did the real build actually run?`);
  }
  return warnings;
}

export async function inspectOfflineOutput(target: string): Promise<InspectionResult> {
  const stats = await stat(target);
  if (stats.isDirectory()) {
    const {manifest, path: manifestPath} = await readManifestFromDir(target);
    if (!manifest) {
      return {
        valid: false,
        pageCount: 0,
        assetCount: 0,
        totalSize: 0,
        largeAssets: [],
        missingFiles: ['manifest.json'],
        manifestPath
      };
    }
    const filesDir = join(target, 'files');
    const missing: string[] = [];
    for (const asset of manifest.assets) {
      const file = join(filesDir, asset.path);
      if (!(await fse.pathExists(file))) missing.push(asset.path);
    }
    // Cross-check: every declared page's HTML file MUST appear in the
    // assets list. Historically the build pipeline has silently dropped
    // per-page outputs (e.g. when a bundler rename hook was ignored by
    // Rolldown), leaving a manifest that claims `pages[0].file =
    // "home/index.html"` while the zip only contained vendor chunks —
    // shipped to the container, that package produces a white screen.
    // Bubble the mismatch up as a validation failure so the CLI exits
    // non-zero on CI.
    const assetPaths = new Set(manifest.assets.map(a => a.path));
    for (const page of manifest.pages) {
      if (!assetPaths.has(page.file)) {
        missing.push(`(page "${page.name}" declared file) ${page.file}`);
      }
    }
    const warnings = collectWarnings(manifest);
    const largeAssets = [...manifest.assets].sort((a, b) => b.size - a.size).slice(0, 5);
    return {
      packageName: manifest.packageName,
      version: manifest.version,
      valid: missing.length === 0,
      pageCount: manifest.pages.length,
      assetCount: manifest.assets.length,
      totalSize: manifest.totalSize,
      largeAssets,
      missingFiles: missing,
      warnings: warnings.length ? warnings : undefined,
      manifestPath,
      packageHash: manifest.packageHash,
      packageSize: manifest.packageSize
    };
  }

  const {manifest, zip} = await readManifestFromZip(target);
  if (!manifest) {
    return {
      valid: false,
      pageCount: 0,
      assetCount: 0,
      totalSize: 0,
      largeAssets: [],
      missingFiles: ['manifest.json']
    };
  }
  const missing: string[] = [];
  for (const asset of manifest.assets) {
    if (!zip.getEntry(`files/${asset.path}`)) missing.push(asset.path);
  }
  // Same cross-check for zip inspection — see the directory branch above.
  const assetPathsZip = new Set(manifest.assets.map(a => a.path));
  for (const page of manifest.pages) {
    if (!assetPathsZip.has(page.file)) {
      missing.push(`(page "${page.name}" declared file) ${page.file}`);
    }
  }
  const warnings = collectWarnings(manifest);
  const largeAssets = [...manifest.assets].sort((a, b) => b.size - a.size).slice(0, 5);
  return {
    packageName: manifest.packageName,
    version: manifest.version,
    valid: missing.length === 0,
    pageCount: manifest.pages.length,
    assetCount: manifest.assets.length,
    totalSize: manifest.totalSize,
    largeAssets,
    missingFiles: missing,
    warnings: warnings.length ? warnings : undefined,
    packageHash: manifest.packageHash,
    packageSize: manifest.packageSize
  };
}

export {dirname, posix};
