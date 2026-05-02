import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir, readFile, stat, writeFile} from 'node:fs/promises';
import {dirname, join, posix, relative, resolve} from 'node:path';
import AdmZip from 'adm-zip';
import fse from 'fs-extra';
import {z} from 'zod';

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
  excludePaths: z.array(z.string()).default([])
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
  schemaVersion: '1.0.0';
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
}

export interface InspectionResult {
  packageName?: string;
  version?: string;
  valid: boolean;
  pageCount: number;
  assetCount: number;
  totalSize: number;
  largeAssets: OfflineManifestAsset[];
  missingFiles: string[];
  manifestPath?: string;
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

async function hashFile(filePath: string): Promise<string> {
  return new Promise((resolveHash, rejectHash) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', rejectHash);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolveHash(hash.digest('hex')));
  });
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
      if (prefix && (normalized === prefix || normalized.startsWith(prefix + '/'))) {
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
  const assets: OfflineManifestAsset[] = [];
  let totalSize = 0;

  for (const file of files) {
    const relPath = posix.normalize(relative(buildDir, file).split('\\').join('/'));
    if (!filter(relPath)) continue;
    const stats = await stat(file);
    const hash = await hashFile(file);
    totalSize += stats.size;
    assets.push({
      path: relPath,
      size: stats.size,
      hash,
      contentType: contentTypeOf(relPath)
    });
  }

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

async function copyBuildToOffline(buildDir: string, outDir: string, assets: OfflineManifestAsset[]): Promise<string> {
  // Copy exactly the assets listed in the manifest. This keeps the manifest
  // and the on-disk `files/` folder 100% in sync and avoids shipping anything
  // the filter decided to drop (e.g. non-whitelisted pages, MSW sw).
  const filesDir = join(outDir, 'files');
  await fse.remove(filesDir);
  await mkdir(filesDir, {recursive: true});
  for (const asset of assets) {
    const src = join(buildDir, asset.path);
    const dst = join(filesDir, asset.path);
    await mkdir(dirname(dst), {recursive: true});
    await fse.copyFile(src, dst);
    // Offline packages must work in fully air-gapped environments. Rewrite
    // each HTML's CDN loader plan so the urls list is empty: the loader will
    // immediately fall through to the local vendor chunk that already lives
    // in the package. The vite-plugin still emitted the chunks, the manifest
    // still references them, this rewrite simply skips the network attempt.
    if (asset.path.endsWith('.html')) {
      await stripCdnUrlsFromHtml(dst);
    }
  }
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
 */
async function stripCdnUrlsFromHtml(htmlPath: string): Promise<void> {
  let html: string;
  try {
    html = await readFile(htmlPath, 'utf8');
  } catch {
    return;
  }
  const start = html.indexOf('<!-- lhx-kit: CDN loader -->');
  const end = html.indexOf('<!-- /lhx-kit: CDN loader -->');
  if (start < 0 || end < 0) return;

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

  await writeFile(htmlPath, before + blockNoTags + after);
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
}

export async function buildOfflinePackage(options: BuildOptions): Promise<BuildResult> {
  const buildDir = resolve(options.projectRoot, options.config.buildDir);
  const outDir = resolve(options.projectRoot, options.config.outDir);
  await mkdir(outDir, {recursive: true});

  // 1. Compute the filtered asset list (manifest) first.
  const manifest = await generateOfflineManifest(options.config, buildDir);
  // 2. Copy exactly those assets into files/.
  await copyBuildToOffline(buildDir, outDir, manifest.assets);
  // 3. Write the manifest.
  const manifestPath = await writeOfflineManifest(manifest, outDir);

  const zipPath = options.zip === false ? undefined : await createZip(outDir, manifest.packageName, manifest.version);

  const validation = await inspectOfflineOutput(outDir);
  return {outDir, manifestPath, zipPath, validation};
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
      manifestPath
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
  const largeAssets = [...manifest.assets].sort((a, b) => b.size - a.size).slice(0, 5);
  return {
    packageName: manifest.packageName,
    version: manifest.version,
    valid: missing.length === 0,
    pageCount: manifest.pages.length,
    assetCount: manifest.assets.length,
    totalSize: manifest.totalSize,
    largeAssets,
    missingFiles: missing
  };
}

export {dirname, posix};
