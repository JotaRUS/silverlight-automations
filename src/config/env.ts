import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

// Prefer values from `.env` over pre-set process.env (PM2/systemd/shell may export empty or stale JWT_*).
loadEnv({ override: true });

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
  /**
   * Public origin of the app (admin UI / API as users hit it in the browser).
   * Used to derive the Sales Navigator LinkedIn OAuth callback when `LINKEDIN_OAUTH_REDIRECT_URI` is unset.
   */
  EXTERNAL_APP_BASE_URL: z.string().url().default('http://localhost:3000'),
  /**
   * Exact redirect URI registered in LinkedIn → Auth → Authorized redirect URLs.
   * Must match the URL that serves GET /api/v1/providers/linkedin/oauth/callback.
   * If omitted, defaults to `${EXTERNAL_APP_BASE_URL}/api/v1/providers/linkedin/oauth/callback`.
   */
  LINKEDIN_OAUTH_REDIRECT_URI: z.string().url().optional(),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_CLASSIFICATION_TEMPERATURE: z.coerce.number().min(0).max(0.2).default(0.2),

  ENABLE_APOLLO_SOURCING: z
    .enum(['true', 'false', '1', '0'])
    .default('false')
    .transform((v) => v === 'true' || v === '1'),

  PROVIDER_ENCRYPTION_SECRET: z.string().min(32).default('replace-with-provider-encryption-secret-1234567890')
});

type ParsedEnv = z.infer<typeof envSchema>;
export type Env = Omit<ParsedEnv, 'LINKEDIN_OAUTH_REDIRECT_URI'> & {
  LINKEDIN_OAUTH_REDIRECT_URI: string;
};

function buildEnv(): Env {
  const parsed = envSchema.parse(process.env);
  const linkedInOAuthRedirectUri =
    parsed.LINKEDIN_OAUTH_REDIRECT_URI ??
    new URL('/api/v1/providers/linkedin/oauth/callback', parsed.EXTERNAL_APP_BASE_URL).href;
  return { ...parsed, LINKEDIN_OAUTH_REDIRECT_URI: linkedInOAuthRedirectUri };
}

export const env: Env = buildEnv();
