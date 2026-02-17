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

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_CLASSIFICATION_TEMPERATURE: z.coerce.number().min(0).max(0.2).default(0.2),

  APOLLO_API_KEY: z.string().optional(),

  LEADMAGIC_API_KEY: z.string().optional(),
  PROSPEO_API_KEY: z.string().optional(),
  EXA_API_KEY: z.string().optional(),
  ROCKETREACH_API_KEY: z.string().optional(),
  WIZA_API_KEY: z.string().optional(),
  FORAGER_API_KEY: z.string().optional(),
  ZELIQ_API_KEY: z.string().optional(),
  CONTACTOUT_API_KEY: z.string().optional(),
  DATAGM_API_KEY: z.string().optional(),
  PEOPLEDATALABS_API_KEY: z.string().optional(),

  LINKEDIN_API_KEY: z.string().optional(),
  EMAIL_PROVIDER_API_KEY: z.string().optional(),
  TWILIO_API_KEY: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  WHATSAPP_2CHAT_API_KEY: z.string().optional(),
  RESPONDIO_API_KEY: z.string().optional(),
  LINE_API_KEY: z.string().optional(),
  WECHAT_API_KEY: z.string().optional(),
  VIBER_API_KEY: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  KAKAOTALK_API_KEY: z.string().optional(),
  VOICEMAIL_DROP_API_KEY: z.string().optional(),

  YAY_WEBHOOK_SECRET: z.string().optional(),
  YAY_API_KEY: z.string().optional(),

  GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON: z.string().optional(),
  GOOGLE_SHEETS_SPREADSHEET_ID: z.string().optional()
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
