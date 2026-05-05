import Router from '@koa/router';
import {healthRouter} from './health';

export const router = new Router();

router.use('/health', healthRouter.routes(), healthRouter.allowedMethods());
// lhx:feature-routes-register
