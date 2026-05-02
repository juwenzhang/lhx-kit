import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join, relative, resolve} from 'node:path';
import {
  type EnvEntry,
  loadOfflineConfig,
  loadProjectConfig,
  normalizeEnvMode,
  type ResolvedCdnEntry,
  type ResolvedOfflineConfig,
  type ResolvedProjectConfig,
  resolveEnv
} from '@lhx-kit/config';
import {
  type CdnPlan,
  type CdnPlanEntry,
  renderCdnGateScript,
  renderCdnLoaderScript,
  renderCdnScriptTags
} from '@lhx-kit/runtime/cdn-loader';
import type {Plugin, UserConfig} from 'vite';
import {type CompressOptions, lhxCompress} from './compress';
import {type HtmlCdnInjection, renderPageHtml, rewriteModuleScriptWithCdnGate} from './html';
import {RESOLVED_VIRTUAL_ID, renderVirtualModuleCode, serializeConfig, VIRTUAL_ID} from './virtual';

/**
 * Built-in defaults. Every value is overridable via `LhxKitPluginOptions`.
 */
const DEFAULTS = {
  /** Directory (relative to project root) holding intermediate HTML files. */
  intermediateDir: '.lhx-kit/pages',
  /** 'per-page' produces dist/<page>/index.html + per-page assets; 'flat' is the legacy layout. */
  outputLayout: 'per-page' as 'per-page' | 'flat',
  /** Directory under dist/ that collects chunks/assets shared by 2+ pages. */
  sharedDir: 'shared',
  /** Dev server accepts extensionless URLs (`/home`) in addition to `/home.html`. */
  cleanUrls: true
} as const;

export interface LhxKitPluginOptions {
  /** Override the project root. Defaults to the Vite root. */
  root?: string;
  /** Force a specific env mode, bypassing Vite's mode resolution. */
  mode?: string;
  /** Explicit list of pages to include. Overrides `LHX_PAGES` env. */
  pages?: string[];
  /** Directory (relative to project root) for intermediate HTML files. Default `.lhx-kit/pages`. */
  intermediateDir?: string;
  /** Output layout. Default `per-page`. */
  outputLayout?: 'per-page' | 'flat';
  /** Name of the shared-chunks directory under dist/. Default `shared`. */
  sharedDir?: string;
  /** Dev-time extensionless URLs. Default `true`. */
  cleanUrls?: boolean;
  /**
   * Pre-compression of build outputs into `.gz` and `.br` siblings. Enabled
   * by default in `build`. Pass `false` to disable, or an object to tweak
   * thresholds / extensions.
   */
  compress?: boolean | CompressOptions;
}

interface ResolvedOptions {
  intermediateDir: string;
  outputLayout: 'per-page' | 'flat';
  sharedDir: string;
  cleanUrls: boolean;
  root?: string;
  mode?: string;
  pages?: string[];
}

function resolveOptions(options: LhxKitPluginOptions): ResolvedOptions {
  return {
    intermediateDir: options.intermediateDir ?? DEFAULTS.intermediateDir,
    outputLayout: options.outputLayout ?? DEFAULTS.outputLayout,
    sharedDir: options.sharedDir ?? DEFAULTS.sharedDir,
    cleanUrls: options.cleanUrls ?? DEFAULTS.cleanUrls,
    root: options.root,
    mode: options.mode,
    pages: options.pages
  };
}

interface Context {
  project: ResolvedProjectConfig;
  offline: ResolvedOfflineConfig | null;
  mode: string;
  env: EnvEntry;
  activePageNames: string[];
  /** Map of pageName -> absolute path of the generated intermediate HTML. */
  intermediateHtml: Record<string, string>;
  opts: ResolvedOptions;
  /** CDN state for the current vite command. See `buildCdnContext`. */
  cdn: CdnContext;
}

interface CdnContext {
  /** True when cdn.enabled && applyOn includes the current vite command. */
  active: boolean;
  /** Original entry list (already default-filled) regardless of `active`. */
  entries: ResolvedCdnEntry[];
  /**
   * Fully-resolved on-disk path of each entry's local UMD bundle (the same
   * UMD file the CDN serves). Populated from the user project's node_modules
   * at context-build time. Missing entries degrade to "no local fallback".
   */
  localFallbackSrc: Record<string, string | null>;
  /** ms timeout per URL before forcing onerror fallthrough. */
  timeoutMs: number;
  /** 'local' | 'error' */
  fallback: 'local' | 'error';
  /**
   * `window.<globalNamespace>` is where the loader API gets installed.
   * Configurable per project so users can avoid collisions with their own
   * global identifiers (default: `'LhxCdn'`).
   */
  globalNamespace: string;
}

function pickActivePages(project: ResolvedProjectConfig, override: string[] | undefined): string[] {
  const all = Object.keys(project.pages);
  let only = override;
  if (!only) {
    const fromEnv = process.env.LHX_PAGES;
    if (fromEnv && fromEnv.trim()) {
      only = fromEnv
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    }
  }
  if (!only || only.length === 0) return all;
  for (const name of only) {
    if (!all.includes(name)) {
      throw new Error(`[lhx-kit] LHX_PAGES references unknown page "${name}". Known pages: ${all.join(', ')}`);
    }
  }
  return only;
}

async function buildContext(
  opts: ResolvedOptions,
  viteRoot: string,
  viteMode: string,
  command: 'dev' | 'build' | 'preview'
): Promise<Context> {
  const rootDir = resolve(opts.root ?? viteRoot);
  const {config: project} = await loadProjectConfig(rootDir);
  const offlineLoaded = await loadOfflineConfig(rootDir, project);

  const modeName = opts.mode ?? viteMode;
  const mode = normalizeEnvMode(modeName);
  const env = resolveEnv(project, mode);
  const activePageNames = pickActivePages(project, opts.pages);

  const cdn = buildCdnContext(project, rootDir, command);

  // Write intermediate HTML files under <rootDir>/<intermediateDir>/<name>.html.
  // This dir is expected to be covered by the repo's root `.gitignore` (e.g. `.lhx-kit/`).
  const intermediateRoot = join(project.rootDir, opts.intermediateDir);
  mkdirSync(intermediateRoot, {recursive: true});
  const intermediateHtml: Record<string, string> = {};
  for (const name of activePageNames) {
    const page = project.pages[name];
    const html = renderPageHtml({project, page, cdn: cdn.active ? buildHtmlCdnPayload(cdn) : null});
    const target = join(intermediateRoot, `${name}.html`);
    mkdirSync(dirname(target), {recursive: true});
    writeFileSync(target, html);
    intermediateHtml[name] = target;
  }

  return {
    project,
    offline: offlineLoaded?.config ?? null,
    mode,
    env,
    activePageNames,
    intermediateHtml,
    opts,
    cdn
  };
}

