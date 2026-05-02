import {existsSync, readFileSync} from 'node:fs';
import {relative, resolve} from 'node:path';
import type {ResolvedPageDefinition, ResolvedProjectConfig} from '@lhx-kit/config';

/**
 * Minimal shape of the CDN injection payload that HTML rendering cares about.
 * Only the head-level parts (loader IIFE + CDN script tags) are applied at
 * template-render time; the gate script that awaits readiness and imports the
 * entry is applied by plugin.ts during `generateBundle`, AFTER vite has
 * rewritten `{{ entry }}` to the hashed built chunk URL.
 */
export interface HtmlCdnInjection {
  /** IIFE that installs `window.__lhxCdn` before any CDN <script>. */
  loaderScript: string;
  /** Sequence of `<script src="…" onerror>` tags, one per CDN entry. */
  tagsHtml: string;
  /**
   * Factory that, given the final entry URL (after build), returns the IIFE
   * that awaits all CDN deps then dynamic-imports the entry module. Used in
   * the post-build HTML rewrite.
   */
  gateScriptFor: (entryHref: string) => string;
}

export interface HtmlRenderContext {
  project: ResolvedProjectConfig;
  page: ResolvedPageDefinition;
  /** CDN injection payload. `null` means CDN is inactive for this build. */
  cdn?: HtmlCdnInjection | null;
}

/**
 * Load the page's template file contents, applying `{{ title }}`, `{{ entry }}`,
 * and `{{ meta.* }}` placeholders. When `cdn` is provided the head-level CDN
 * loader is injected here; the `<script type="module" src="…">` is left alone
 * so vite can rewrite its URL to the hashed built entry, and plugin.ts will
 * replace it with the gate script in a second pass.
 */
export function renderPageHtml(ctx: HtmlRenderContext): string {
  const {project, page, cdn} = ctx;
  const templatePath = resolve(project.rootDir, page.template);
  let source: string;
  if (existsSync(templatePath)) {
    source = readFileSync(templatePath, 'utf8');
  } else {
    source = defaultTemplate();
  }

  const entryRel = relative(project.rootDir, resolve(project.rootDir, page.entry)).replaceAll('\\', '/');
  const entryHref = '/' + entryRel;

  let rendered = source.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, token: string) => {
    if (token === 'title') return escapeHtml(page.title);
    if (token === 'entry') return entryHref;
    if (token.startsWith('meta.')) {
      const key = token.slice('meta.'.length);
      return escapeHtml(page.meta?.[key] ?? '');
    }
    return `{{ ${token} }}`;
  });

  if (cdn) {
    rendered = injectCdnHeadBlock(rendered, cdn);
  }

  return rendered;
}

/**
 * Post-build helper: given the FINAL HTML emitted by vite (entry URL already
 * rewritten to the hashed chunk), swap the `<script type="module" src=…>`
 * for the CDN gate IIFE that awaits readiness before importing the entry.
 */
export function rewriteModuleScriptWithCdnGate(html: string, cdn: HtmlCdnInjection): string {
  const srcPattern = /<script[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/script>/i;
  const altPattern = /<script[^>]*\bsrc=["']([^"']+)["'][^>]*\btype=["']module["'][^>]*>\s*<\/script>/i;

  const replacer = (match: string, entryHref: string) => `<script>${cdn.gateScriptFor(entryHref)}</script>`;

  if (srcPattern.test(html)) return html.replace(srcPattern, replacer);
  if (altPattern.test(html)) return html.replace(altPattern, replacer);
  return html;
}

function injectCdnHeadBlock(html: string, cdn: HtmlCdnInjection): string {
  // Resource hints live BEFORE the loader script so the browser starts DNS
  // resolution / TLS handshake / preload fetch as early as possible.
  const hints = renderCdnResourceHints(cdn.tagsHtml);
  const headBlock =
    [
      '    <!-- lhx-kit: CDN loader -->',
      hints,
      `    <script>${cdn.loaderScript}</script>`,
      cdn.tagsHtml,
      '    <!-- /lhx-kit: CDN loader -->'
    ]
      .filter(Boolean)
      .join('\n') + '\n  ';

  if (html.includes('</head>')) {
    return html.replace('</head>', `${headBlock}</head>`);
  }
  if (html.includes('<body>')) {
    return html.replace('<body>', `<body>\n${headBlock}`);
  }
  return headBlock + html;
}

/**
 * Build resource hints for the CDN script tags HTML. Two passes:
 *   1. Extract every `https://…` host from `<script src="…">`.
 *   2. For the FIRST url of each entry → `<link rel="preconnect">` (full
 *      handshake) + `<link rel="preload" as="script">` (start fetching now).
 *   3. For SUBSEQUENT urls (failover hosts) → `<link rel="dns-prefetch">`
 *      so onerror failover doesn't pay DNS cost.
 *
 * `crossorigin` is included on preconnect so the connection is reused for
 * the actual `<script>` fetch (which is cross-origin by definition).
 */
function renderCdnResourceHints(tagsHtml: string): string {
  const urls: string[] = [];
  const re = /<script\s+src="(https?:\/\/[^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tagsHtml)) !== null) urls.push(m[1]);
  if (urls.length === 0) return '';

  const lines: string[] = [];
  const seenPreconnect = new Set<string>();
  const seenDnsPrefetch = new Set<string>();

  for (const url of urls) {
    let host: string;
    try {
      host = new URL(url).origin;
    } catch {
      continue;
    }
    if (!seenPreconnect.has(host)) {
      seenPreconnect.add(host);
      lines.push(`    <link rel="preconnect" href="${host}" crossorigin>`);
    }
    // Preload only the primary URL for each entry. We approximate "primary"
    // as: first occurrence of a URL — the per-entry loop already orders them
    // correctly because `renderCdnScriptTags` only emits the first URL per
    // entry, so every URL we see here IS a primary.
    lines.push(`    <link rel="preload" as="script" href="${url}" crossorigin>`);
  }

  // For backup hosts we don't know yet (onerror fallback), do at least
  // dns-prefetch on common public CDN hosts. Cheap, idempotent.
  const FAILOVER_HOSTS = ['https://cdn.jsdelivr.net', 'https://unpkg.com'];
  for (const host of FAILOVER_HOSTS) {
    if (!seenPreconnect.has(host) && !seenDnsPrefetch.has(host)) {
      seenDnsPrefetch.add(host);
      lines.push(`    <link rel="dns-prefetch" href="${host}">`);
    }
  }

  return lines.join('\n');
}

function escapeHtml(input: string): string {
  return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function defaultTemplate(): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>{{ title }}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="{{ entry }}"></script>
  </body>
</html>`;
}
