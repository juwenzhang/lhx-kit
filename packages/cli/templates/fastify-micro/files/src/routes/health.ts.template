import type {FastifyPluginAsync} from 'fastify';
import {cache} from '../cache';
import {ping as pingDb} from '../db';

export const healthRoutes: FastifyPluginAsync = async fastify => {
  fastify.get('/livez', async () => ({status: 'ok'}));

  fastify.get('/readyz', async (_req, reply) => {
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
    void reply.status(ok ? 200 : 503);
    return {status: ok ? 'ok' : 'degraded', checks};
  });
};