/* -------------------- CDN helpers -------------------- */

function buildCdnContext(
  project: ResolvedProjectConfig,
  rootDir: string,
  command: 'dev' | 'build' | 'preview'
): CdnContext {
  const cfg = project.cdn;
  const active = cfg.enabled && cfg.applyOn.includes(command) && cfg.entries.length > 0;
  const localFallbackSrc: Record<string, string | null> = {};

  if (active && cfg.fallback === 'local') {
    const userRequire = createRequire(resolve(rootDir, 'package.json'));
    for (const entry of cfg.entries) {
      localFallbackSrc[entry.name] = resolveLocalVendor(userRequire, rootDir, entry);
    }
  } else {
    for (const entry of cfg.entries) localFallbackSrc[entry.name] = null;
  }

  return {
    active,
    entries: cfg.entries,
    localFallbackSrc,
    timeoutMs: cfg.timeoutMs,
    fallback: cfg.fallback,
    globalNamespace: cfg.globalNamespace
  };
}

/**
 * Locate the UMD "global prod" bundle shipped by the npm package. This is the
 * SAME file that public CDNs (unpkg/jsdelivr) serve, so using it as the local
 * fallback gives byte-identical semantics to what the CDN would have loaded.
 *
 * Resolution order (first match wins):
 *   1. `pkg/dist/<pkg>.global.prod.js`    (Vue 3, vue-router 4, pinia)
 *   2. `pkg/dist/<pkg>.iife.prod.js`      (pinia legacy)
 *   3. `pkg/dist/<pkg>.min.js`            (generic UMD; e.g. antd)
 *   4. `pkg/dist/<pkg>.global.js`         (unminified UMD, last-resort)
 *   5. `pkg/dist/<pkg>.iife.js`           (unminified IIFE)
 *   6. `pkg/umd/<pkg>.production.min.js`  (React, ReactDOM, Scheduler, react-router, react-router-dom)
 *   7. `pkg/umd/<pkg>.development.js`     (dev variant, last-resort)
 *   8. `pkg/dist/umd/<pkg>.production.min.js` (some forks relocate under dist/)
 *   9. `pkg/lib/index.iife.js`            (vue-demi)
 *  10. `pkg/dist/index.global.js`         (some libs use index.* instead of pkgname)
 *
 * Returns the absolute path on disk, or `null` if nothing matches. A `null`
 * downgrades that entry to "no local fallback" — the loader will then surface
 * an error if every CDN URL also fails.
 */
