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

type MswModule = typeof import('msw');
type MswBrowserModule = typeof import('msw/browser');

async function importMsw(): Promise<{msw: MswModule; browser: MswBrowserModule}> {
  const [msw, browser] = await Promise.all([
    import('msw').catch(() => undefined),
    import('msw/browser').catch(() => undefined)
  ]);
  if (!msw || !browser) {
    throw new Error('MSW is not installed. Add "msw" to the project dependencies to enable mocks.');
  }
  return {msw, browser};
}

export function createMock(handlers: MockHandler[]): MockController {
  let worker: ReturnType<MswBrowserModule['setupWorker']> | undefined;

  async function ensureWorker(): Promise<ReturnType<MswBrowserModule['setupWorker']>> {
    if (worker) return worker;
    const {msw, browser} = await importMsw();
    const requestHandlers = handlers.map(handler => {
      const fn = msw.http[handler.method];
      return fn(handler.url as string, async ({request}) => {
        const body = await request
          .clone()
          .json()
          .catch(() => undefined);
        const response =
          typeof handler.response === 'function'
            ? await (handler.response as (input: {url: string; body: unknown}) => unknown | Promise<unknown>)({
                url: request.url,
                body
              })
            : handler.response;
        if (handler.delay) await new Promise(r => setTimeout(r, handler.delay));
        return msw.HttpResponse.json(response as Record<string, unknown>, {status: handler.status ?? 200});
      });
    });
    worker = browser.setupWorker(...requestHandlers);
    return worker;
  }

  return {
    handlers,
    async start() {
      const w = await ensureWorker();
      await w.start({onUnhandledRequest: 'bypass'});
    },
    async stop() {
      if (worker) await worker.stop();
    }
  };
}
