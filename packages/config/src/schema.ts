import {z} from 'zod';

/**
 * Schema v1 for project.config.ts / offline.config.ts.
 *
 * Design notes:
 * - A project declares pages once. CLI/Vite plugin/offline all read this list.
 * - Offline config is optional and additive; it references page identifiers
 *   from project config instead of redeclaring them.
 * - Unknown keys are stripped (`strip()` default). We prefer silent success on
 *   extra fields so downstream tools can extend shapes without a lock-step bump.
 */

export type Framework = 'vue3' | 'react';
export type EnvMode = 'dev' | 'test' | 'staging' | 'prod';

/* ---------------- CDN config ---------------- */

/**
 * A single "externalized dependency": e.g. vue or pinia. When cdn is enabled
 * the build pipeline strips `import ... from '<name>'` out of the bundle,
 * injects `<script src>` for each URL in order with onerror chaining, and
 * exposes the module via the UMD global (`globalVar`). If every URL in
 * `urls` fails, the runtime falls back to the local vendor chunk we also
 * emit (so offline / flaky networks never show a blank page).
 */
export const cdnEntrySchema = z
  .object({
    /** npm package name (matches bare import specifier). */
    name: z.string().min(1),
    /**
     * UMD global variable the CDN script exposes. Defaults to the name
     * upper-camel-cased (`vue` → `Vue`, `vue-router` → `VueRouter`).
     */
    globalVar: z.string().optional(),
    /** Ordered list of CDN URLs. onerror falls through to the next entry. */
    urls: z.array(z.string().url()).min(1),
    /**
     * Other entry names this one depends on (e.g. `vue-router` depends on
     * `vue`). Used to order injection and gate the entry chunk.
     */
    depends: z.array(z.string()).optional(),
    /**
     * Extra imports to also externalize from the bundle. Lets you cover
     * subpath imports like `vue-router/dist/vue-router.global.prod.js` if
     * needed; defaults to `[name]`.
     */
    externals: z.array(z.string()).optional(),
    /**
     * Override the local vendor resolver. Specify either:
     *   - a bare require specifier (e.g. `'preact/compat/dist/compat.umd.js'`),
     *     resolved against the project's node_modules; OR
     *   - an absolute / project-relative path.
     * When omitted, the plugin scans a set of well-known layouts under
     * `node_modules/<name>/{dist,umd}/*.{global,iife,umd}.*.js` and picks
     * the first hit. Use this field when the package ships the UMD under
     * a non-standard subpath (e.g. `preact/compat/dist/compat.umd.js`).
     */
    localFallback: z.string().optional(),
    /**
     * Extra global identifiers to alias to `window[globalVar]` once the
     * UMD loads. Primarily used by the Preact-replaces-React recipe:
     * Preact UMD exposes `window.preactCompat`, but user code compiled
     * with React externals expects `window.React` / `window.ReactDOM`.
     * Declaring `aliasGlobals: ['React', 'ReactDOM']` tells the loader to
     * execute `window.React = window.preactCompat; window.ReactDOM = ...`
     * right after the script evaluates.
     */
    aliasGlobals: z.array(z.string()).optional(),
    /**
     * Optional JavaScript snippet executed after the UMD loads and after
     * `aliasGlobals` have been applied. Use it to polyfill APIs the UMD
     * bundle doesn't ship. Example: `preact/compat` omits React 18's
     * `createRoot`, so you can add it with:
     *
     *   initScript: "window.ReactDOM.createRoot=function(c){return{render:function(e){window.preactCompat.render(e,c)},unmount:function(){window.preactCompat.unmountComponentAtNode(c)}}};"
     *
     * The snippet runs in the same IIFE scope as the loader; `window`
     * refers to the page window. Keep it short and self-contained.
     */
    initScript: z.string().optional()
  })
  .strict();

export const cdnConfigSchema = z
  .object({
    /** Master switch. Kept explicit so `enabled: false` is a valid state. */
    enabled: z.boolean().default(false),
    /** Which vite commands inject CDN. `build` covers `preview` too. */
    applyOn: z.array(z.enum(['build', 'preview', 'dev'])).default(['build']),
    /**
     * Fallback strategy if ALL CDN URLs fail:
     *   - 'local' (default): dynamic import the sibling vendor chunk we also
     *     bundle on disk (adds ~vendor size to dist but guarantees availability).
     *   - 'error': throw and let the app's error boundary handle it.
     *
     * Offline packages always force 'local' regardless of this setting — the
     * hybrid container might have no network at all.
     */
    fallback: z.enum(['local', 'error']).default('local'),
    /** Per-entry URL timeout (ms) before treating it as failed. */
    timeoutMs: z.number().int().positive().default(5000),
    /**
     * Window-level namespace for the CDN loader's public API. Default is
     * `'LhxCdn'`, exposing `window.LhxCdn.whenReady(...)`, `.state`, `.on(...)`.
     * Override this when your app already owns that name, or when you want
     * a project-specific namespace (e.g. `'MyAppCdn'`, `'__app_cdn__'`).
     *
     * Restricted to a JS-identifier-safe character class to keep generated
     * inline-attribute JS valid (we splice it into `onload="..."`).
     */
    globalNamespace: z
      .string()
      .regex(/^[A-Za-z_$][\w$]*$/, {
        message: 'cdn.globalNamespace must be a valid JS identifier'
      })
      .default('LhxCdn'),
    entries: z.array(cdnEntrySchema).default([])
  })
  .strict();