function resolveLocalVendor(userRequire: NodeJS.Require, rootDir: string, entry: ResolvedCdnEntry): string | null {
  // 1. Explicit override from `project.config.ts` (`entry.localFallback`)
  //    takes precedence. Useful for packages whose UMD lives at a non-
  //    standard subpath like `preact/compat/dist/compat.umd.js`.
  //
  //    First try `require.resolve` — works for packages whose `exports`
  //    field permits the subpath. Many packages (including Preact) block
  //    deep subpaths via `exports`, so we fall back to a raw filesystem
  //    lookup under `node_modules/<path>` before giving up.
  if (entry.localFallback) {
    try {
      return userRequire.resolve(entry.localFallback);
    } catch {
      const direct = resolve(rootDir, 'node_modules', entry.localFallback);
      if (existsSync(direct)) return direct;
      // Also try workspace root's node_modules (monorepo / pnpm hoisting).
      const parent = resolve(rootDir, '..', 'node_modules', entry.localFallback);
      if (existsSync(parent)) return parent;
      const parent2 = resolve(rootDir, '..', '..', 'node_modules', entry.localFallback);
      if (existsSync(parent2)) return parent2;
    }
  }

  const baseName = entry.name.replace(/^@[^/]+\//, '');
  const candidates = [
    `${entry.name}/dist/${baseName}.global.prod.js`,
    `${entry.name}/dist/${baseName}.iife.prod.js`,
    `${entry.name}/dist/${baseName}.min.js`,
    `${entry.name}/dist/${baseName}.global.js`,
    `${entry.name}/dist/${baseName}.iife.js`,
    // React-family UMD layout: `<pkg>/umd/<pkg>.production.min.js`.
    // Covers react, react-dom, scheduler, react-router, react-router-dom.
    `${entry.name}/umd/${baseName}.production.min.js`,
    `${entry.name}/umd/${baseName}.development.js`,
    `${entry.name}/dist/umd/${baseName}.production.min.js`,
    // Preact UMD layout: `<pkg>/dist/<pkg>.min.umd.js` / `.umd.js`.
    `${entry.name}/dist/${baseName}.min.umd.js`,
    `${entry.name}/dist/${baseName}.umd.js`,
    `${entry.name}/lib/index.iife.js`,
    `${entry.name}/dist/index.global.js`
  ];
  for (const candidate of candidates) {
    try {
      return userRequire.resolve(candidate);
    } catch {
      /* try next */
    }
  }
  // Last resort for transitive deps under pnpm strict hoisting: try to
  // locate the package via its own dependents (e.g. `vue-demi` is a transitive
  // dep of `pinia`, so user's createRequire fails but `pinia`'s does not).
  // `scheduler` is analogous for react-dom; `dayjs` for antd.
  const transitiveOwners = [
    'pinia',
    'vue-router',
    '@vue/runtime-core',
    'vue',
    'react-dom',
    'react',
    'react-router-dom',
    'antd'
  ];
  for (const owner of transitiveOwners) {
    try {
      const ownerPkg = userRequire.resolve(`${owner}/package.json`);
      const ownerRequire = createRequire(ownerPkg);
      for (const candidate of candidates) {
        try {
          return ownerRequire.resolve(candidate);
        } catch {
          /* try next */
        }
      }
    } catch {
      /* owner not present */
    }
  }
  return null;
}

/**
 * Shape passed to renderPageHtml to inline the CDN `<script>` block and the
 * gate script that awaits ready before importing the page entry. We compute
 * it once per buildContext so HTML emission stays declarative.
 */
function buildHtmlCdnPayload(cdn: CdnContext): HtmlCdnInjection {
  const planEntries: CdnPlanEntry[] = cdn.entries.map(e => ({
    name: e.name,
    globalVar: e.globalVar,
    urls: e.urls,
    depends: e.depends ?? [],
    localFallbackUrl: cdn.localFallbackSrc[e.name] ? `/shared/vendor/${vendorFilename(e.name)}` : null,
    aliasGlobals: e.aliasGlobals.length > 0 ? e.aliasGlobals : undefined,
    initScript: e.initScript ?? undefined
  }));
  const plan: CdnPlan = {entries: planEntries, timeoutMs: cdn.timeoutMs, fallback: cdn.fallback};
  const entryNames = planEntries.map(e => e.name);
  const ns = cdn.globalNamespace;
  return {
    loaderScript: renderCdnLoaderScript(plan, ns),
    tagsHtml: renderCdnScriptTags(planEntries, ns),
    gateScriptFor: (entryHref: string) => renderCdnGateScript(entryNames, entryHref, ns)
  };
}

/**
 * Print a non-fatal warning for each chunk whose minified size exceeds
 * `softLimitBytes`. We deliberately do NOT throw / fail the build — it's
 * easy to write code (legitimate vendor bundles, framework runtime) that
 * blows past 50KB and there's no automatic remediation we can apply
 * without breaking tree-shaking / cache stability.
 *
 * Output format mirrors vite's own size table so the warnings line up
 * visually under it in CI logs.
 */
function reportOversizedChunks(bundle: Record<string, unknown>, softLimitBytes: number): void {
  const offenders: {fileName: string; size: number}[] = [];
  for (const [fileName, asset] of Object.entries(bundle)) {
    const a = asset as {type?: string; code?: string};
    if (a.type !== 'chunk' || typeof a.code !== 'string') continue;
    const size = Buffer.byteLength(a.code, 'utf8');
    if (size > softLimitBytes) offenders.push({fileName, size});
  }
  if (offenders.length === 0) return;
  offenders.sort((a, b) => b.size - a.size);
  // eslint-disable-next-line no-console
  console.warn(
    `\n[lhx-kit] ${offenders.length} chunk(s) exceed ${(softLimitBytes / 1024).toFixed(0)}KB` +
      ' (informational; matches small-program package budget):'
  );
  for (const o of offenders) {
    // eslint-disable-next-line no-console
    console.warn(`  ${o.fileName.padEnd(50)} ${(o.size / 1024).toFixed(2).padStart(8)} KB`);
  }
  // eslint-disable-next-line no-console
  console.warn('  → consider lazy-loading via dynamic import() or moving the dep to cdn.entries.');
}

/**
 * Stable filename for the emitted local vendor fallback. Keeping it free of
 * content hash means the HTML can hard-code the URL at render time.
 */
function vendorFilename(name: string): string {
  const safe = name.replace(/^@/, '').replaceAll('/', '__');
  return `${safe}.js`;
}

/**
 * Rollup `manualChunks` hook.
 *
 * Goal: give each framework family ONE vendor chunk, while keeping
 * everything else split per-top-level-package so that upgrading a single
 * library only invalidates that one chunk.
 *
 * Why not "one chunk per npm package"? A naive "every package → its own
 * chunk" policy produces 6+ tiny vendor chunks for a vanilla React stack
 * (react, react-dom, scheduler, react-router, react-router-dom,
 * @remix-run/router). With HTTP/2 multiplexing the break-even point for
 * chunk splitting is roughly 30–50KB — below that, the per-request
 * overhead dominates and you just slow the page down.
 *
 * Why NOT sub-split a single framework (e.g. react-dom into client +
 * server + dev-tools) for tree-shaking? React and Vue runtimes are not
 * tree-shakable in any meaningful way:
 *   - react-dom is a ~130KB reconciler; its exports (`createRoot`,
 *     `render`, `flushSync`) all reach into the same internal module
 *     graph through reflection, so removing one API doesn't shrink the
 *     graph.
 *   - Vue 3's runtime core is already the tree-shaken build
 *     (`vue.runtime.esm-bundler`); the compiler (which IS the big part)
 *     is excluded at bundler level by the `vue` conditional export.
 * Conclusion: accept 60KB-gzipped React / 35KB-gzipped Vue as the floor
 * cost, cache aggressively, and focus optimisation on user code.
 *
 * FAMILY_GROUPS defines the aggregation rules: any package listed under
 * a group key lands in `vendor-<group>` together with its siblings.
 * Everything else still gets its own `vendor-<pkg>` chunk so libraries
 * like `antd`, `echarts`, or `zod` stay cache-stable on their own.
 *
 * Rules:
 *   - non-node_modules → null (let Rollup decide — then collapsed by
 *     `experimentalMinChunkSize` if the chunk is under 10KB)
 *   - `node_modules/<pkg>/...` → `vendor-<group>` if pkg ∈ group, else `vendor-<pkg>`
 *   - `node_modules/@scope/<pkg>/...` → same, using `scope-pkg` as the key
 *   - external'd modules (via cdn.entries) never reach here; safe.
 */
const FAMILY_GROUPS: Record<string, readonly string[]> = {
  // React family — rendering core + cooperative scheduler. Always loaded
  // together; splitting them wastes HTTP round-trips.
  react: ['react', 'react-dom', 'scheduler'],
  // React Router family — the router itself, the dom bindings, and the
  // underlying @remix-run/router state machine.
  'react-router': ['react-router', 'react-router-dom', 'remix-run-router'],
  // Vue family — Vue 3 core plus its compat shim (vue-demi) which Pinia
  // drags in. `@vue/*` subpackages (runtime-core, reactivity, etc.)
  // also fold in via the scoped key `vue-<sub>` normalised below.
  vue: ['vue', 'vue-demi'],
  // Pinia + Vue Router — Vue's canonical data layer + routing.
  'vue-state': ['pinia', 'vue-router']
};

/** Reverse index: package key → group name. Built once at module load. */
const PKG_TO_GROUP: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [group, pkgs] of Object.entries(FAMILY_GROUPS)) {
    for (const pkg of pkgs) map.set(pkg, group);
  }
  return map;
})();

