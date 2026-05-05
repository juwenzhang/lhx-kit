import {Router} from 'express';
import {cache} from '../cache';
import {ping as pingDb} from '../db';

export const healthRouter = Router();

healthRouter.get('/livez', (_req, res) => {
  res.json({status: 'ok'});
});

healthRouter.get('/readyz', async (_req, res) => {
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
  res.status(ok ? 200 : 503).json({status: ok ? 'ok' : 'degraded', checks});
});
