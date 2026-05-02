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

export function createExperiment(options: ExperimentOptions = {}): ExperimentController {
  let flags: FeatureFlags = {...(options.defaults || {})};
  const listeners = new Set<(flags: FeatureFlags) => void>();

  function emit(): void {
    for (const listener of listeners) listener({...flags});
  }

  return {
    get<T extends boolean | string | number = boolean>(key: string, fallback?: T): T {
      return (key in flags ? flags[key] : fallback) as T;
    },
    set(values) {
      flags = {...flags, ...values};
      emit();
    },
    async refresh() {
      if (!options.loader) return;
      const next = await options.loader();
      flags = {...flags, ...next};
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      listener({...flags});
      return () => listeners.delete(listener);
    }
  };
}