function nodeModulesPerPackageChunker(id: string): string | undefined {
  const idx = id.lastIndexOf('/node_modules/');
  if (idx === -1) return undefined;
  const after = id.slice(idx + '/node_modules/'.length);
  // Skip pnpm's `.pnpm` virtual store layer.
  const cleaned = after.startsWith('.pnpm/')
    ? after.slice('.pnpm/'.length).replace(/^[^/]+\/node_modules\//, '')
    : after;
  const segments = cleaned.split('/');
  const pkg = segments[0].startsWith('@') ? `${segments[0].slice(1)}-${segments[1]}` : segments[0];
  if (!pkg) return undefined;
  // Sanitize for filesystem: only [a-z0-9-_].
  const safeKey = pkg.replace(/[^a-z0-9-_]/gi, '-').toLowerCase();
  // Special-case `@vue/*` subpackages so they all fold into vendor-vue
  // without having to list every sub in FAMILY_GROUPS.vue.
  if (safeKey.startsWith('vue-') && !PKG_TO_GROUP.has(safeKey)) {
    // Only treat `@vue/<sub>` packages as vue family. User-space packages
    // named `vue-awesome` etc. should stay independent.
    if (pkg.startsWith('vue-') && segments[0].startsWith('@vue')) {
      return 'vendor-vue';
    }
  }
  const group = PKG_TO_GROUP.get(safeKey);
  return `vendor-${group ?? safeKey}`;
}

/**
 * Source-level transform: rewrite each `import ... from '<external>'` into a
 * `const ... = window.<GlobalVar>` expression. Supports the four common ES
 * module import forms:
 *
 *   1. `import vue from 'vue'`                  → const vue = window.Vue.default ?? window.Vue;
 *   2. `import * as ns from 'vue'`              → const ns = window.Vue;
 *   3. `import {ref, computed as c} from 'vue'` → const {ref, computed: c} = window.Vue;
 *   4. `import 'vue'`                           → ; (side-effect only; trivially dropped)
 *
 * Re-export forms (`export ... from 'vue'`) are intentionally NOT supported —
 * user code that re-exports framework internals is rare and explicitly broken
 * here so it surfaces during build instead of at runtime.
 *
 * The implementation is regex-based on purpose: the alternative (pulling in
 * acorn) doubles bundle size for marginal value, and Vite has already
 * normalised module-level syntax by the time our `transform` runs.
 */
function rewriteCdnImports(code: string, externals: Record<string, string>): string {
  if (!Object.keys(externals).some(name => code.includes(name))) return code;

  // Group A: `import <bindings> from '<src>'` — captures bindings + source.
  //   Bindings may be prefixed with `type ` for full type-only imports
  //   (`import type {RouteRecordRaw} from 'vue-router'`); we drop those
  //   entirely since they have no runtime emit.
  const importRe = /import\s+([^'"]+?)\s+from\s+(['"])([^'"]+)\2\s*;?/g;
  // Group B: side-effect import `import '<src>'`.
  const sideRe = /import\s+(['"])([^'"]+)\1\s*;?/g;

  let next = code.replace(importRe, (match, bindings: string, _q: string, src: string) => {
    const globalVar = externals[src];
    if (!globalVar) return match;
    const trimmed = bindings.trim();

    // `import type ...` → drop it entirely; nothing to emit.
    if (/^type\s+/.test(trimmed)) {
      return `/* lhx-cdn: dropped type-only import from "${src}" */`;
    }

    const access = `window[${JSON.stringify(globalVar)}]`;

    // `* as ns`
    let m = /^\*\s+as\s+([\w$]+)$/.exec(trimmed);
    if (m) return `const ${m[1]} = ${access};`;

    // `default, {a, b as c}` or just `default` or `{a, b as c}` — split into
    // up to two parts: a default-binding name and a brace-list.
    let defaultName: string | null = null;
    let bracePart: string | null = null;

    m = /^([\w$]+)\s*,\s*\{([^}]*)\}$/.exec(trimmed);
    if (m) {
      defaultName = m[1];
      bracePart = m[2];
    } else if ((m = /^\{([^}]*)\}$/.exec(trimmed))) {
      bracePart = m[1];
    } else if ((m = /^([\w$]+)$/.exec(trimmed))) {
      defaultName = m[1];
    }

    const lines: string[] = [];
    if (defaultName) {
      lines.push(`const ${defaultName} = (${access}.default !== undefined ? ${access}.default : ${access});`);
    }
    if (bracePart !== null) {
      // Convert `a, b as c, type T, type T2 as TT` → `a, b: c`. Type-only
      // specifiers are dropped entirely — they have no runtime presence.
      const specs = bracePart
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .filter(spec => !/^type\s+/.test(spec))
        .map(spec => {
          const asMatch = /^([\w$]+)\s+as\s+([\w$]+)$/.exec(spec);
          return asMatch ? `${asMatch[1]}: ${asMatch[2]}` : spec;
        });
      if (specs.length > 0) {
        lines.push(`const {${specs.join(', ')}} = ${access};`);
      }
    }

    return lines.length ? lines.join('\n') : `/* lhx-cdn: dropped empty import from "${src}" */`;
  });

  next = next.replace(sideRe, (match, _q: string, src: string) => {
    if (externals[src]) return `/* lhx-cdn: side-effect import "${src}" replaced by global */`;
    return match;
  });

  return next;
}

/* -------------------- per-page asset bucketing -------------------- */

/**
 * For each emitted chunk, decide which page(s) it belongs to.
 * A chunk is attributed to a page when any of the active page entries
 * transitively imports it. A chunk used by 2+ pages → shared.
 */
function computeChunkOwners(
  bundle: Record<string, unknown>,
  activePageNames: string[],
  pageIntermediatePath: Record<string, string>
): Map<string, Set<string>> {
  // Build moduleId → chunk fileName (only for chunks).
  const chunkByFacadeId = new Map<string, string>();
  for (const [fileName, asset] of Object.entries(bundle)) {
    const a = asset as {type?: string; facadeModuleId?: string | null; imports?: string[]; dynamicImports?: string[]};
    if (a.type === 'chunk' && a.facadeModuleId) {
      chunkByFacadeId.set(a.facadeModuleId, fileName);
    }
  }

  const owners = new Map<string, Set<string>>();
  for (const pageName of activePageNames) {
    const entryChunk = chunkByFacadeId.get(pageIntermediatePath[pageName]);
    if (!entryChunk) continue;
    // BFS from the entry chunk through static+dynamic imports.
    const visited = new Set<string>();
    const queue: string[] = [entryChunk];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const asset = bundle[current] as {type?: string; imports?: string[]; dynamicImports?: string[]} | undefined;
      if (!asset || asset.type !== 'chunk') continue;
      const set = owners.get(current) ?? new Set<string>();
      set.add(pageName);
      owners.set(current, set);
      for (const imp of asset.imports ?? []) queue.push(imp);
      for (const imp of asset.dynamicImports ?? []) queue.push(imp);
    }
  }
  return owners;
}

