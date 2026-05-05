import {createApp} from './app';
import {env} from './env';
import {logger} from './logger';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info({port: env.PORT}, 'api listening');
});

const shutdown = (signal: string): void => {
  logger.info({signal}, 'shutting down');
  server.close(err => {
    if (err) {
      logger.error({err}, 'server.close failed');
      process.exit(1);
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
