import { apiRequest } from './apiClient';

export interface DashboardStats {
  projectCount: number;
  projectTrend: string | null;
  callerCount: number;
  callerTrend: string | null;
  activeTaskCount: number;
  systemHealth: 'healthy' | 'degraded' | 'down';
  recentEvents: {
    id: string;
    category: string;
    entityType: string;
    entityId: string | null;
    message: string;
    payload: Record<string, unknown> | null;
    createdAt: string;
  }[];
  hourlyTasks: { hour: string; count: number }[];
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  return apiRequest<DashboardStats>('/api/v1/admin/dashboard-stats');
}

export async function fetchLeadExplorer(params?: {
  projectId?: string;
  status?: string;
  enrichmentStatus?: string;
  cooldownBlocked?: 'true' | 'false';
}): Promise<{ total: number; leads: Record<string, unknown>[] }> {
  const query = new URLSearchParams();
  if (params?.projectId) {
    query.set('projectId', params.projectId);
  }
  if (params?.status) {
    query.set('status', params.status);
  }
  if (params?.enrichmentStatus) {
    query.set('enrichmentStatus', params.enrichmentStatus);
  }
  if (params?.cooldownBlocked) {
    query.set('cooldownBlocked', params.cooldownBlocked);
  }
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return apiRequest<{ total: number; leads: Record<string, unknown>[] }>(`/api/v1/admin/leads${suffix}`);
}

export async function fetchOutreachThreads(projectId?: string): Promise<Record<string, unknown>[]> {
  const suffix = projectId ? `?projectId=${projectId}` : '';
  return apiRequest<Record<string, unknown>[]>(`/api/v1/admin/outreach/threads${suffix}`);
}

export async function fetchScreeningResponses(projectId?: string): Promise<Record<string, unknown>[]> {
  const suffix = projectId ? `?projectId=${projectId}` : '';
  return apiRequest<Record<string, unknown>[]>(`/api/v1/admin/screening/responses${suffix}`);
}

export async function triggerScreeningFollowUp(responseId: string): Promise<void> {
  await apiRequest(`/api/v1/admin/screening/${responseId}/follow-up`, {
    method: 'POST'
  });
}

export async function escalateScreening(responseId: string): Promise<void> {
  await apiRequest(`/api/v1/admin/screening/${responseId}/escalate`, {
    method: 'POST'
  });
}

export async function fetchCallBoard(): Promise<{
  tasks: Record<string, unknown>[];
  callers: Record<string, unknown>[];
  metrics: Record<string, unknown>[];
}> {
  return apiRequest<{
    tasks: Record<string, unknown>[];
    callers: Record<string, unknown>[];
    metrics: Record<string, unknown>[];
  }>('/api/v1/admin/call-board');
}

export async function fetchRanking(projectId?: string): Promise<Record<string, unknown>[]> {
  const suffix = projectId ? `?projectId=${projectId}` : '';
  return apiRequest<Record<string, unknown>[]>(`/api/v1/admin/ranking/latest${suffix}`);
}

export async function fetchDlq(): Promise<Record<string, unknown>[]> {
  return apiRequest<Record<string, unknown>[]>('/api/v1/admin/observability/dlq');
}

export async function fetchWebhookEvents(): Promise<Record<string, unknown>[]> {
  return apiRequest<Record<string, unknown>[]>('/api/v1/admin/observability/webhooks');
}

export async function fetchProviderRateLimitEvents(): Promise<Record<string, unknown>[]> {
  return apiRequest<Record<string, unknown>[]>('/api/v1/admin/observability/provider-limits');
}

export async function fetchFraudEvents(): Promise<Record<string, unknown>> {
  return apiRequest<Record<string, unknown>>('/api/v1/admin/observability/fraud');
}

export async function fetchStateViolations(): Promise<Record<string, unknown>[]> {
  return apiRequest<Record<string, unknown>[]>('/api/v1/admin/observability/state-violations');
}
