import {buildApp} from './app';
import {env} from './env';

async function main(): Promise<void> {
  const app = await buildApp();

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({signal}, 'shutting down');
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  await app.listen({port: env.PORT, host: '0.0.0.0'});
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
