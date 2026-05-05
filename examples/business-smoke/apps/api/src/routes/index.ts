import {Router} from 'express';
import {healthRouter} from './health';

export const router = Router();

router.use('/healthz', healthRouter);
