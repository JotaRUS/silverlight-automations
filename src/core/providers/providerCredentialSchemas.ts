import { z } from 'zod';

import type { ProviderType } from './providerTypes';
import { AppError } from '../errors/appError';

const singleApiKeySchema = z.object({
  apiKey: z.string().min(1)
});

const salesNavCredentialSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1)
});

const twilioCredentialSchema = z.object({
  accountSid: z.string().min(1),
  authToken: z.string().min(1)
});

const telegramCredentialSchema = z.object({
  botToken: z.string().min(1)
});

const yayCredentialSchema = z.object({
  apiKey: z.string().min(1),
  webhookSecret: z.string().min(1)
});

const googleSheetsCredentialSchema = z.object({
  spreadsheetId: z.string().min(1),
  serviceAccountJson: z
    .union([z.string().min(1), z.record(z.unknown())])
    .transform((value) => (typeof value === 'string' ? value : JSON.stringify(value)))
});

const providerCredentialParsers: Record<ProviderType, z.ZodType<Record<string, unknown>>> = {
  APOLLO: singleApiKeySchema,
  SALES_NAV_WEBHOOK: salesNavCredentialSchema,
  LEADMAGIC: singleApiKeySchema,
  PROSPEO: singleApiKeySchema,
  EXA: singleApiKeySchema,
  ROCKETREACH: singleApiKeySchema,
  WIZA: singleApiKeySchema,
  FORAGER: singleApiKeySchema,
  ZELIQ: singleApiKeySchema,
  CONTACTOUT: singleApiKeySchema,
  DATAGM: singleApiKeySchema,
  PEOPLEDATALABS: singleApiKeySchema,
  LINKEDIN: singleApiKeySchema,
  EMAIL_PROVIDER: singleApiKeySchema,
  TWILIO: twilioCredentialSchema,
  WHATSAPP_2CHAT: singleApiKeySchema,
  RESPONDIO: singleApiKeySchema,
  LINE: singleApiKeySchema,
  WECHAT: singleApiKeySchema,
  VIBER: singleApiKeySchema,
  TELEGRAM: telegramCredentialSchema,
  KAKAOTALK: singleApiKeySchema,
  VOICEMAIL_DROP: singleApiKeySchema,
  YAY: yayCredentialSchema,
  GOOGLE_SHEETS: googleSheetsCredentialSchema
};

export function parseProviderCredentials(
  providerType: ProviderType,
  credentials: Record<string, unknown>
): Record<string, unknown> {
  const parser = providerCredentialParsers[providerType];
  const parsed = parser.safeParse(credentials);
  if (!parsed.success) {
    throw new AppError('Invalid provider account credentials', 400, 'provider_credentials_invalid', {
      providerType,
      validationErrors: parsed.error.flatten()
    });
  }

  return parsed.data;
}

