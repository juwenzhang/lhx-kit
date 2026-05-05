import {createLogger} from '@lhx-kit/runtime/logger';
import {setupMobile} from '@lhx-kit/runtime/mobile';
import './styles/target.css';

export const logger = createLogger({
  level: import.meta.env.DEV ? 'debug' : 'info',
  tags: {app: 'examples-cli-smoke'}
});

/**
 * App-wide setup run before each page mounts. Order matters:
 *   1. Kick the mock worker in dev so the first request already intercepts.
 *   2. Apply viewport meta, safe-area CSS vars, and the rem adaptation.
 *
 * `maxWidth: 750` enables the desktop guard: on viewports wider than 750px
 * the H5 stays centered as a "phone emulator" (`body { max-width; margin
 * auto }`), and the rem computation is capped at 750 so font-sizes no
 * longer explode when you test in a regular desktop browser.
 *
 * Pair this with `vite.config.ts` `postcss-pxtorem` (`rootValue: 75`) so you
 * can write `px` at your 750-px design-canvas scale and let the build pass
 * convert everything to `rem` automatically.
 */
export async function bootstrap(): Promise<void> {
  if (import.meta.env.DEV) {
    const {worker} = await import('./mocks/browser');
    await worker.start({onUnhandledRequest: 'bypass'});
  }
  setupMobile({maxWidth: 750});
}