/**
 * Asset owners are derived from `importers` metadata. Vite emits a `viteMetadata`
 * per chunk enumerating its CSS/asset companions, and assets also show up in the
 * bundle. For simplicity we re-attribute assets by scanning chunks' `viteMetadata`.
 */
function attributeAssetsByChunks(
  bundle: Record<string, unknown>,
  chunkOwners: Map<string, Set<string>>
): Map<string, Set<string>> {
  const assetOwners = new Map<string, Set<string>>();
  for (const [chunkName, owners] of chunkOwners) {
    const asset = bundle[chunkName] as {viteMetadata?: {importedAssets?: Set<string>; importedCss?: Set<string>}};
    const imported = [...(asset?.viteMetadata?.importedAssets ?? []), ...(asset?.viteMetadata?.importedCss ?? [])];
    for (const a of imported) {
      const set = assetOwners.get(a) ?? new Set<string>();
      for (const o of owners) set.add(o);
      assetOwners.set(a, set);
    }
  }
  return assetOwners;
}

function relocate(fileName: string, pageDir: string): string {
  // Move any asset/chunk from its current path to `<pageDir>/...`, preserving basename.
  // If the original already contains a directory (e.g. `assets/xxx.js`), keep that
  // subdirectory underneath pageDir (→ `<pageDir>/assets/xxx.js`).
  return join(pageDir, fileName).replaceAll('\\', '/');
}

/* -------------------- plugin -------------------- */

