export interface MockHandler {
  method: 'get' | 'post' | 'put' | 'delete' | 'patch';
  url: string | RegExp;
  response: unknown | ((input: {url: string; body: unknown}) => unknown | Promise<unknown>);
  status?: number;
  delay?: number;
}

export interface MockController {
  start(): Promise<void>;
  stop(): Promise<void>;
  handlers: MockHandler[];
}
