import {Queue} from 'bullmq';
import Redis from 'ioredis';
import {env} from '../env';

export const connection = new Redis(env.REDIS_URL, {maxRetriesPerRequest: null});

export const exampleQueue = new Queue('example', {connection});
