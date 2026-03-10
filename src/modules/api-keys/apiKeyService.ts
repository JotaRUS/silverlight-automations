import type { PrismaClient } from '@prisma/client';

import { AppError } from '../../core/errors/appError';
import {
  DEFAULT_PLATFORM_API_KEY_SCOPES,
  fromDbApiKeyScopes,
  generatePlatformApiKey,
  toDbApiKeyScopes,
  type PlatformApiKeyScope
} from '../../core/auth/apiKeys';

export interface ApiKeyView {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: PlatformApiKeyScope[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiKeyCreateInput {
  name: string;
  scopes?: PlatformApiKeyScope[];
  expiresAt?: string | null;
}

function toView(apiKey: {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: import('@prisma/client').ApiKeyScope[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): ApiKeyView {
  return {
    id: apiKey.id,
    name: apiKey.name,
    keyPrefix: apiKey.keyPrefix,
    scopes: fromDbApiKeyScopes(apiKey.scopes),
    lastUsedAt: apiKey.lastUsedAt,
    expiresAt: apiKey.expiresAt,
    revokedAt: apiKey.revokedAt,
    createdAt: apiKey.createdAt,
    updatedAt: apiKey.updatedAt
  };
}

export class ApiKeyService {
  public constructor(private readonly prismaClient: PrismaClient) {}

  public async listForCaller(callerId: string): Promise<ApiKeyView[]> {
    const apiKeys = await this.prismaClient.apiKey.findMany({
      where: { callerId },
      orderBy: [{ revokedAt: 'asc' }, { createdAt: 'desc' }]
    });

    return apiKeys.map(toView);
  }

  public async createForCaller(
    callerId: string,
    input: ApiKeyCreateInput
  ): Promise<{ apiKey: string; record: ApiKeyView }> {
    const caller = await this.prismaClient.caller.findUnique({
      where: { id: callerId },
      select: { id: true, deletedAt: true }
    });
    if (!caller || caller.deletedAt) {
      throw new AppError('User not found', 404, 'user_not_found');
    }

    const { rawKey, keyHash, keyPrefix } = generatePlatformApiKey();
    const scopes = input.scopes?.length ? input.scopes : DEFAULT_PLATFORM_API_KEY_SCOPES;

    const created = await this.prismaClient.apiKey.create({
      data: {
        callerId,
        name: input.name,
        keyPrefix,
        keyHash,
        scopes: toDbApiKeyScopes(scopes),
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null
      }
    });

    return {
      apiKey: rawKey,
      record: toView(created)
    };
  }

  public async revokeForCaller(callerId: string, apiKeyId: string): Promise<ApiKeyView> {
    const existing = await this.prismaClient.apiKey.findFirst({
      where: { id: apiKeyId, callerId }
    });
    if (!existing) {
      throw new AppError('API key not found', 404, 'api_key_not_found', { apiKeyId });
    }

    const revoked = await this.prismaClient.apiKey.update({
      where: { id: apiKeyId },
      data: {
        revokedAt: existing.revokedAt ?? new Date()
      }
    });

    return toView(revoked);
  }
}
