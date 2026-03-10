import type { ApiKeyRecord, ApiKeyScope } from '@/types/apiKey';

import { apiRequest } from './apiClient';

export async function listApiKeys(): Promise<ApiKeyRecord[]> {
  return apiRequest<ApiKeyRecord[]>('/api/v1/api-keys');
}

export async function createApiKey(payload: {
  name: string;
  scopes: ApiKeyScope[];
  expiresAt?: string | null;
}): Promise<{ apiKey: string; record: ApiKeyRecord }> {
  return apiRequest<{ apiKey: string; record: ApiKeyRecord }>('/api/v1/api-keys', {
    method: 'POST',
    body: payload
  });
}

export async function revokeApiKey(apiKeyId: string): Promise<ApiKeyRecord> {
  return apiRequest<ApiKeyRecord>(`/api/v1/api-keys/${apiKeyId}/revoke`, {
    method: 'POST'
  });
}
