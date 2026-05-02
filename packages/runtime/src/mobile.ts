/**
 * H5 rem-adaptive runtime. Modelled after the classic `lib-flexible` approach
 * battle-tested inside Baidu Netdisk / Taobao / JD mobile web apps:
 *
 *   1. `document.documentElement.style.fontSize = clientWidth / 10 + 'px'`
 *   2. CSS authors write `px` (at their design canvas resolution, e.g. 750)
 *   3. A build-time `postcss-pxtorem` pass divides every `px` by a `rootValue`
 *      so the final CSS is expressed in `rem`.
 *
 * With `rootValue: 75` (for a 750px design canvas) the result is "1:1" on
 * every mobile viewport width: a `28px` in source becomes `0.37333rem`, and
 * since `1rem = clientWidth / 10`, on a 375px phone that renders as
 * `0.37333 * 37.5 = 14px` — exactly what the designer drew at 2x scale.
 *
 * ## Desktop guard (optional)
 *
 * Plain `clientWidth / 10` blows up on desktop (root font-size becomes 144px
 * at 1440 viewport). Pass `maxWidth: 750` to:
 *
 *   - cap the rem computation at `min(clientWidth, maxWidth)`;
 *   - set `body { max-width: ${maxWidth}px; margin: 0 auto }` so the whole
 *     H5 is rendered as a centered "phone emulator" on desktop browsers.
 *
 * This is the same pattern B站/网易云 use for H5 landing pages that need
 * to look acceptable on desktop traffic without a dedicated PC design.
 *
 * ## Device quirks
 *
 * iPad / Harmony / in-app WebViews sometimes over-report `clientWidth`,
 * leading to oversized fonts. `deviceOverrides` lets consumers plug in
 * ad-hoc adjustments per app (see `examples/vmpa` for one built around
 * query strings).
 */
export interface MobileOptions {
  /**
   * Master switch for the rem adaptation.
   *   - `true`  (default): install the resize handler and keep
   *     `documentElement.style.fontSize` in sync with `clientWidth / 10`.
   *   - `false`: skip rem entirely. Use this for admin / desktop-only
   *     projects where the component library assumes `1rem = 16px`.
   */
  enableRem?: boolean;
  /**
   * CSS max-width applied to `<body>` so the H5 stays centered on desktop.
   * Also caps the rem computation: `fontSize = min(clientWidth, maxWidth) / 10`.
   *
   *   - `number`  (recommended: 750): enable desktop centering + cap.
   *   - `false`   (default): no cap, no centering. Phone-only layout.
   *
   * Most mobile designs in China target a 750px 2x mock, so `maxWidth: 750`
   * pairs well with `postcss-pxtorem` `rootValue: 75`.
   */
  maxWidth?: number | false;
  /** Install --lhx-safe-* CSS vars from env(safe-area-inset-*). Default true. */
  safeArea?: boolean;
  /**
   * Ensure a `<meta name=viewport>` with
   * `width=device-width,initial-scale=1.0,...` is present. Default true.
   * Pass `false` if your HTML template already hand-rolls the meta tag.
   */
  ensureViewport?: boolean;
  /**
   * Feature-detect 0.5px hairline border support (DPR ≥ 2) and add a
   * `hairlines` class to `<html>` so CSS authors can write
   * `.hairlines .foo { border-width: 0.5px }`. Default true.
   */
  detectHairlines?: boolean;
  /**
   * Optional post-process hook called with the computed rem (in px) on every
   * update. Return a different number to override. Use this for per-device
   * quirks, e.g. iPad in landscape:
   *
   *   deviceOverrides: (rem, {clientWidth, clientHeight}) => {
   *     if (isIpad() && clientWidth > clientHeight) return rem * 0.7 * 0.55;
   *     if (isIpad())                               return rem * 0.7;
   *     return rem;
   *   }
   */
  deviceOverrides?: (rem: number, ctx: {clientWidth: number; clientHeight: number; dpr: number}) => number;
}

