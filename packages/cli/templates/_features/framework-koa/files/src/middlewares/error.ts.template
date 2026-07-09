import type {Context, Next} from 'koa';
import {logger} from '../logger';

export async function errorMiddleware(ctx: Context, next: Next): Promise<void> {
  try {
    await next();
  } catch (err) {
    logger.error({err}, 'unhandled error');
    const status = (err as {status?: number}).status ?? 500;
    const message = (err as {message?: string}).message ?? 'internal_server_error';
    ctx.status = status;
    ctx.body = {error: message};
  }
}
