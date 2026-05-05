import {createRequest} from '@lhx-kit/runtime/request';

export const http: ReturnType<typeof createRequest> = createRequest({
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
