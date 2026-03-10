import { z } from 'zod';

import { DEFAULT_PLATFORM_API_KEY_SCOPES, type PlatformApiKeyScope } from '../../core/auth/apiKeys';

const apiKeyScopeValues = [
  'read:projects',
  'read:leads',
  'write:projects',
  'write:leads',
  'admin:providers'
] as const satisfies PlatformApiKeyScope[];

export const apiKeyScopeSchema = z.enum(apiKeyScopeValues);

export const apiKeyCreateSchema = z.object({
  name: z.string().min(1).max(120),
  scopes: z.array(apiKeyScopeSchema).min(1).optional().default(DEFAULT_PLATFORM_API_KEY_SCOPES),
  expiresAt: z.string().datetime().optional().nullable()
});

export const apiKeyPathParamsSchema = z.object({
  apiKeyId: z.string().uuid()
});
