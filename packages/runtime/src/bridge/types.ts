export interface BridgeAdapter<TMethods extends Record<string, (...args: never[]) => unknown> = Record<string, never>> {
  call<K extends keyof TMethods>(method: K, ...args: Parameters<TMethods[K]>): Promise<ReturnType<TMethods[K]>>;
  available(): boolean;
}

export interface WebViewBridgeOptions {
  namespace?: string;
}
