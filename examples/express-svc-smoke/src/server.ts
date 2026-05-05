import {createApp} from './app';
import {env} from './env';
import {logger} from './logger';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info({port: env.PORT}, 'service listening');
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
  // Hard timeout in case anything keeps the loop alive.
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