export function lhxKit(options: LhxKitPluginOptions = {}): Plugin[] {
  const opts = resolveOptions(options);
  let ctx: Context | null = null;

  // The compress side-plugin runs in `build` only and is enabled by default.
  // Returning a `Plugin[]` is supported by vite (a plugin slot can resolve
  // to an array), so users still write `plugins: [lhxKit()]` as before.
  const compressOption = options.compress ?? true;
  const compressPlugins: Plugin[] =
    compressOption === false ? [] : [lhxCompress(typeof compressOption === 'object' ? compressOption : {})];

  async function ensureCtx(viteRoot: string, viteMode: string, command: 'dev' | 'build' | 'preview'): Promise<Context> {
    if (!ctx) ctx = await buildContext(opts, viteRoot, viteMode, command);
    return ctx;
  }

  const mainPlugin: Plugin = {
    name: 'lhx-kit',
    enforce: 'pre',

    async config(userConfig: UserConfig, env): Promise<Partial<UserConfig>> {
      const viteRoot = resolve(userConfig.root ?? process.cwd());
      // `env.command` is 'build' or 'serve'. Vite preview is a separate binary
      // and we detect it here via `VITE_PREVIEW=true` (set by our CLI) or the
      // `process.argv` tail. We normalize to 'dev' | 'build' | 'preview'.
      const command: 'dev' | 'build' | 'preview' =
        env.command === 'build'
          ? 'build'
          : process.env.LHX_VITE_COMMAND === 'preview' || process.argv.includes('preview')
            ? 'preview'
            : 'dev';
      const c = await ensureCtx(viteRoot, env.mode, command);

      const input: Record<string, string> = {};
      for (const [name, htmlPath] of Object.entries(c.intermediateHtml)) {
        input[name] = htmlPath;
      }

      const aliasArray = Object.entries(c.project.aliases).map(([find, target]) => ({
        find,
        replacement: resolve(c.project.rootDir, target)
      }));

      const define: Record<string, unknown> = {
        ...(c.env.define ?? {})
      };
      if (c.env.apiBase) {
        define['import.meta.env.LHX_API_BASE'] = JSON.stringify(c.env.apiBase);
      }
      define['import.meta.env.LHX_MODE'] = JSON.stringify(c.mode);

      // When CDN is active: strip externalised deps from the bundle and map
      // them to UMD globals so `import {ref} from 'vue'` compiles to
      // `const {ref} = window.Vue;` at build time.
      const externalIds = new Set<string>();
      const globals: Record<string, string> = {};
      if (c.cdn.active) {
        for (const entry of c.cdn.entries) {
          for (const id of entry.externals) {
            externalIds.add(id);
            globals[id] = entry.globalVar;
          }
        }
      }

      return {
        root: c.project.rootDir,
        base: c.env.publicPath ?? userConfig.base ?? '/',
        resolve: {alias: aliasArray},
        define,
        build: {
          outDir: resolve(c.project.rootDir, c.project.outDir),
          emptyOutDir: true,
          // ---- production optimisations -------------------------------------
          // Inline binary-ish assets up to 8KB as base64 data URIs. Tradeoff:
          // each inlined asset becomes part of the importing chunk (better
          // cache locality, fewer requests) but slightly bloats that chunk.
          // 8KB matches a single TCP slow-start packet sweet spot.
          assetsInlineLimit: userConfig.build?.assetsInlineLimit ?? 8 * 1024,
          // Split CSS per chunk so unused styles don't load on every page.
          cssCodeSplit: userConfig.build?.cssCodeSplit ?? true,
          // Modern target → smaller minified output (no ES5 transforms).
          target: userConfig.build?.target ?? 'es2018',
          // esbuild minify is faster than terser; we customise it below.
          minify: userConfig.build?.minify ?? 'esbuild',
          // Source maps OFF in build by default; users opt in via vite config.
          sourcemap: userConfig.build?.sourcemap ?? false,
          // Lift the warning threshold so our 50KB chunk-split policy below
          // (which actively limits chunk size) is the source of truth.
          chunkSizeWarningLimit: userConfig.build?.chunkSizeWarningLimit ?? 100,
          // Vite 8 uses Rolldown as its bundler; its RolldownOptions type
          // disagrees with the historical Rollup shape on a few internal
          // fields (`manualChunks` signature, `experimentalMinChunkSize`,
          // tuple-output quirks) even though the runtime still accepts the
          // Rollup-style object unchanged. Cast once here so we keep the
          // readable Rollup API above without chasing a moving target type.
          rollupOptions: {
            input,
            ...(c.cdn.active
              ? {
                  external: Array.from(externalIds),
                  output: {
                    globals,
                    // Auto-split node_modules into one chunk per top-level
                    // package. This makes "library upgrade only invalidates
                    // that library's cache" possible, and keeps individual
                    // chunks closer to the 50KB sweet spot for HTTP/2 multi-
                    // plexing. Page-level chunks of user code stay together.
                    manualChunks: nodeModulesPerPackageChunker,
                    // Merge any chunk below the threshold into its static
                    // importer. Rollup only considers this for chunks that
                    // are safe to inline (no cycles, single importer). Sub-
                    // 10KB chunks are dominated by HTTP request overhead —
                    // TCP+TLS+HTTP/2 framing is ~1–2 round-trips regardless
                    // of payload, so a 0.5KB chunk costs the same as a 10KB
                    // one. This auto-folds tiny route views / helper chunks
                    // without us having to hand-tune per-project.
                    experimentalMinChunkSize: 10 * 1024
                  }
                }
              : {
                  output: {
                    manualChunks: nodeModulesPerPackageChunker,
                    experimentalMinChunkSize: 10 * 1024
                  }
                })
            // biome-ignore lint/suspicious/noExplicitAny: see rollupOptions comment above
          } as any
        },
        // esbuild-level options for the production minifier. `drop_console`-
        // equivalent behaviour: strip console.log/debug calls from prod
        // output (keeps console.warn/error for diagnostics).
        esbuild: {
          drop: env.command === 'build' ? ['debugger'] : undefined,
          pure: env.command === 'build' ? ['console.log', 'console.debug', 'console.trace'] : undefined,
          legalComments: 'none'
        },
        server: c.env.proxy ? {proxy: c.env.proxy as NonNullable<UserConfig['server']>['proxy']} : undefined
      };
    },

    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID;
      return null;
    },

    load(id) {
      if (id !== RESOLVED_VIRTUAL_ID || !ctx) return null;
      const serialized = serializeConfig(ctx.project, ctx.mode, ctx.env);
      return renderVirtualModuleCode(serialized);
    },

    /**
     * CDN externals shim: Rollup with `external: ['vue', ...]` would emit
     * `import {createApp} from "vue"` as-is in ESM output, which the browser
     * cannot resolve. We rewrite each such bare import to a const destructure
     * from `window.<GlobalVar>` BEFORE Rollup sees the module, so the final
     * chunks only reference globals.
     *
     * Why a transform (vs resolveId+load shim)? A shim module would need to
     * statically enumerate every export it provides; we can't know that for
     * arbitrary user code. Source-level rewrite handles any subset of named
     * imports the user actually uses.
     */
    transform(code, id) {
      if (!ctx?.cdn.active) return null;
      // Virtual modules don't have real source; skip them.
      if (id.startsWith('\0')) return null;
      // node_modules IS rewritten here too — a third-party package like
      // react-router-dom still contains `import {createContext} from "react"`
      // after bundling; Rollup's `external` only drops the literal specifier
      // from the module graph, it doesn't rewrite the `import` statement in
      // the emitted chunk. Without this transform the browser would hit a
      // "Failed to resolve module specifier 'react'" error on the ESM file.
      const externalsByName: Record<string, string> = {};
      for (const entry of ctx.cdn.entries) {
        for (const ext of entry.externals) externalsByName[ext] = entry.globalVar;
      }
      if (Object.keys(externalsByName).length === 0) return null;
      // Cheap early exit: if none of the external names appear in this file
      // there's nothing to rewrite. Cuts the typical per-project transform
      // cost by ~95% because most modules don't reference any external.
      let hit = false;
      for (const name of Object.keys(externalsByName)) {
        if (code.includes(name)) {
          hit = true;
          break;
        }
      }
      if (!hit) return null;
      const rewritten = rewriteCdnImports(code, externalsByName);
      if (rewritten === code) return null;
      return {code: rewritten, map: null};
    },

    generateBundle: {
      order: 'post',
      handler(_outputOptions, bundle) {
        if (!ctx) return;
        const c = ctx;

        // 0. Emit local vendor fallbacks so the CDN loader has something to
        //    dynamic-import when every CDN URL fails. Stable filename keeps
        //    the HTML <script> we wrote at context-build time valid. Skipped
        //    when CDN is inactive or fallback !== 'local'.
        if (c.cdn.active && c.cdn.fallback === 'local') {
          for (const entry of c.cdn.entries) {
            const src = c.cdn.localFallbackSrc[entry.name];
            if (!src) continue;
            const outName = `shared/vendor/${vendorFilename(entry.name)}`;
            if (bundle[outName]) continue; // avoid duplicate emit on watch
            const content = readFileSync(src, 'utf8');
            this.emitFile({
              type: 'asset',
              fileName: outName,
              source: content
            });
          }
        }

        // 1. Rewrite each page HTML: <intermediateDir>/<name>.html → per-page path.
        const intermediatePrefix = c.opts.intermediateDir.endsWith('/')
          ? c.opts.intermediateDir
          : c.opts.intermediateDir + '/';
        for (const [assetName, asset] of Object.entries(bundle)) {
          if (!assetName.startsWith(intermediatePrefix) || !assetName.endsWith('.html')) continue;
          const pageName = assetName.slice(intermediatePrefix.length, -'.html'.length);
          const page = c.project.pages[pageName];
          if (!page) continue;
          const target = c.opts.outputLayout === 'per-page' ? `${pageName}/index.html` : page.filename;
          renameBundleEntry(bundle, assetName, target, asset);
        }

        if (c.opts.outputLayout !== 'per-page') return;

        // 2. Compute ownership of chunks (and transitively of assets).
        const pageIntermediatePath: Record<string, string> = {};
        for (const [name, full] of Object.entries(c.intermediateHtml)) {
          pageIntermediatePath[name] = full; // facadeModuleId is the absolute path.
        }
        const chunkOwners = computeChunkOwners(bundle, c.activePageNames, pageIntermediatePath);
        const assetOwners = attributeAssetsByChunks(bundle, chunkOwners);

        // 3. Relocate chunks and assets according to ownership.
        //    HTML outputs were already placed in step 1; skip them here.
        //    Assets whose fileName is already "final" (e.g. the CDN local
        //    vendor fallbacks we emitted in step 0 at `shared/vendor/...`,
        //    or public assets like `mockServiceWorker.js` that sit at dist
        //    root) are also skipped — relocating them would double-prefix.
        for (const [fileName, asset] of Object.entries(bundle)) {
          const a = asset as {type?: string; fileName?: string};
          if (a.type !== 'chunk' && a.type !== 'asset') continue;
          if (a.type === 'asset' && fileName.endsWith('.html')) continue;
          if (fileName.startsWith('shared/')) continue; // already final
          if (!fileName.includes('/')) continue; // top-level static asset → leave at root

          let owners: Set<string> | undefined;
          if (a.type === 'chunk') owners = chunkOwners.get(fileName);
          else owners = assetOwners.get(fileName);

          const pageDir = owners && owners.size === 1 ? [...owners][0] : c.opts.sharedDir;

          const target = relocate(fileName, pageDir);
          if (target === fileName) continue;
          renameBundleEntry(bundle, fileName, target, asset);
        }

        // 4. Fix up imports in chunks so relocations don't break references.
        // Vite already handles cross-chunk import paths based on fileName at
        // writeBundle time, so we don't need to rewrite code strings manually.
        // But HTML assets reference chunks by absolute URL relative to `base`;
        // Vite reads chunk.fileName at HTML generation time (before our
        // post-hook), so we need to patch HTML source strings to reflect new
        // chunk locations.
        patchHtmlReferences(bundle);

        // 4b. Patch each chunk's code: Rollup emitted relative `import
        // "./bootstrap-xxx.js"` referring to the chunk's ORIGINAL fileName.
        // After our relocate step chunks may have moved across directories
        // (e.g. `home/assets/home.js` now imports `shared/assets/bootstrap.js`)
        // so the old `./` relative path is wrong. Re-compute each import
        // path from the new fileNames. This works because chunks use stable
        // basename hashes, which we use as the join key.
        patchChunkImports(bundle);

        // 5. CDN: swap the `<script type="module" src=…>` left in each HTML
        // for a gate IIFE that awaits `window.__lhxCdn.whenReady(...)` before
        // dynamic-importing the (now-hashed) entry chunk. Done LAST so it
        // sees the final entry URL, not the source path.
        if (c.cdn.active) {
          const payload = buildHtmlCdnPayload(c.cdn);
          for (const [fileName, asset] of Object.entries(bundle)) {
            const a = asset as {type?: string; source?: string | Uint8Array; fileName?: string};
            if (a.type !== 'asset' || !fileName.endsWith('.html')) continue;
            if (typeof a.source !== 'string') continue;
            a.source = rewriteModuleScriptWithCdnGate(a.source, payload);
          }
        }

        // 6. Doctor: warn about chunks that exceed the soft size budget.
        //    50KB matches WeChat mini-program single-pkg limit and is also
        //    a healthy ceiling for HTTP/2 multiplexed delivery on H5. We
        //    only WARN — splitting an existing chunk safely requires module
        //    graph surgery (better done via manualChunks at config time, or
        //    by the user moving heavy imports behind dynamic import()).
        reportOversizedChunks(bundle, 50 * 1024);
      }
    },

    configureServer(server) {
      if (!ctx) return;
      const c = ctx;
      const firstPage = c.activePageNames[0];
      if (!firstPage) return;
      const firstPageClean = '/' + firstPage;
      const firstPageHtml = '/' + c.project.pages[firstPage].filename;

      const routeMap: Record<string, string> = {};
      for (const [name, htmlPath] of Object.entries(c.intermediateHtml)) {
        const page = c.project.pages[name];
        const rel = '/' + relative(c.project.rootDir, htmlPath).replaceAll('\\', '/');
        routeMap['/' + page.filename] = rel;
        if (c.opts.cleanUrls) routeMap['/' + name] = rel;
      }

      server.middlewares.use((req, res, next) => {
        if (!req.url) return next();
        if (req.url === '/' || req.url === '') {
          res.statusCode = 302;
          res.setHeader('Location', c.opts.cleanUrls ? firstPageClean : firstPageHtml);
          res.end();
          return;
        }
        const [path] = req.url.split('?');
        const mapped = routeMap[path];
        if (mapped) {
          req.url = mapped + req.url.slice(path.length);
        }
        next();
      });
    },

    /**
     * Preview-server companion to `configureServer`. In production mode the
     * dist layout is `<outDir>/<page>/index.html`, so we need a middleware
     * that:
     *   - redirects `/` to the first active page;
     *   - rewrites `/<page>` and `/<page>.html` (legacy dev URLs) to the
     *     physical `/<page>/index.html` served from dist.
     * Without this, `lhx-cli preview` + `playwright` would hit 404s when
     * users type URLs that match the dev server's URL shape.
     */
    configurePreviewServer(server) {
      if (!ctx) return;
      const c = ctx;
      const firstPage = c.activePageNames[0];
      if (!firstPage) return;

      // In per-page output layout each page lands at `/<page>/index.html`.
      // Build a rewrite map that catches extensionless URLs and legacy
      // `<page>.html` shapes. Flat layout (legacy) keeps `/<page>.html` as-is.
      const perPage = c.opts.outputLayout === 'per-page';
      const firstPagePhysical = perPage ? `/${firstPage}/index.html` : `/${c.project.pages[firstPage].filename}`;

      const rewriteMap: Record<string, string> = {};
      for (const name of c.activePageNames) {
        const page = c.project.pages[name];
        const physical = perPage ? `/${name}/index.html` : `/${page.filename}`;
        // Extensionless URL: `/home` → physical
        rewriteMap[`/${name}`] = physical;
        rewriteMap[`/${name}/`] = physical;
        if (perPage) {
          // Legacy top-level filename: `/home.html` → /home/index.html
          rewriteMap[`/${page.filename}`] = physical;
          // Some users type dev-style URLs that mirror the intermediate
          // path (`/home/home.html`). Map those to the physical file too
          // so muscle-memory from `lhx-cli dev` still works in preview.
          rewriteMap[`/${name}/${page.filename}`] = physical;
          rewriteMap[`/${name}/${name}.html`] = physical;
        }
      }

      server.middlewares.use((req, res, next) => {
        if (!req.url) return next();
        if (req.url === '/' || req.url === '') {
          res.statusCode = 302;
          res.setHeader('Location', firstPagePhysical);
          res.end();
          return;
        }
        const [path, search = ''] = req.url.split('?');
        const target = rewriteMap[path];
        if (target && target !== path) {
          req.url = target + (search ? `?${search}` : '');
        }
        next();
      });
    }
  };

  return [mainPlugin, ...compressPlugins];
}

