import Router from '@koa/router';
import {healthRouter} from './health';

export const router = new Router();

router.use('/healthz', healthRouter.routes(), healthRouter.allowedMethods());
// lhx:feature-routes-register
