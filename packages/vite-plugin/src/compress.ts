/**
 * Pre-compress build outputs as `<file>.gz` (gzip) and `<file>.br` (Brotli)
 * so CDN edges / origin servers can serve them without on-the-fly compression.
 *
 * Implementation notes:
 * - Uses Node's built-in `zlib` (no extra dependency); both algorithms ship
 *   with Node ≥ 20.
 * - Runs in `closeBundle` to operate on FINAL on-disk files; this means it
 *   sees `dist/` after every other plugin (including our chunk relocator).
 * - Skips files smaller than `threshold` bytes — compressing tiny chunks
 *   wastes CPU and often *grows* the payload due to dictionary headers.
 * - Skips already-compressed formats (.png/.jpg/.woff2/.gz/.br/.zip).
 */
import {readdir, readFile, stat, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {brotliCompressSync, constants, gzipSync} from 'node:zlib';
import type {Plugin} from 'vite';

export interface CompressOptions {
  /** Skip files smaller than this many bytes. Default: 1024. */
  threshold?: number;
  /** Generate `.gz`. Default: true. */
  gzip?: boolean;
  /** Generate `.br`. Default: true. */
  brotli?: boolean;
  /** File extensions eligible for compression. */
  extensions?: string[];
  /** Disable entirely (for `dev` mode this plugin is a no-op anyway). */
  disabled?: boolean;
}

const DEFAULT_EXTENSIONS = ['.js', '.mjs', '.cjs', '.css', '.html', '.svg', '.json', '.txt', '.xml', '.wasm', '.map'];

const SKIP_BASENAMES_RE = /\.(png|jpe?g|gif|webp|avif|woff2?|ttf|otf|gz|br|zip|7z|rar)$/i;

export function lhxCompress(options: CompressOptions = {}): Plugin {
  const opts = {
    threshold: options.threshold ?? 1024,
    gzip: options.gzip ?? true,
    brotli: options.brotli ?? true,
    extensions: options.extensions ?? DEFAULT_EXTENSIONS,
    disabled: options.disabled ?? false
  };

  let outDir: string | null = null;
  let isBuild = false;

  return {
    name: 'lhx-kit:compress',
    apply: 'build',

    configResolved(resolved) {
      outDir = resolved.build.outDir;
      isBuild = resolved.command === 'build';
    },

    async closeBundle() {
      if (opts.disabled || !isBuild || !outDir) return;
      const stats = await compressDirectory(outDir, opts);
      // eslint-disable-next-line no-console
      console.log(
        `[lhx-kit:compress] ${stats.gzippedCount} .gz / ${stats.brotliCount} .br produced` +
          ` (saved ~${formatBytes(stats.savedBytes)})`
      );
    }
  };
}

interface CompressStats {
  gzippedCount: number;
  brotliCount: number;
  savedBytes: number;
}

async function compressDirectory(
  dir: string,
  opts: Required<Omit<CompressOptions, 'disabled'>>
): Promise<CompressStats> {
  const stats: CompressStats = {gzippedCount: 0, brotliCount: 0, savedBytes: 0};
  await walk(dir, async filePath => {
    if (SKIP_BASENAMES_RE.test(filePath)) return;
    const ext = filePath.slice(filePath.lastIndexOf('.'));
    if (!opts.extensions.includes(ext)) return;

    const fileStat = await stat(filePath);
    if (fileStat.size < opts.threshold) return;

    const content = await readFile(filePath);

    if (opts.gzip) {
      // level 9 = max compression. Build-time CPU is cheap; serve-time wins.
      const gz = gzipSync(content, {level: 9});
      // Skip if compression made it bigger (rare, but happens for already
      // compressed binary blobs misclassified by extension).
      if (gz.length < content.length) {
        await writeFile(`${filePath}.gz`, gz);
        stats.gzippedCount++;
        stats.savedBytes += content.length - gz.length;
      }
    }

    if (opts.brotli) {
      const br = brotliCompressSync(content, {
        params: {
          [constants.BROTLI_PARAM_QUALITY]: 11,
          [constants.BROTLI_PARAM_SIZE_HINT]: content.length
        }
      });
      if (br.length < content.length) {
        await writeFile(`${filePath}.br`, br);
        stats.brotliCount++;
      }
    }
  });
  return stats;
}

async function walk(dir: string, visit: (filePath: string) => Promise<void>): Promise<void> {
  const entries = await readdir(dir, {withFileTypes: true});
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, visit);
    } else if (entry.isFile()) {
      await visit(full);
    }
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
