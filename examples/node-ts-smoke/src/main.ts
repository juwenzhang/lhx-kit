import {logger} from './logger.js';

async function main(): Promise<void> {
  logger.info('node-ts-smoke starting');

  // Your application logic goes here.

  logger.info('ready');
}

const shutdown = (signal: string): void => {
  logger.info({signal}, 'shutting down');
  // Release resources (db pool, timers, …) before exiting.
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main().catch(err => {
  logger.error({err}, 'fatal error');
  process.exit(1);
});
