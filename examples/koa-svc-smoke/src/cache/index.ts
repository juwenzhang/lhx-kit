import Redis from 'ioredis';
import {env} from '../env';
import {logger} from '../logger';

const MAX_RETRIES = 8;

let _connected = false;

export const cache = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 1,
  lazyConnect: false,
  enableOfflineQueue: false,
  retryStrategy(times) {
    if (times > MAX_RETRIES) return null; // give up, emit 'end'
    const delay = Math.min(times * 500, 3000);
    logger.warn(
      {attempt: times, maxRetries: MAX_RETRIES, retryIn: `${delay}ms`},
      'redis reconnecting'
    );
    return delay;
  }
});

cache.on('connect', () => {
  _connected = true;
  logger.info({url: env.REDIS_URL}, 'redis connected');
});
cache.on('ready', () => logger.info('redis ready'));
cache.on('error', (err: Error) => {
  // retryStrategy already logs reconnect warnings; only surface non-ECONNREFUSED errors
  const code = (err as NodeJS.ErrnoException).code ?? '';
  if (_connected || !['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENETUNREACH'].includes(code)) {
    logger.error({err: err.message, code}, 'redis error');
  } else if (!_connected && code === 'ECONNREFUSED') {
    // First failure only — let retryStrategy handle subsequent logging
    if ((err as NodeJS.ErrnoException & {retriesLeft?: number}).retriesLeft === undefined) {
      logger.warn({url: env.REDIS_URL}, 'redis not reachable — will retry');
    }
  }
});
cache.on('end', () => {
  logger.warn(
    {url: env.REDIS_URL, maxRetries: MAX_RETRIES},
    'redis permanently unreachable — cache disabled'
  );
});
cache.on('reconnecting', () => {
  _connected = false;
});

export async function getJSON<T>(key: string): Promise<T | null> {
  const raw = await cache.get(key);
  return raw === null ? null : (JSON.parse(raw) as T);
}

export async function setJSON(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  const payload = JSON.stringify(value);
  if (ttlSeconds && ttlSeconds > 0) {
    await cache.set(key, payload, 'EX', ttlSeconds);
    return;
  }
  await cache.set(key, payload);
}
