export interface CdnPlanEntry {
  name: string;
  globalVar: string;
  urls: string[];
  depends: string[];
  /**
   * URL of the local vendor chunk to dynamic-import when all CDN URLs fail
   * and fallback='local'. Set to `null` when fallback='error'.
   */
  localFallbackUrl: string | null;
  /**
   * Extra global identifiers to alias to `window[globalVar]` once the
   * entry has loaded (whether from the CDN or from the local fallback).
   *
   * Use case: **Preact replacing React**. Preact's UMD exposes
   * `window.preactCompat`, but user code compiled with React CDN
   * externals expects `window.React` and `window.ReactDOM`. Declare
   * `aliasGlobals: ['React', 'ReactDOM']` on the preact-compat entry
   * and the loader will execute:
   *
   *   window.React = window.preactCompat;
   *   window.ReactDOM = window.preactCompat;
   *
   * right after the UMD bundle evaluates, so downstream `const {lazy}
   * = window.React` rewrites work transparently.
   */
  aliasGlobals?: string[];
  /**
   * Optional JS snippet executed after the UMD loads and after
   * `aliasGlobals` are applied. Used for polyfills / shims the UMD
   * bundle doesn't ship. E.g. preact/compat lacks React 18's
   * `createRoot`, which an initScript can add.
   */
  initScript?: string;
}

export interface CdnPlan {
  entries: CdnPlanEntry[];
  timeoutMs: number;
  /** 'local' | 'error' */
  fallback: 'local' | 'error';
}

/**
 * Public TypeScript shape for `window[<namespace>]`. The plugin's transform
 * also emits a triple-slash-aware module declaration in the project template's
 * `env.d.ts` so users get IDE completion automatically.
 */
export interface LhxCdnApi {
  /** The plan that was inlined into HTML at build time. Read-only. */
  readonly plan: CdnPlan;
  /** Per-entry status: 'pending' | 'ok' | 'fallback' | 'failed'. */
  readonly state: Readonly<Record<string, CdnEntryState>>;
  /**
   * Resolve when every name in the list is `'ok'` or `'fallback'`. Rejects
   * if any becomes `'failed'`.
   */
  whenReady(names: string[]): Promise<void>;
  /**
   * Subscribe to lifecycle events. Returns an unsubscribe function.
   *   - `'ok'`       — fired when an entry loads from CDN successfully
   *   - `'fallback'` — fired when an entry loads from the local vendor chunk
   *   - `'failed'`   — fired when an entry exhausts ALL options
   *   - `'ready'`    — fired once when every entry has resolved (ok|fallback)
   */
  on<E extends keyof LhxCdnEvents>(event: E, handler: LhxCdnEvents[E]): () => void;

  /* -------- internal hooks (called from generated <script onload>) -------- */
  /** @internal */ _ok(name: string): void;
  /** @internal */ _failUrl(name: string, tried: number): void;
}

export type CdnEntryState = 'pending' | 'ok' | 'fallback' | 'failed';

export interface LhxCdnEvents {
  ok: (e: {name: string; url: string}) => void;
  fallback: (e: {name: string; url: string}) => void;
  failed: (e: {name: string; reason: 'no-fallback' | 'local-load-error'}) => void;
  ready: (e: {names: string[]}) => void;
}
