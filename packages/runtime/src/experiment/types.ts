export type FeatureFlags = Record<string, boolean | string | number>;

export interface ExperimentOptions {
  defaults?: FeatureFlags;
  loader?: () => Promise<FeatureFlags>;
}

export interface ExperimentController {
  get<T extends boolean | string | number = boolean>(key: string, fallback?: T): T;
  set(values: FeatureFlags): void;
  refresh(): Promise<void>;
  subscribe(listener: (flags: FeatureFlags) => void): () => void;
}
