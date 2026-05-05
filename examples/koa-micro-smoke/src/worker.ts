import {Worker} from 'bullmq';
import {logger} from './logger';
import {connection, exampleQueue} from './queues/index';

const worker = new Worker(
  exampleQueue.name,
  async job => {
    logger.info({id: job.id, name: job.name}, 'processing job');
    await new Promise<void>(resolve => setTimeout(resolve, 100));
    logger.info({id: job.id}, 'job done');
  },
  {connection}
);

worker.on('failed', (job, err) => {
  logger.error({id: job?.id, err}, 'job failed');
});

logger.info('worker started');

const shutdown = (signal: string): void => {
  logger.info({signal}, 'worker shutting down');
  void worker
    .close()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
