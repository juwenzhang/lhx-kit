# Mobile Adaptation (rem + desktop center)

lhx-kit ships a **rem-based** adapter. It picks `document.documentElement.clientWidth`
every render → sets `html.style.fontSize = clientWidth / 10 + 'px'`. Combined
with `postcss-pxtorem`, every `100px` in the design file becomes `1rem` at
runtime. Works on iOS/Android, respects desktop max-width containers.

## Why rem (and not vw / viewport scale)

| Approach | Verdict |
| --- | --- |
| **`<meta viewport>` initial-scale trick** | ❌ Breaks inside embedded webviews; WeChat overrides |
| **`vw` everywhere** | ❌ 1vw is not evenly divisible for many design-file pixel values; fractional rounding visible on low-DPR |
| **rem + clientWidth/10** ✅ | Stable, JS-controlled, no OS quirks, works in iframes |
| **Pure media queries** | ❌ Only breakpoint-discrete; no fluid scaling |

## Enabling the Adapter

```ts title="project.config.ts"
import {defineProjectConfig} from '@lhx-kit/config';

export default defineProjectConfig({
  mobile: {
    enabled: true,
    designWidth: 750,       // default 750 (iPhone 6/7/8 @ 2x)
    maxWidth: 750,          // desktop preview caps font-size at this width
    minWidth: 320,          // floor for very narrow devices
    deviceOverrides: {
      // Override the scaling factor for specific user-agents
      iPad: 0.8,
      iPhone: 1
    }
  }
});
```

## What the Runtime Does

```ts title="@lhx-kit/runtime (pseudo)"
function setRootFontSize() {
  let width = document.documentElement.clientWidth;
  if (width > maxWidth) width = maxWidth;           // desktop cap
  if (width < minWidth) width = minWidth;           // tiny-screen floor
  const scale = deviceOverrides[currentDevice] ?? 1;
  document.documentElement.style.fontSize =
    ((width / designWidth) * 100 * scale) + 'px';
}
window.addEventListener('resize', setRootFontSize);
setRootFontSize();
```

## PostCSS Configuration

```js title="postcss.config.cjs"
module.exports = {
  plugins: {
    'postcss-pxtorem': {
      rootValue: 100,                  // 100px = 1rem (matches the *100 above)
      propList: ['*'],                 // transform all props; opt-outs below
      selectorBlackList: [/^\.van-/],  // keep Vant untouched
      minPixelValue: 2                 // `1px` stays as hairline borders
    }
  }
};
```

## Design File → Code Convention

- Figma uses `750px` wide artboard. Measure any element's px value directly.
- Write in CSS as `px`, PostCSS converts at build time.
- `100px` in Figma → `1rem` at runtime → scales with viewport.
- `1px` borders stay at hairlines (`minPixelValue: 2` above).

## Desktop Preview (centered column)

For a mobile-first design running on desktop, add a wrapper CSS:

```css title="src/reset.css"
html, body {
  max-width: 750px;           /* same as maxWidth in project.config.ts */
  margin: 0 auto;
  background: #f5f5f5;
}

/* Optional: show a desktop shell so the centered content looks intentional */
body::before {
  content: '';
  position: fixed; inset: 0;
  background: #e5e5e5;
  z-index: -1;
}
```

## Pitfalls

:::warning `clientWidth` first-read on iOS
iOS Safari sometimes reports the wrong `clientWidth` on the first tick
(before layout settles). Mitigate by running the set inside `DOMContentLoaded`
AND wrapping a single rAF:
```ts
requestAnimationFrame(setRootFontSize);
```
:::

:::danger Never use `vh` for heights
`100vh` includes the Safari URL bar; the page jumps when it collapses. Use
`100%` of a full-height `<html>, <body>` instead.
:::

:::tip 1px hairlines
With DPR ≥ 2 and `minPixelValue: 2`, a `1px` border in CSS becomes a physical
half-pixel hairline. No need for the `::after + transform` hack anymore.
:::

:::info Turning the adapter off (e.g. admin panel)
Set `mobile.enabled = false`. The runtime no-ops; `html.fontSize` stays at
browser default (16px). All `rem`-authored CSS now scales against 16.
:::

## Validation

```bash
lhx-cli doctor --check=mobile
# reports computed font-size for 320 / 375 / 414 / 750 / 1440 widths
```