export function setupMobile(options: MobileOptions = {}): () => void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return () => {};

  const enableRem = options.enableRem ?? true;
  const maxWidth = options.maxWidth === false || options.maxWidth == null ? null : options.maxWidth;
  const safeArea = options.safeArea ?? true;
  const ensureVp = options.ensureViewport ?? true;
  const detectHair = options.detectHairlines ?? true;
  const deviceOverrides = options.deviceOverrides;

  if (ensureVp) ensureViewportMeta();
  if (safeArea) applySafeAreaVars();
  if (maxWidth != null) applyBodyMaxWidth(maxWidth);
  if (detectHair) detectHairlineSupport();

  if (!enableRem) return () => {};

  function updateRem(): void {
    const docEl = document.documentElement;
    const rawWidth = docEl.clientWidth;
    if (!rawWidth) return;
    const clientHeight = docEl.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    // Cap the width used for rem calculation. This is what keeps the layout
    // looking sane on desktop viewports when `maxWidth` is set.
    const cappedWidth = maxWidth != null ? Math.min(rawWidth, maxWidth) : rawWidth;
    let rem = cappedWidth / 10;
    if (deviceOverrides) {
      rem = deviceOverrides(rem, {clientWidth: rawWidth, clientHeight, dpr});
    }
    docEl.style.fontSize = `${rem}px`;
  }

  updateRem();
  // iOS sometimes reports the old width on the first resize after an
  // orientation change, so we schedule a follow-up tick. Lib-flexible
  // does the same.
  window.addEventListener('resize', updateRem, {passive: true});
  window.addEventListener('orientationchange', () => {
    updateRem();
    setTimeout(updateRem, 300);
  });
  window.addEventListener('pageshow', e => {
    if ((e as PageTransitionEvent).persisted) updateRem();
  });

  return () => {
    window.removeEventListener('resize', updateRem);
  };
}

function ensureViewportMeta(): void {
  const existing = document.querySelector('meta[name="viewport"]');
  const content = 'width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no,viewport-fit=cover';
  if (existing) {
    existing.setAttribute('content', content);
    return;
  }
  const meta = document.createElement('meta');
  meta.setAttribute('name', 'viewport');
  meta.setAttribute('content', content);
  document.head.appendChild(meta);
}

function applySafeAreaVars(): void {
  const root = document.documentElement.style;
  root.setProperty('--lhx-safe-top', 'env(safe-area-inset-top, 0px)');
  root.setProperty('--lhx-safe-right', 'env(safe-area-inset-right, 0px)');
  root.setProperty('--lhx-safe-bottom', 'env(safe-area-inset-bottom, 0px)');
  root.setProperty('--lhx-safe-left', 'env(safe-area-inset-left, 0px)');
}

/**
 * Install `body { max-width; margin: 0 auto; background }` via an injected
 * <style> so consumers don't have to maintain it in their own CSS. The
 * background color matches the iOS "safe area" look on desktop.
 */
function applyBodyMaxWidth(maxWidth: number): void {
  const id = 'lhx-body-max-width';
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = `
    body {
      max-width: ${maxWidth}px;
      margin: 0 auto;
      min-height: 100vh;
      background: #fff;
      box-shadow: 0 0 24px rgba(0, 0, 0, 0.08);
    }
    @media (max-width: ${maxWidth}px) {
      body { box-shadow: none; }
    }
  `;
  document.head.appendChild(style);
}

/**
 * Add `html.hairlines` when the device supports real 0.5px borders, so CSS
 * authors can upgrade their border width conditionally:
 *
 *   .foo { border-bottom: 1px solid #eee; }
 *   .hairlines .foo { border-bottom-width: 0.5px; }
 */
function detectHairlineSupport(): void {
  const docEl = document.documentElement;
  if ((window.devicePixelRatio || 1) < 2) return;
  const fakeBody = document.createElement('body');
  const testEl = document.createElement('div');
  testEl.style.border = '.5px solid transparent';
  fakeBody.appendChild(testEl);
  docEl.appendChild(fakeBody);
  if (testEl.offsetHeight === 1) docEl.classList.add('hairlines');
  docEl.removeChild(fakeBody);
}

export function lockScroll(className = 'lhx-lock-scroll'): () => void {
  if (typeof document === 'undefined') return () => {};
  document.body.classList.add(className);
  return () => document.body.classList.remove(className);
}
