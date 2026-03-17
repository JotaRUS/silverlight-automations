import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z
    .string()
    .min(1)
    .default('postgresql://postgres:postgres@localhost:5432/expert_sourcing'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  REDIS_NAMESPACE: z.string().min(1).default('local'),

  JWT_ISSUER: z.string().min(1).default('expert-sourcing-platform'),
  JWT_AUDIENCE: z.string().min(1).default('expert-sourcing-api'),
  JWT_SECRET: z.string().min(32).default('replace-with-long-test-secret-1234567890'),
  JWT_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  EXTERNAL_APP_BASE_URL: z.string().url().default('http://localhost:3000'),
  LINKEDIN_OAUTH_REDIRECT_URI: z
    .string()
    .url()
    .default('http://localhost:3000/api/v1/providers/linkedin/oauth/callback'),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_CLASSIFICATION_TEMPERATURE: z.coerce.number().min(0).max(0.2).default(0.2),

  PROVIDER_ENCRYPTION_SECRET: z.string().min(32).default('replace-with-provider-encryption-secret-1234567890')
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
