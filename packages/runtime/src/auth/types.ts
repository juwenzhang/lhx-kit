export interface AuthState {
  status: 'anonymous' | 'authenticated' | 'expired';
  token?: string;
  userId?: string;
  expiresAt?: number;
  profile?: Record<string, unknown>;
}

export interface AuthAdapter {
  getState(): AuthState;
  login(credentials?: Record<string, unknown>): Promise<AuthState>;
  logout(): Promise<void>;
  refresh(): Promise<AuthState>;
  onStateChange(listener: (state: AuthState) => void): () => void;
}

export interface AuthStore {
  read(): AuthState | undefined;
  write(state: AuthState): void;
  clear(): void;
}

export interface BaseAuthOptions {
  store?: AuthStore;
  initial?: AuthState;
}
