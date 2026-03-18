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

export async function deleteProviderAccount(
  providerAccountId: string
): Promise<{ id: string; deletedAt: string }> {
  return apiRequest<{ id: string; deletedAt: string }>(`/api/v1/providers/${providerAccountId}`, {
    method: 'DELETE'
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

// ---------------------------------------------------------------------------
// LinkedIn OAuth
// ---------------------------------------------------------------------------

export interface LinkedInOAuthStatus {
  status: 'not_connected' | 'connected' | 'expired';
  accessTokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
  scope: string | null;
  linkedInSessionCookie?: boolean;
  linkedInSessionCookieCapturedAt?: string | null;
}

export async function getLinkedInOAuthStatus(
  providerAccountId: string
): Promise<LinkedInOAuthStatus> {
  return apiRequest<LinkedInOAuthStatus>(
    `/api/v1/providers/${providerAccountId}/linkedin/oauth/status`
  );
}

export async function getLinkedInOAuthAuthorizeUrl(
  providerAccountId: string
): Promise<{ authorizationUrl: string; state: string }> {
  return apiRequest<{ authorizationUrl: string; state: string }>(
    `/api/v1/providers/${providerAccountId}/linkedin/oauth/authorize`
  );
}

export async function triggerPlaywrightOAuth(
  providerAccountId: string
): Promise<{
  connected: boolean;
  linkedInSessionCookieCaptured: boolean;
  accessTokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
}> {
  return apiRequest(
    `/api/v1/auth/linkedin/authorize?providerAccountId=${providerAccountId}&mode=playwright`
  );
}

// ---------------------------------------------------------------------------
// LinkedIn Lead Sync
// ---------------------------------------------------------------------------

export interface LeadFormSummary {
  id: string;
  name: string;
  state: string;
  created: number;
  lastModified: number;
  questionCount: number;
  questions: Array<{ name: string; predefinedField?: string }>;
}

export async function listLinkedInLeadForms(providerAccountId: string): Promise<LeadFormSummary[]> {
  return apiRequest<LeadFormSummary[]>(
    `/api/v1/providers/${providerAccountId}/linkedin/lead-forms`
  );
}

export async function updateSyncedForms(
  providerAccountId: string,
  formIds: string[]
): Promise<Record<string, unknown>> {
  return apiRequest<Record<string, unknown>>(
    `/api/v1/providers/${providerAccountId}/linkedin/synced-forms`,
    { method: 'PATCH', body: { formIds } }
  );
}

export interface WebhookSubscription {
  id: number;
  webhook: string;
  leadType: string;
}

export async function registerLinkedInWebhook(
  providerAccountId: string
): Promise<{ subscriptionId: string; webhookUrl: string }> {
  return apiRequest<{ subscriptionId: string; webhookUrl: string }>(
    `/api/v1/providers/${providerAccountId}/linkedin/webhook-subscription`,
    { method: 'POST' }
  );
}

export async function listLinkedInWebhookSubscriptions(
  providerAccountId: string
): Promise<WebhookSubscription[]> {
  return apiRequest<WebhookSubscription[]>(
    `/api/v1/providers/${providerAccountId}/linkedin/webhook-subscriptions`
  );
}

export async function deleteLinkedInWebhookSubscription(
  providerAccountId: string,
  subscriptionId: string
): Promise<void> {
  await apiRequest(
    `/api/v1/providers/${providerAccountId}/linkedin/webhook-subscriptions/${subscriptionId}`,
    { method: 'DELETE' }
  );
}
