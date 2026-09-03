import type {AxiosResponse, InternalAxiosRequestConfig} from 'axios';

export type ResponseInterceptor = (response: AxiosResponse) => AxiosResponse | Promise<AxiosResponse>;
export type RequestInterceptor = (
  config: InternalAxiosRequestConfig
) => InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig>;
export type ErrorInterceptor = (error: unknown) => unknown;

export interface CreateRequestOptions {
  baseURL?: string;
  timeout?: number;
  withCredentials?: boolean;
  commonHeaders?: Record<string, string>;
  commonParams?: Record<string, string | number | boolean>;
  retry?: {
    count: number;
    delay?: number;
    shouldRetry?: (error: unknown) => boolean;
  };
  dedupe?: boolean;
  requestInterceptors?: RequestInterceptor[];
  responseInterceptors?: ResponseInterceptor[];
  errorInterceptors?: ErrorInterceptor[];
}
