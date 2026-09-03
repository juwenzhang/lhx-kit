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
