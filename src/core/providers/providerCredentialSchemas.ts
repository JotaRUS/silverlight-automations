import { z } from 'zod';

import type { ProviderType } from './providerTypes';
import { AppError } from '../errors/appError';

const singleApiKeySchema = z.object({
  apiKey: z.string().min(1)
});

const salesNavCredentialSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  oauthAccessToken: z.string().min(1).optional(),
  oauthRefreshToken: z.string().min(1).optional(),
  oauthAccessTokenExpiresAt: z.string().datetime().optional(),
  oauthRefreshTokenExpiresAt: z.string().datetime().optional(),
  oauthScope: z.string().min(1).optional()
});

const linkedinCredentialSchema = z
  .object({
    apiKey: z.string().min(1).optional(),
    clientId: z.string().min(1).optional(),
    clientSecret: z.string().min(1).optional(),
    oauthAccessToken: z.string().min(1).optional(),
    oauthRefreshToken: z.string().min(1).optional(),
    oauthAccessTokenExpiresAt: z.string().datetime().optional(),
    oauthRefreshTokenExpiresAt: z.string().datetime().optional(),
    oauthScope: z.string().min(1).optional()
  })
  .refine(
    (credentials) =>
      (typeof credentials.apiKey === 'string' && credentials.apiKey.length > 0) ||
      (typeof credentials.clientId === 'string' &&
        credentials.clientId.length > 0 &&
        typeof credentials.clientSecret === 'string' &&
        credentials.clientSecret.length > 0),
    {
      message: 'Provide either apiKey or clientId + clientSecret'
    }
  )
  .transform((credentials) => {
    if (
      typeof credentials.clientId === 'string' &&
      credentials.clientId.length > 0 &&
      typeof credentials.clientSecret === 'string' &&
      credentials.clientSecret.length > 0
    ) {
      return {
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
        oauthAccessToken: credentials.oauthAccessToken,
        oauthRefreshToken: credentials.oauthRefreshToken,
        oauthAccessTokenExpiresAt: credentials.oauthAccessTokenExpiresAt,
        oauthRefreshTokenExpiresAt: credentials.oauthRefreshTokenExpiresAt,
        oauthScope: credentials.oauthScope
      };
    }

    return {
      apiKey: credentials.apiKey ?? ''
    };
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
  LINKEDIN: linkedinCredentialSchema,
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

