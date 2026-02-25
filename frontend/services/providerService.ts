import type { ProviderAccount, ProviderType } from '@/types/provider';

import { apiRequest } from './apiClient';

export async function listProviderAccounts(filters?: {
  providerType?: ProviderType;
  isActive?: boolean;
}): Promise<ProviderAccount[]> {
  const params = new URLSearchParams();
  if (filters?.providerType) {
    params.set('providerType', filters.providerType);
  }
  if (filters?.isActive !== undefined) {
    params.set('isActive', String(filters.isActive));
  }
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return apiRequest<ProviderAccount[]>(`/api/v1/providers${suffix}`);
}

export async function createProviderAccount(payload: {
  providerType: ProviderType;
  accountLabel: string;
  credentials: Record<string, unknown>;
  isActive?: boolean;
  rateLimitConfig?: Record<string, unknown>;
}): Promise<ProviderAccount> {
  return apiRequest<ProviderAccount>('/api/v1/providers', {
    method: 'POST',
    body: payload
  });
}

export async function updateProviderAccount(
  providerAccountId: string,
  payload: Partial<{
    accountLabel: string;
    credentials: Record<string, unknown>;
    isActive: boolean;
    rateLimitConfig: Record<string, unknown>;
  }>
): Promise<ProviderAccount> {
  return apiRequest<ProviderAccount>(`/api/v1/providers/${providerAccountId}`, {
    method: 'PATCH',
    body: payload
  });
}

export async function testProviderConnection(providerAccountId: string): Promise<ProviderAccount> {
  return apiRequest<ProviderAccount>(`/api/v1/providers/${providerAccountId}/test-connection`, {
    method: 'POST'
  });
}

export async function bindProviderToProject(providerAccountId: string, projectId: string): Promise<void> {
  await apiRequest(`/api/v1/providers/${providerAccountId}/bind-project`, {
    method: 'POST',
    body: {
      projectId
    }
  });
}