/* -------------------- helpers -------------------- */

function renameBundleEntry(bundle: Record<string, unknown>, fromName: string, toName: string, asset: unknown): void {
  if (fromName === toName) return;
  const next = {...(asset as object), fileName: toName};
  delete bundle[fromName];
  bundle[toName] = next;
}

/**
 * After relocation, HTML `source` strings may still reference chunks by their
 * old paths. Rewrite them based on the final set of chunks so that browsers
 * fetch the files from their new locations.
 */
function patchHtmlReferences(bundle: Record<string, unknown>): void {
  // Build reverse index: original basename → new relative path (e.g. `home/assets/home-xxx.js`).
  const chunkByBasename = new Map<string, string>();
  for (const [fileName, asset] of Object.entries(bundle)) {
    const a = asset as {type?: string};
    if (a.type !== 'chunk') continue;
    const base = fileName.split('/').pop()!;
    chunkByBasename.set(base, fileName);
  }

  for (const [, asset] of Object.entries(bundle)) {
    const a = asset as {type?: string; source?: string | Uint8Array; fileName?: string};
    if (a.type !== 'asset' || !a.fileName || !a.fileName.endsWith('.html')) continue;
    if (typeof a.source !== 'string') continue;

    // Match `src="..."` / `href="..."`. Both absolute (`/assets/xxx.js`, `https://cdn/assets/xxx.js`)
    // and relative (`assets/xxx.js`) are handled.
    a.source = a.source.replace(/(src|href)="([^"]+)"/g, (match, attr: string, url: string) => {
      // Only rewrite JS chunks; CSS/static files follow a different pipeline
      // and are already relocated to their final places.
      if (!/\.[cm]?js(\?|$)/.test(url)) return match;
      const withoutQuery = url.split('?')[0];
      const basename = withoutQuery.split('/').pop()!;
      const target = chunkByBasename.get(basename);
      if (!target) return match;

      // Keep whatever prefix the user asked for (CDN URL, base path, etc.),
      // but swap the tail after the last `/assets/` or relative head.
      // Strategy: replace `url` with the same scheme/host/base + `/<target>`.
      const prefix = url.slice(0, url.length - withoutQuery.split('/').slice(-2).join('/').length);
      // Fallback: recompute a clean prefix by stripping the old chunk tail.
      const oldTail = withoutQuery.split('/').slice(-2).join('/'); // e.g. `assets/home-xxx.js`
      const cleanPrefix = withoutQuery.endsWith(oldTail)
        ? withoutQuery.slice(0, withoutQuery.length - oldTail.length)
        : '';
      const newUrl = cleanPrefix + target;
      // Ensure single slashes between prefix and target.
      return `${attr}="${newUrl.replace(/([^:])\/\//g, '$1/')}"`;
    });
  }
}

