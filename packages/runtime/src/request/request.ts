import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig
} from 'axios';
import type {CreateRequestOptions} from './types';

function requestKey(config: AxiosRequestConfig): string {
  return [
    config.method || 'get',
    config.url || '',
    JSON.stringify(config.params || {}),
    JSON.stringify(config.data || {})
  ].join('|');
}

export function createRequest(options: CreateRequestOptions = {}): AxiosInstance {
  const instance = axios.create({
    baseURL: options.baseURL,
    timeout: options.timeout ?? 15000,
    withCredentials: options.withCredentials,
    headers: options.commonHeaders
  });

  instance.interceptors.request.use(async config => {
    if (options.commonParams) {
      config.params = {...options.commonParams, ...(config.params || {})};
    }
    let next = config;
    for (const interceptor of options.requestInterceptors || []) {
      next = await interceptor(next);
    }
    return next;
  });

  const pending = new Map<string, Promise<AxiosResponse>>();
  if (options.dedupe) {
    instance.interceptors.request.use(async config => {
      const key = requestKey(config);
      const inflight = pending.get(key);
      if (inflight) {
        const existing = await inflight;
        (config as InternalAxiosRequestConfig & {__lhx_dedupe?: AxiosResponse}).__lhx_dedupe = existing;
      }
      return config;
    });
  }

  instance.interceptors.response.use(
    async response => {
      let next = response;
      for (const interceptor of options.responseInterceptors || []) {
        next = await interceptor(next);
      }
      return next;
    },
    async error => {
      for (const interceptor of options.errorInterceptors || []) {
        interceptor(error);
      }
      const retry = options.retry;
      const config = error?.config as InternalAxiosRequestConfig & {__lhx_retry_count?: number};
      if (retry && config && (!retry.shouldRetry || retry.shouldRetry(error))) {
        config.__lhx_retry_count = (config.__lhx_retry_count || 0) + 1;
        if (config.__lhx_retry_count <= retry.count) {
          if (retry.delay) await new Promise(r => setTimeout(r, retry.delay));
          return instance.request(config);
        }
      }
      return Promise.reject(error);
    }
  );

  const originalRequest = instance.request.bind(instance) as AxiosInstance['request'];
  instance.request = (async (config: AxiosRequestConfig) => {
    if (options.dedupe) {
      const key = requestKey(config);
      const cached = pending.get(key);
      if (cached) return cached;
      const promise = originalRequest(config).finally(() => pending.delete(key));
      pending.set(key, promise as Promise<AxiosResponse>);
      return promise;
    }
    return originalRequest(config);
  }) as AxiosInstance['request'];

  return instance;
}
