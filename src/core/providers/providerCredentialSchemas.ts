import { z } from 'zod';

import type { ProviderType } from './providerTypes';
import { AppError } from '../errors/appError';

const singleApiKeySchema = z.object({
  apiKey: z.string().min(1)
});

const salesNavCredentialSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  organizationId: z.string().min(1),
  sponsoredAccountId: z.string().min(1).optional(),
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

const emailProviderCredentialSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().positive().default(587),
  user: z.string().min(1),
  pass: z.string().min(1),
  from: z.string().min(1).optional(),
  inboundParseVerificationKey: z.string().min(1).optional()
});

const twilioCredentialSchema = z.object({
  accountSid: z.string().min(1),
  authToken: z.string().min(1),
  fromNumber: z.string().min(1)
});

const voicemailDropCredentialSchema = z.object({
  accountSid: z.string().min(1),
  authToken: z.string().min(1),
  fromNumber: z.string().min(1)
});

const telegramCredentialSchema = z.object({
  botToken: z.string().min(1),
  webhookSecretToken: z.string().min(1).optional()
});

const yayCredentialSchema = z.object({
  apiKey: z.string().min(1),
  webhookSecret: z.string().min(1)
});

const foragerCredentialSchema = z.object({
  apiKey: z.string().min(1),
  accountId: z.string().min(1)
});

const googleSheetsCredentialSchema = z.object({
  spreadsheetId: z.string().min(1),
  serviceAccountJson: z
    .union([z.string().min(1), z.record(z.unknown())])
    .transform((value) => (typeof value === 'string' ? value : JSON.stringify(value)))
});

const supabaseCredentialSchema = z.object({
  projectUrl: z.string().url(),
  serviceRoleKey: z.string().min(1),
  schema: z.string().min(1).default('public'),
  tableName: z.string().min(1),
  columnFullName: z.string().min(1).optional(),
  columnEmail: z.string().min(1).optional(),
  columnPhone: z.string().min(1).optional(),
  columnCountry: z.string().min(1).optional(),
  columnCurrentCompany: z.string().min(1).optional(),
  columnLinkedinUrl: z.string().min(1).optional(),
  columnJobTitle: z.string().min(1).optional()
});

const providerCredentialParsers: Record<ProviderType, z.ZodType<Record<string, unknown>>> = {
  APOLLO: singleApiKeySchema,
  SALES_NAV_WEBHOOK: salesNavCredentialSchema,
  LEADMAGIC: singleApiKeySchema,
  PROSPEO: singleApiKeySchema,
  EXA: singleApiKeySchema,
  ROCKETREACH: singleApiKeySchema,
  WIZA: singleApiKeySchema,
  FORAGER: foragerCredentialSchema,
  ZELIQ: singleApiKeySchema,
  CONTACTOUT: singleApiKeySchema,
  DATAGM: singleApiKeySchema,
  PEOPLEDATALABS: singleApiKeySchema,
  ANYLEADS: singleApiKeySchema,
  LINKEDIN: linkedinCredentialSchema,
  EMAIL_PROVIDER: emailProviderCredentialSchema,
  TWILIO: twilioCredentialSchema,
  WHATSAPP_2CHAT: z.object({ apiKey: z.string().min(1), fromNumber: z.string().min(1), webhookSecret: z.string().min(1).optional() }),
  RESPONDIO: singleApiKeySchema,
  LINE: z.object({ apiKey: z.string().min(1), channelSecret: z.string().min(1).optional() }),
  WECHAT: z.object({ apiKey: z.string().min(1), verifyToken: z.string().min(1).optional() }),
  VIBER: z.object({ apiKey: z.string().min(1), senderName: z.string().min(1).max(28) }),
  TELEGRAM: telegramCredentialSchema,
  KAKAOTALK: singleApiKeySchema,
  VOICEMAIL_DROP: voicemailDropCredentialSchema,
  YAY: yayCredentialSchema,
  GOOGLE_SHEETS: googleSheetsCredentialSchema,
  SUPABASE: supabaseCredentialSchema
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

