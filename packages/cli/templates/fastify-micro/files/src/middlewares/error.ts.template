import type {FastifyError, FastifyReply, FastifyRequest} from 'fastify';
import {logger} from '../logger';

export function errorHandler(
  error: FastifyError,
  _request: FastifyRequest,
  reply: FastifyReply
): void {
  logger.error({err: error}, 'unhandled error');
  const status = error.statusCode ?? 500;
  void reply.status(status).send({error: error.message ?? 'internal_server_error'});
}
