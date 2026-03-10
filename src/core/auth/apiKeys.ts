import { createHash, randomBytes } from 'node:crypto';

import type { ApiKeyScope } from '@prisma/client';

export const API_KEY_SCOPE_LABELS = {
  'read:projects': 'READ_PROJECTS',
  'read:leads': 'READ_LEADS',
  'write:projects': 'WRITE_PROJECTS',
  'write:leads': 'WRITE_LEADS',
  'admin:providers': 'ADMIN_PROVIDERS'
} as const satisfies Record<string, ApiKeyScope>;

export type PlatformApiKeyScope = keyof typeof API_KEY_SCOPE_LABELS;

const DB_TO_PLATFORM_SCOPE = Object.fromEntries(
  Object.entries(API_KEY_SCOPE_LABELS).map(([label, dbValue]) => [dbValue, label])
) as Record<ApiKeyScope, PlatformApiKeyScope>;

export const DEFAULT_PLATFORM_API_KEY_SCOPES: PlatformApiKeyScope[] = [
  'read:projects',
  'read:leads',
  'write:projects',
  'write:leads'
];

export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

export function generatePlatformApiKey(): {
  rawKey: string;
  keyPrefix: string;
  keyHash: string;
} {
  const publicId = randomBytes(6).toString('hex');
  const secret = randomBytes(24).toString('hex');
  const keyPrefix = `slk_${publicId}`;
  const rawKey = `${keyPrefix}.${secret}`;

  return {
    rawKey,
    keyPrefix,
    keyHash: hashApiKey(rawKey)
  };
}

export function toDbApiKeyScopes(scopes: PlatformApiKeyScope[]): ApiKeyScope[] {
  return scopes.map((scope) => API_KEY_SCOPE_LABELS[scope]);
}

export function fromDbApiKeyScopes(scopes: ApiKeyScope[]): PlatformApiKeyScope[] {
  return scopes.map((scope) => DB_TO_PLATFORM_SCOPE[scope]);
}
