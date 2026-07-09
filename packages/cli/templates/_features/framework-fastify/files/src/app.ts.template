import compress from '@fastify/compress';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import Fastify, {type FastifyInstance} from 'fastify';
// lhx:feature-imports
import {env} from './env';
import {errorHandler} from './middlewares/error';
import {registerRoutes} from './routes/index';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      ...(env.NODE_ENV === 'development'
        ? {transport: {target: 'pino-pretty', options: {colorize: true}}}
        : {})
    }
  });

  app.setErrorHandler(errorHandler);

  await app.register(helmet);
  await app.register(cors);
  await app.register(compress);
  await app.register(sensible);
  await registerRoutes(app);
  // lhx:feature-routes

  return app;
}
