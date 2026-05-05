import type {FastifyPluginAsync} from 'fastify';

export const healthRoutes: FastifyPluginAsync = async fastify => {
  fastify.get('/', async () => ({status: 'ok', uptime: process.uptime()}));
};
