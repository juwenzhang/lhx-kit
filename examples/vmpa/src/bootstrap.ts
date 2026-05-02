import {setupMobile} from '@lhx-kit/runtime/mobile';
import {createLogger} from '@lhx-kit/runtime/logger';
import './styles/reset.css';

export const logger = createLogger({
  level: import.meta.env.DEV ? 'debug' : 'info',
  tags: {app: 'vmpa'}
});

/**
 * App-wide setup run before each page mounts. Order matters:
 * 1. Kick mock worker in dev so the first request already intercepts.
 * 2. Apply viewport / rem / safe-area vars (no-op on non-mobile environments).
 */
export async function bootstrap(): Promise<void> {
  if (import.meta.env.DEV) {
    const {worker} = await import('./mocks/browser');
    await worker.start({onUnhandledRequest: 'bypass'});
  }
  setupMobile({maxWidth: 750});
}
