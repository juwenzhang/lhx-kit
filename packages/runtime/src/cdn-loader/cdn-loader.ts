/**
 * Runtime CDN loader for `@lhx-kit/vite-plugin`.
 *
 * This file is special: vite-plugin **stringifies the rendered script** below
 * and inlines it into each page's HTML as a classic (non-module) `<script>`
 * before any entry `<script type="module">`. Constraints:
 *
 *   - the script must be self-contained (no imports);
 *   - it must work when minified/transformed by the kit's build, and when
 *     inlined verbatim (no top-level await, target ES2018+);
 *   - it must namespace ALL globals under a configurable name so user code
 *     can interact with it AND so users can avoid collisions with their own
 *     window-level identifiers.
 *
 * The runtime exposes a **public API** at `window[<namespace>]` (default name:
 * `'LhxCdn'`, configurable via `cdn.globalNamespace` in `project.config.ts`).
 * Members prefixed with `_` are implementation details (used by the inline
 * `onload`/`onerror` attributes we generate); everything else is the public
 * user contract:
 *
 *   ```ts
 *   await window.LhxCdn.whenReady(['vue']);     // wait for one or more deps
 *   window.LhxCdn.state.vue;                    // 'pending' | 'ok' | 'fallback' | 'failed'
 *   window.LhxCdn.on('fallback', ({name}) => …);// subscribe to lifecycle
 *   window.LhxCdn.on('failed',   ({name}) => …);
 *   window.LhxCdn.on('ready',    ({names}) => …);
 *   ```
 */

import type {CdnPlan, CdnPlanEntry} from './types';

/**
 * Default namespace used when callers (older code paths or tests) omit the
 * `namespace` argument. Production code always passes a value derived from
 * `project.config.ts` `cdn.globalNamespace`.
 */
export const DEFAULT_CDN_NAMESPACE = 'LhxCdn';

/** Defensive identifier check; mirrors the zod schema in `@lhx-kit/config`. */
function assertValidNamespace(ns: string): void {
  if (!/^[A-Za-z_$][\w$]*$/.test(ns)) {
    throw new Error(`[lhx-kit] cdn.globalNamespace must be a valid JS identifier, got: ${JSON.stringify(ns)}`);
  }
}

/**
 * Produce the loader source as a string. The plugin calls this at build time
 * to generate the `<script>` body that ships inside each page HTML.
 *
 * @param namespace  Property name on `window` to install the API at.
 *                   Defaults to `'LhxCdn'` for backwards compatibility.
 */
