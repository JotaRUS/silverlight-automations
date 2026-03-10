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

export interface LeadExplorerResponse {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  statusCounts: Record<string, number>;
  leads: Record<string, unknown>[];
}

export async function fetchLeadExplorer(params?: {
  projectId?: string;
  status?: string;
  enrichmentStatus?: string;
  cooldownBlocked?: 'true' | 'false';
  page?: number;
  pageSize?: number;
}): Promise<LeadExplorerResponse> {
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
  if (params?.page) {
    query.set('page', String(params.page));
  }
  if (params?.pageSize) {
    query.set('pageSize', String(params.pageSize));
  }
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return apiRequest<LeadExplorerResponse>(`/api/v1/admin/leads${suffix}`);
}

export async function fetchOutreachThreads(projectId?: string): Promise<Record<string, unknown>[]> {
  const suffix = projectId ? `?projectId=${projectId}` : '';
  return apiRequest<Record<string, unknown>[]>(`/api/v1/admin/outreach/threads${suffix}`);
}

export async function fetchScreeningResponses(
  projectId?: string,
  status?: string
): Promise<Record<string, unknown>[]> {
  const query = new URLSearchParams();
  if (projectId) query.set('projectId', projectId);
  if (status) query.set('status', status);
  const suffix = query.toString() ? `?${query.toString()}` : '';
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

export async function updateLead(
  leadId: string,
  data: { status?: string; fullName?: string; jobTitle?: string; linkedinUrl?: string }
): Promise<Record<string, unknown>> {
  return apiRequest<Record<string, unknown>>(`/api/v1/admin/leads/${leadId}`, {
    method: 'PATCH',
    body: data
  });
}

export async function deleteLead(leadId: string): Promise<void> {
  await apiRequest(`/api/v1/admin/leads/${leadId}`, { method: 'DELETE' });
}

export async function updateOutreachThread(
  threadId: string,
  data: { status: string }
): Promise<Record<string, unknown>> {
  return apiRequest<Record<string, unknown>>(`/api/v1/admin/outreach/threads/${threadId}`, {
    method: 'PATCH',
    body: data
  });
}

export async function updateScreeningResponse(
  responseId: string,
  data: { status?: string; responseText?: string }
): Promise<Record<string, unknown>> {
  return apiRequest<Record<string, unknown>>(`/api/v1/admin/screening/${responseId}`, {
    method: 'PATCH',
    body: data
  });
}

export async function dispatchScreening(data: {
  projectId: string;
  expertId: string;
}): Promise<{ sent: number }> {
  return apiRequest<{ sent: number }>('/api/v1/screening/dispatch', {
    method: 'POST',
    body: data
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
