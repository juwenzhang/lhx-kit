import {z} from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  // lhx:env-schema
  DATABASE_URL: z.string().url()
});

export const env = EnvSchema.parse(process.env);
export type Env = z.infer<typeof EnvSchema>;
