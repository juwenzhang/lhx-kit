import type {BridgeAdapter, WebViewBridgeOptions} from './types';

export function createNoopBridge<
  TMethods extends Record<string, (...args: never[]) => unknown>
>(): BridgeAdapter<TMethods> {
  return {
    async call() {
      return undefined as never;
    },
    available() {
      return false;
    }
  };
}

export function createWebViewBridge<TMethods extends Record<string, (...args: never[]) => unknown>>(
  options: WebViewBridgeOptions = {}
): BridgeAdapter<TMethods> {
  const namespace = options.namespace || 'AppBridge';
  function access(): Record<string, (...args: unknown[]) => unknown> | undefined {
    if (typeof window === 'undefined') return undefined;
    const target = (window as unknown as Record<string, unknown>)[namespace];
    return target && typeof target === 'object'
      ? (target as Record<string, (...args: unknown[]) => unknown>)
      : undefined;
  }
  return {
    async call(method, ...args) {
      const bridge = access();
      if (!bridge || typeof bridge[method as string] !== 'function') {
        throw new Error(`Bridge method ${String(method)} is not available`);
      }
      return bridge[method as string](...args) as never;
    },
    available() {
      return Boolean(access());
    }
  };
}