/**
 * Re-compute in-chunk imports after relocation.
 *
 * Problem: Rollup minified chunks with paths like `import"./bootstrap-xxx.js"`
 * assuming the importer and the importee live in the same directory. After
 * our per-page relocate step that isn't true anymore — a chunk at
 * `home/assets/home.js` may now import `shared/assets/bootstrap.js`. Browsers
 * resolve `./bootstrap-xxx.js` relative to the IMPORTER, giving
 * `/home/assets/bootstrap-xxx.js` which is 404.
 *
 * Strategy: for each chunk we scan its `code` for the three reference forms
 * Rollup / Vite emit:
 *
 *   1. static:     `import "./foo-xxx.js"` / `import{a}from "./foo-xxx.js"`
 *   2. dynamic:    `import("./foo-xxx.js")`
 *   3. mapDeps:    `["assets/foo-xxx.js", …]` (array literal vite generates
 *                  to track CSS/asset companions of an async chunk)
 *
 * For each referenced path we look up the chunk by its BASENAME in the
 * (relocated) bundle and replace the reference with a new POSIX-relative
 * path from the importer's directory to the importee's final path.
 */
function patchChunkImports(bundle: Record<string, unknown>): void {
  // Build: basename (stable, includes hash) → final absolute-from-dist path.
  // Include BOTH chunks and asset-type CSS companions so __vite__mapDeps
  // arrays (which mix .js and .css) resolve correctly.
  const fileByBasename = new Map<string, string>();
  for (const [fileName, asset] of Object.entries(bundle)) {
    const a = asset as {type?: string};
    if (a.type !== 'chunk' && a.type !== 'asset') continue;
    const base = fileName.split('/').pop()!;
    // Only track files we might legitimately reference from chunk code.
    if (!/\.(css|[cm]?js)$/.test(base)) continue;
    fileByBasename.set(base, fileName);
  }

  for (const [fileName, asset] of Object.entries(bundle)) {
    const a = asset as {type?: string; code?: string};
    if (a.type !== 'chunk' || typeof a.code !== 'string') continue;

    const importerDir = fileName.includes('/') ? fileName.slice(0, fileName.lastIndexOf('/')) : '';
    let code = a.code;

    // 1 + 2: `"./foo-xxx.js"` (static or dynamic ESM import).
    code = code.replace(/(["'])\.\/([\w.-]+\.[cm]?js)\1/g, (match, quote, basename) => {
      const target = fileByBasename.get(basename);
      if (!target) return match;
      const rel = relativePosixPath(importerDir, target);
      return `${quote}${rel}${quote}`;
    });

    // 3: `"assets/foo-xxx.(js|css)"` inside __vite__mapDeps arrays.
    // mapDeps resolves `E = s => "/" + s`, so the literal is "absolute from
    // dist root WITHOUT a leading slash". Rewrite to the final path minus
    // leading slash so the runtime fetches the correct URL.
    code = code.replace(/(["'])(assets\/[\w.-]+\.(?:[cm]?js|css))\1/g, (match, quote, pathStr) => {
      const basename = pathStr.split('/').pop()!;
      const target = fileByBasename.get(basename);
      if (!target) return match;
      return `${quote}${target}${quote}`;
    });

    a.code = code;
  }
}

/**
 * Compute a POSIX-style relative path from one directory to a file.
 * Pure string math — no node:path so we stay deterministic across OSes.
 *
 *   relativePosixPath('home/assets', 'shared/assets/boot.js')
 *     → '../../shared/assets/boot.js'
 *
 *   relativePosixPath('home/assets', 'home/assets/about.js')
 *     → './about.js'
 *
 *   relativePosixPath('', 'shared/x.js')
 *     → './shared/x.js'
 */
function relativePosixPath(fromDir: string, toFile: string): string {
  const fromParts = fromDir ? fromDir.split('/') : [];
  const toParts = toFile.split('/');
  let common = 0;
  while (
    common < fromParts.length &&
    common < toParts.length - 1 && // leave at least the basename in toParts
    fromParts[common] === toParts[common]
  ) {
    common++;
  }
  const up = fromParts.length - common;
  const down = toParts.slice(common);
  const rel = [...Array(up).fill('..'), ...down].join('/');
  return rel.startsWith('.') ? rel : `./${rel}`;
}
