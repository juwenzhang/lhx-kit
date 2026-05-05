import Router from '@koa/router';
import {cache} from '../cache';
import {ping as pingDb} from '../db';

export const healthRouter = new Router();

healthRouter.get('/livez', ctx => {
  ctx.body = {status: 'ok'};
});

healthRouter.get('/readyz', async ctx => {
  const checks: Record<string, boolean> = {};

  await Promise.allSettled([
    pingDb()
      .then(ok => {
        checks['db'] = ok;
      })
      .catch(() => {
        checks['db'] = false;
      }),
    cache
      .ping()
      .then(r => {
        checks['redis'] = r === 'PONG';
      })
      .catch(() => {
        checks['redis'] = false;
      })
  ]);

  const ok = Object.values(checks).every(Boolean);
  ctx.status = ok ? 200 : 503;
  ctx.body = {status: ok ? 'ok' : 'degraded', checks};
});
