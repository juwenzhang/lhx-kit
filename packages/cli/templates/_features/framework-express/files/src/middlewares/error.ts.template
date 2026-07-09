import type {ErrorRequestHandler} from 'express';
import {logger} from '../logger';

export const errorMiddleware: ErrorRequestHandler = (err, _req, res, _next) => {
  logger.error({err}, 'unhandled error');
  const status: number = (err as {status?: number}).status ?? 500;
  const message: string = (err as {message?: string}).message ?? 'internal_server_error';
  res.status(status).json({error: message});
};
