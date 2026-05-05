import {createRequest} from '@lhx-kit/runtime/request';

/**
 * Shared HTTP client for the entire app.
 *
 * - `baseURL` is injected by `@lhx-kit/vite-plugin` from `project.config.envs[mode].apiBase`.
 * - Retries transient network errors once.
 * - Deduplicates identical in-flight requests.
 */
export const http = createRequest({
  baseURL: import.meta.env.LHX_API_BASE,
  timeout: 10000,
  dedupe: true,
  retry: {
    count: 1,
    delay: 500,
    shouldRetry: err => {
      const status = (err as {response?: {status?: number}})?.response?.status;
      return !status || status >= 500;
    }
  }
});
