import pg from 'pg';
import {env} from '../env';
import {logger} from '../logger';

const {Pool} = pg;

export const db = new Pool({connectionString: env.DATABASE_URL});

db.on('error', err => {
  logger.error({err}, 'pg pool error');
});

export async function ping(): Promise<boolean> {
  const result = await db.query('SELECT 1 as ok');
  return result.rows[0]?.ok === 1;
}
