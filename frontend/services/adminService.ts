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
  data: { status?: string; responseText?: string; score?: number; qualified?: boolean }
): Promise<Record<string, unknown>> {
  return apiRequest<Record<string, unknown>>(`/api/v1/admin/screening/${responseId}`, {
    method: 'PATCH',
    body: data
  });
}

export async function dispatchScreening(data: {
  projectId: string;
  expertId: string;
  channel: string;
}): Promise<{ sent: number; delivered: number; deliveryErrors: number }> {
  return apiRequest<{ sent: number; delivered: number; deliveryErrors: number }>('/api/v1/screening/dispatch', {
    method: 'POST',
    body: data
  });
}

export interface CallBoardExpertContact {
  id: string;
  type: 'EMAIL' | 'PHONE' | 'LINKEDIN';
  value: string;
  valueNormalized?: string | null;
  isPrimary: boolean;
}

export interface CallBoardExpert {
  id: string;
  fullName: string;
  firstName?: string | null;
  lastName?: string | null;
  currentRole?: string | null;
  currentCompany?: string | null;
  countryIso?: string | null;
  timezone?: string | null;
  languageCodes: string[];
  contacts: CallBoardExpertContact[];
}

export interface CallBoardCaller {
  id: string;
  name: string;
  email: string;
  timezone: string;
  allocationStatus: string;
  fraudStatus: string;
  regionIsoCodes: string[];
  languageCodes: string[];
}

export interface CallBoardTask {
  id: string;
  status: 'PENDING' | 'ASSIGNED' | 'DIALING';
  priorityScore: number | string;
  callerId?: string | null;
  expertId: string;
  projectId: string;
  assignedAt?: string | null;
  executionWindowStartsAt?: string | null;
  executionWindowEndsAt?: string | null;
  attemptedDialCount: number;
  createdAt: string;
  expert: CallBoardExpert;
  caller?: CallBoardCaller | null;
  project: { name: string };
}

export interface CallBoardMetric {
  id: string;
  callerId: string;
  rolling60MinuteDials: number;
  rolling60MinuteConnections: number;
  graceModeActive: boolean;
  allocationStatus: string;
  snapshotAt: string;
}

export interface CallBoardResponse {
  tasks: CallBoardTask[];
  callers: CallBoardCaller[];
  metrics: CallBoardMetric[];
}

export async function fetchCallBoard(): Promise<CallBoardResponse> {
  return apiRequest<CallBoardResponse>('/api/v1/admin/call-board');
}

export async function requeueCallTask(taskId: string, reason?: string): Promise<{ accepted: boolean }> {
  return apiRequest<{ accepted: boolean }>(`/api/v1/call-tasks/operator/tasks/${taskId}/requeue`, {
    method: 'POST',
    body: reason ? { reason } : {}
  });
}

export interface RankingExpertContact {
  id: string;
  type: 'EMAIL' | 'PHONE' | 'LINKEDIN';
  value: string;
  isPrimary: boolean;
}

export interface RankingExpert {
  id: string;
  fullName: string;
  countryIso?: string | null;
  timezone?: string | null;
  contacts: RankingExpertContact[];
}

export interface RankingProjectSummary {
  id: string;
  name: string;
  targetThreshold: number;
  signedUpCount: number;
  completionPercentage: number | string;
}

export interface RankingSnapshot {
  id: string;
  projectId: string | null;
  expertId: string | null;
  score: number | string;
  rank: number;
  reason: string;
  metadata: {
    freshReplyBoost?: boolean;
    signupChaseBoost?: boolean;
    highValueRejectionBoost?: boolean;
    completionDeficit?: number;
    completionPenalty?: number;
    tierBase?: number;
    verifiedContactCount?: number;
    callAttemptCount?: number;
    createdAt?: string;
  } | null;
  createdAt: string;
  expert: RankingExpert | null;
  project: RankingProjectSummary | null;
}

export interface RankingResponse {
  snapshots: RankingSnapshot[];
  projectSummaries: RankingProjectSummary[];
}

export async function fetchRanking(projectId?: string): Promise<RankingResponse> {
  const suffix = projectId ? `?projectId=${projectId}` : '';
  return apiRequest<RankingResponse>(`/api/v1/admin/ranking/latest${suffix}`);
}

export interface ObservabilitySummary {
  dlqCount: number;
  recentEventCount: number;
  fraudFlagCount: number;
  webhookCount: number;
}

export interface SystemEventRecord {
  id: string;
  category: string;
  entityType: string;
  entityId: string | null;
  correlationId: string | null;
  message: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export interface DlqJobRecord {
  id: string;
  queueName: string;
  jobId: string;
  payload: Record<string, unknown>;
  errorMessage: string;
  stackTrace: string | null;
  failedAt: string;
  correlationId: string | null;
}

export interface WebhookEventRecord {
  id: string;
  eventId: string;
  hash: string;
  status: string;
  processedAt: string;
}

export interface FraudCallLog {
  id: string;
  callId: string | null;
  callerId: string | null;
  duration: number | null;
  fraudFlag: boolean;
  createdAt: string;
}

export interface ObsFilterParams {
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
  search?: string;
  [key: string]: string | number | undefined;
}

function buildObsQuery(base: string, params?: ObsFilterParams): string {
  if (!params) return base;
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  if (entries.length === 0) return base;
  return `${base}?${entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')}`;
}

export async function fetchObsSummary(): Promise<ObservabilitySummary> {
  return apiRequest<ObservabilitySummary>('/api/v1/admin/observability/summary');
}

export async function fetchSystemEvents(params?: ObsFilterParams & { category?: string; entityType?: string }): Promise<{ events: SystemEventRecord[]; total: number }> {
  return apiRequest<{ events: SystemEventRecord[]; total: number }>(buildObsQuery('/api/v1/admin/observability/system-events', params));
}

export async function fetchDlq(params?: ObsFilterParams & { queueName?: string }): Promise<{ jobs: DlqJobRecord[]; total: number }> {
  return apiRequest<{ jobs: DlqJobRecord[]; total: number }>(buildObsQuery('/api/v1/admin/observability/dlq', params));
}

export async function fetchWebhookEvents(params?: ObsFilterParams & { status?: string }): Promise<{ events: WebhookEventRecord[]; total: number }> {
  return apiRequest<{ events: WebhookEventRecord[]; total: number }>(buildObsQuery('/api/v1/admin/observability/webhooks', params));
}

export async function fetchFraudEvents(params?: ObsFilterParams): Promise<{ callLogs: FraudCallLog[]; events: SystemEventRecord[]; totalLogs: number; totalEvents: number }> {
  return apiRequest<{ callLogs: FraudCallLog[]; events: SystemEventRecord[]; totalLogs: number; totalEvents: number }>(buildObsQuery('/api/v1/admin/observability/fraud', params));
}

export interface QueueStat {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export async function fetchQueueStats(): Promise<{ queues: QueueStat[] }> {
  return apiRequest<{ queues: QueueStat[] }>('/api/v1/admin/workers/queue-stats');
}

export async function bulkExportLeads(projectId?: string): Promise<{ queued: number }> {
  return apiRequest<{ queued: number }>('/api/v1/admin/workers/export-leads', {
    method: 'POST',
    body: projectId ? { projectId } : {}
  });
}

export async function bulkOutreachLeads(projectId?: string): Promise<{ queued: number }> {
  return apiRequest<{ queued: number }>('/api/v1/admin/workers/outreach-leads', {
    method: 'POST',
    body: projectId ? { projectId } : {}
  });
}
