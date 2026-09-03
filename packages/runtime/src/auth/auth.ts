import type {AuthAdapter, AuthState, AuthStore, BaseAuthOptions} from './types';

export function createMemoryAuthStore(): AuthStore {
  let current: AuthState | undefined;
  return {
    read: () => current,
    write: state => {
      current = state;
    },
    clear: () => {
      current = undefined;
    }
  };
}

export function createAuth(
  options: BaseAuthOptions & {
    login: (credentials?: Record<string, unknown>) => Promise<AuthState>;
    logout?: () => Promise<void>;
    refresh?: () => Promise<AuthState>;
  }
): AuthAdapter {
  const store = options.store || createMemoryAuthStore();
  if (options.initial) store.write(options.initial);
  const listeners = new Set<(state: AuthState) => void>();

  function snapshot(): AuthState {
    return store.read() || {status: 'anonymous'};
  }

  function update(next: AuthState): AuthState {
    store.write(next);
    for (const listener of listeners) listener(next);
    return next;
  }

  return {
    getState: snapshot,
    async login(credentials) {
      return update(await options.login(credentials));
    },
    async logout() {
      await options.logout?.();
      store.clear();
      for (const listener of listeners) listener({status: 'anonymous'});
    },
    async refresh() {
      if (!options.refresh) return snapshot();
      return update(await options.refresh());
    },
    onStateChange(listener) {
      listeners.add(listener);
      listener(snapshot());
      return () => listeners.delete(listener);
    }
  };
}
