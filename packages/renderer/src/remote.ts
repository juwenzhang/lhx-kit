import type {PageSchema, RendererDiagnostic} from './schema';

export interface RemoteFetchOptions {
  url: string;
  /**
   * When the request fails or returns invalid JSON/schema, the caller receives
   * `fallback` instead and a diagnostic is emitted.
   */
  fallback: PageSchema;
  /** Abort after `timeout` ms. Default 3000. */
  timeout?: number;
  /** In-memory cache behavior. Default: 'default' (cache hit reused). */
  cache?: 'default' | 'reload' | 'no-store';
  /** Custom headers to send with the request. */
  headers?: Record<string, string>;
  /** Receives diagnostics (timeout, schema mismatch, parse error). */
  onDiagnostic?: (d: RendererDiagnostic) => void;
  /** Custom fetch implementation (for tests / Node environments). Default: globalThis.fetch. */
  fetchImpl?: typeof fetch;
}

type CacheEntry = {at: number; schema: PageSchema};
const memCache = new Map<string, CacheEntry>();
const MAX_CACHE_AGE = 5 * 60 * 1000; // 5 minutes

export function clearRemoteSchemaCache(): void {
  memCache.clear();
}

export async function fetchRemoteSchema(options: RemoteFetchOptions): Promise<PageSchema> {
  const {url, fallback, onDiagnostic} = options;
  const timeout = options.timeout ?? 3000;
  const cache = options.cache ?? 'default';
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as typeof fetch | undefined);

  if (!fetchImpl) {
    onDiagnostic?.({
      level: 'warn',
      code: 'renderer/remote-no-fetch',
      message: 'globalThis.fetch is not available; using fallback schema.',
      source: url
    });
    return fallback;
  }

  // Cache hit.
  if (cache === 'default') {
    const hit = memCache.get(url);
    if (hit && Date.now() - hit.at < MAX_CACHE_AGE) return hit.schema;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const resp = await fetchImpl(url, {
      signal: controller.signal,
      headers: options.headers,
      cache: cache === 'reload' ? 'reload' : cache === 'no-store' ? 'no-store' : 'default'
    });
    if (!resp.ok) {
      onDiagnostic?.({
        level: 'warn',
        code: 'renderer/remote-http-error',
        message: `Remote schema request failed with ${resp.status}; using fallback.`,
        source: url
      });
      return fallback;
    }
    let payload: unknown;
    try {
      payload = await resp.json();
    } catch (error) {
      onDiagnostic?.({
        level: 'warn',
        code: 'renderer/remote-parse-error',
        message: `Remote schema JSON parse failed: ${error instanceof Error ? error.message : String(error)}; using fallback.`,
        source: url
      });
      return fallback;
    }
    const {pageSchema} = await import('./schema-zod');
    const parsed = pageSchema.safeParse(payload);
    if (!parsed.success) {
      onDiagnostic?.({
        level: 'warn',
        code: 'renderer/remote-invalid-schema',
        message: `Remote schema failed validation (${parsed.error.issues.length} issue(s)); using fallback.`,
        source: url
      });
      return fallback;
    }
    const schema = parsed.data as PageSchema;
    if (cache !== 'no-store') {
      memCache.set(url, {at: Date.now(), schema});
    }
    return schema;
  } catch (error) {
    onDiagnostic?.({
      level: 'warn',
      code: 'renderer/remote-fetch-error',
      message: `Remote schema fetch failed (${error instanceof Error ? error.message : String(error)}); using fallback.`,
      source: url
    });
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}