export function renderCdnLoaderScript(plan: CdnPlan, namespace: string = DEFAULT_CDN_NAMESPACE): string {
  assertValidNamespace(namespace);
  const planJson = JSON.stringify(plan);
  // ES5-compatible body: avoids arrow fns, spread, optional chaining etc.
  // The `__NS__` placeholder is replaced by the configured namespace.
  return (
    ';(function(){' +
    `var plan=${planJson};` +
    'var w=window;' +
    `if(w.${namespace}){return;}` +
    'var state={};' +
    'var waiters=[];' +
    'var listeners={ok:[],fallback:[],failed:[],ready:[]};' +
    'var triedByName={};' +
    'var readyFired=false;' +
    'function emit(t,p){var a=listeners[t];if(!a)return;for(var i=0;i<a.length;i++){try{a[i](p);}catch(e){}}}' +
    'function applyAliases(entry){' +
    'if(entry.aliasGlobals){' +
    'var src=w[entry.globalVar];' +
    'for(var ai=0;ai<entry.aliasGlobals.length;ai++){w[entry.aliasGlobals[ai]]=src;}' +
    '}' +
    'if(entry.initScript){' +
    'try{(new Function(entry.initScript))();}catch(e){' +
    `if(typeof console!=="undefined"&&console.error){console.error("[${namespace}] initScript error for "+entry.name+":",e);}` +
    '}' +
    '}' +
    '}' +
    'function checkReady(){' +
    'if(readyFired)return;' +
    `var names=[];for(var i=0;i<plan.entries.length;i++){var n=plan.entries[i].name;var s=state[n];if(s!=="ok"&&s!=="fallback")return;names.push(n);}` +
    `readyFired=true;emit("ready",{names:names});` +
    '}' +
    'function markDone(){' +
    'for(var i=waiters.length-1;i>=0;i--){var wt=waiters[i];var all=true;' +
    `for(var j=0;j<wt.names.length;j++){var s=state[wt.names[j]];if(s==="failed"){waiters.splice(i,1);wt.reject(new Error("[${namespace}] dep failed: "+wt.names[j]));all=null;break;}if(s!=="ok"&&s!=="fallback"){all=false;break;}}` +
    'if(all===true){waiters.splice(i,1);wt.resolve();}' +
    '}' +
    'checkReady();' +
    '}' +
    'function loadLocalFallback(entry){' +
    `if(!entry.localFallbackUrl||plan.fallback==="error"){state[entry.name]="failed";emit("failed",{name:entry.name,reason:"no-fallback"});markDone();return;}` +
    'import(/* @vite-ignore */ entry.localFallbackUrl).then(function(mod){' +
    'w[entry.globalVar]=mod&&mod.default?mod.default:mod;' +
    'applyAliases(entry);' +
    `state[entry.name]="fallback";emit("fallback",{name:entry.name,url:entry.localFallbackUrl});markDone();` +
    `}).catch(function(){state[entry.name]="failed";emit("failed",{name:entry.name,reason:"local-load-error"});markDone();});` +
    '}' +
    'function findEntry(name){for(var i=0;i<plan.entries.length;i++){if(plan.entries[i].name===name)return plan.entries[i];}return null;}' +
    `w.${namespace}={` +
    'plan:plan,' +
    'state:state,' +
    `_ok:function(name){if(state[name]==="pending"){state[name]="ok";var e=findEntry(name);if(e)applyAliases(e);emit("ok",{name:name,url:e?e.urls[triedByName[name]||0]:""});markDone();}},` +
    '_failUrl:function(name,tried){' +
    'var entry=findEntry(name);if(!entry)return;' +
    'var next=tried+1;triedByName[name]=next;' +
    'if(next>=entry.urls.length){loadLocalFallback(entry);return;}' +
    `var s=document.createElement("script");` +
    `s.src=entry.urls[next];s.async=false;s.crossOrigin="anonymous";` +
    `s.setAttribute("data-lhx-cdn",name);` +
    `s.onload=function(){w.${namespace}._ok(name);};` +
    `s.onerror=function(){w.${namespace}._failUrl(name,next);};` +
    'document.head.appendChild(s);' +
    '},' +
    'whenReady:function(names){' +
    'return new Promise(function(resolve,reject){' +
    'var anyFailed=false;var allOk=true;' +
    `for(var i=0;i<names.length;i++){var s=state[names[i]];if(s==="failed"){anyFailed=names[i];break;}if(s!=="ok"&&s!=="fallback"){allOk=false;}}` +
    `if(anyFailed){reject(new Error("[${namespace}] dep failed: "+anyFailed));return;}` +
    'if(allOk){resolve();return;}' +
    'waiters.push({names:names,resolve:resolve,reject:reject});' +
    '});' +
    '},' +
    'on:function(event,handler){' +
    'var arr=listeners[event];if(!arr)return function(){};arr.push(handler);' +
    'return function(){var i=arr.indexOf(handler);if(i>=0)arr.splice(i,1);};' +
    '}' +
    '};' +
    `for(var k=0;k<plan.entries.length;k++){state[plan.entries[k].name]="pending";triedByName[plan.entries[k].name]=0;}` +
    // Eagerly trigger local-fallback load for entries with NO CDN urls
    // declared (e.g. offline packages strip urls to []).
    'for(var k2=0;k2<plan.entries.length;k2++){var e0=plan.entries[k2];if(!e0.urls||e0.urls.length===0){loadLocalFallback(e0);}}' +
    // Per-entry timeout: if not resolved in time, force-fail the current URL.
    'setTimeout(function(){' +
    `for(var i=0;i<plan.entries.length;i++){var e=plan.entries[i];if(state[e.name]==="pending"){w.${namespace}._failUrl(e.name,triedByName[e.name]);}}` +
    '},plan.timeoutMs);' +
    '})();'
  );
}

/**
 * Render the ordered `<script>` tags (without the surrounding `<head>`).
 * Each tag declares `crossorigin` (anonymous credentials) so it matches the
 * `<link rel=preload>` we emit and so window.onerror receives the full error
 * object for cross-origin scripts. We also stamp `data-lhx-cdn` for
 * diagnostic tooling.
 */
export function renderCdnScriptTags(entries: CdnPlanEntry[], namespace: string = DEFAULT_CDN_NAMESPACE): string {
  assertValidNamespace(namespace);
  const lines: string[] = [];
  for (const entry of entries) {
    const firstUrl = entry.urls[0];
    if (!firstUrl) continue;
    if (entry.name.includes("'")) {
      throw new Error(`[lhx-kit] CDN entry name cannot contain a single quote: ${entry.name}`);
    }
    const nameLit = `'${entry.name}'`;
    lines.push(
      `    <script src="${firstUrl}" crossorigin data-lhx-cdn="${entry.name}" ` +
        `onload="window.${namespace}&&window.${namespace}._ok(${nameLit})" ` +
        `onerror="window.${namespace}&&window.${namespace}._failUrl(${nameLit},0)"></script>`
    );
  }
  return lines.join('\n');
}

/**
 * Build the ordered "ready gate" for page entries. In HTML this is the last
 * inline script before we dynamic-import the real entry module. It awaits
 * every dependency declared in the plan (in declaration order) so that by
 * the time the entry evaluates, `window.Vue`, `window.Pinia` etc. are set.
 */
export function renderCdnGateScript(
  entryNames: string[],
  entryHref: string,
  namespace: string = DEFAULT_CDN_NAMESPACE
): string {
  assertValidNamespace(namespace);
  const namesJson = JSON.stringify(entryNames);
  const entryJson = JSON.stringify(entryHref);
  return (
    ';(function(){' +
    'var w=window;' +
    `function go(){import(/* @vite-ignore */ ${entryJson});}` +
    `if(!w.${namespace}||${namesJson}.length===0){go();return;}` +
    `w.${namespace}.whenReady(${namesJson}).then(go).catch(function(err){console.error(err);go();});` +
    '})();'
  );
}
