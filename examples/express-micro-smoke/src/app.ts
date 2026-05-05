import compression from 'compression';
import cors from 'cors';
import express, {type Application} from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
// lhx:feature-imports

import {logger} from './logger';
import {errorMiddleware} from './middlewares/error';
import {router} from './routes/index';

export function createApp(): Application {
  const app = express();
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(cors());
  app.use(compression());
  app.use(express.json({limit: '1mb'}));
  app.use(pinoHttp({logger}));

  app.use('/api', router);
  // lhx:feature-routes

  app.use((_req, res) => {
    res.status(404).json({error: 'not_found'});
  });

  app.use(errorMiddleware);

  return app;
}