export type CdnEntryInput = z.input<typeof cdnEntrySchema>;
export type CdnEntry = z.output<typeof cdnEntrySchema>;
export type CdnConfigInput = z.input<typeof cdnConfigSchema>;
export type CdnConfig = z.output<typeof cdnConfigSchema>;

/* ---------------- Project config ---------------- */

export const viteProxyEntrySchema = z.union([
  z.string(),
  z.object({
    target: z.string(),
    changeOrigin: z.boolean().optional(),
    rewrite: z.string().optional(),
    secure: z.boolean().optional(),
    ws: z.boolean().optional()
  })
]);

export const envEntrySchema = z
  .object({
    apiBase: z.string().optional(),
    publicPath: z.string().optional(),
    proxy: z.record(z.string(), viteProxyEntrySchema).optional(),
    define: z.record(z.string(), z.unknown()).optional()
  })
  .strict();

export const pageDefinitionSchema = z
  .object({
    title: z.string(),
    entry: z.string().optional(),
    template: z.string().optional(),
    filename: z.string().optional(),
    namespace: z.string().optional(),
    store: z.string().optional(),
    offline: z.boolean().optional(),
    meta: z.record(z.string(), z.string()).optional()
  })
  .strict();

export const projectConfigSchema = z
  .object({
    name: z.string().min(1),
    framework: z.enum(['vue3', 'react']),
    rootDir: z.string().optional(),
    srcDir: z.string().optional(),
    pagesDir: z.string().optional(),
    publicDir: z.string().optional(),
    outDir: z.string().optional(),
    aliases: z.record(z.string(), z.string()).optional(),
    envs: z
      .object({
        dev: envEntrySchema.optional(),
        test: envEntrySchema.optional(),
        staging: envEntrySchema.optional(),
        prod: envEntrySchema.optional()
      })
      .refine(envs => Object.values(envs).some(Boolean), {
        message: 'envs must declare at least one of dev/test/staging/prod'
      }),
    pages: z.record(z.string(), pageDefinitionSchema).refine(pages => Object.keys(pages).length > 0, {
      message: 'pages must declare at least one page'
    }),
    /**
     * Optional CDN externalisation. When `enabled`, matching entries are
     * stripped from the build and injected as `<script src>` tags with
     * onerror-fallback. See `cdnConfigSchema` for details.
     */
    cdn: cdnConfigSchema.optional(),
    offline: z
      .object({
        enabled: z.boolean().optional()
      })
      .optional()
  })
  .strict();

export type ProjectConfigInput = z.input<typeof projectConfigSchema>;
export type ProjectConfigRaw = z.output<typeof projectConfigSchema>;
export type PageDefinition = z.output<typeof pageDefinitionSchema>;
export type EnvEntry = z.output<typeof envEntrySchema>;

/**
 * Fully-resolved project config (defaults applied, entries materialized).
 */
export interface ResolvedProjectConfig extends Omit<ProjectConfigRaw, 'pages' | 'cdn'> {
  rootDir: string;
  srcDir: string;
  pagesDir: string;
  publicDir: string;
  outDir: string;
  aliases: Record<string, string>;
  pages: Record<string, ResolvedPageDefinition>;
  /** Always present; `enabled=false` means CDN is a no-op. */
  cdn: ResolvedCdnConfig;
}

export interface ResolvedCdnEntry
  extends Omit<CdnEntry, 'globalVar' | 'externals' | 'aliasGlobals' | 'localFallback' | 'initScript'> {
  globalVar: string;
  externals: string[];
  aliasGlobals: string[];
  localFallback: string | null;
  initScript: string | null;
}

export interface ResolvedCdnConfig extends Omit<CdnConfig, 'entries'> {
  entries: ResolvedCdnEntry[];
}

export interface ResolvedPageDefinition extends PageDefinition {
  name: string;
  entry: string;
  template: string;
  filename: string;
  namespace: string;
  offline: boolean;
  meta: Record<string, string>;
}

/* ---------------- Offline config ---------------- */

export const prefetchRuleSchema = z
  .object({
    name: z.string(),
    match: z.union([z.object({page: z.string()}).strict(), z.object({url: z.string()}).strict()]),
    keys: z.array(z.string()).optional(),
    apiUrl: z.string(),
    maxAge: z.number().int().nonnegative().optional(),
    priority: z.enum(['high', 'normal', 'low']).optional()
  })
  .strict();

export const offlineConfigSchema = z
  .object({
    enabled: z.boolean(),
    versions: z
      .object({
        test: z.string().optional(),
        prod: z.string().optional()
      })
      .refine(v => Boolean(v.test || v.prod), {
        message: 'offline.versions must declare at least one of test/prod'
      }),
    whitelistPages: z.array(z.string()).optional(),
    prefetch: z.array(prefetchRuleSchema).optional(),
    rollback: z
      .object({
        strategy: z.enum(['previous', 'none']).optional()
      })
      .optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    outDir: z.string().optional()
  })
  .strict();

export type OfflineConfigInput = z.input<typeof offlineConfigSchema>;
export type OfflineConfigRaw = z.output<typeof offlineConfigSchema>;
export type PrefetchRule = z.output<typeof prefetchRuleSchema>;

export interface ResolvedOfflineConfig extends OfflineConfigRaw {
  outDir: string;
}
