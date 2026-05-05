import Router from '@koa/router';

export const healthRouter = new Router();

healthRouter.get('/', ctx => {
  ctx.body = {status: 'ok', uptime: process.uptime()};
});
