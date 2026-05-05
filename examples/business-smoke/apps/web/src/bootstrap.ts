import {createLogger} from '@lhx-kit/runtime/logger';
import {setupMobile} from '@lhx-kit/runtime/mobile';

export const logger = createLogger({
  level: import.meta.env.DEV ? 'debug' : 'info',
  tags: {app: 'business-smoke'}
});

export async function bootstrap(): Promise<void> {
  if (import.meta.env.DEV) {
    const {worker} = await import('./mocks/browser');
    await worker.start({onUnhandledRequest: 'bypass'});
  }
  setupMobile({enableRem: false});
}
