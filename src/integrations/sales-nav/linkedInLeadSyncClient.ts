import { logger } from '../../core/logging/logger';
import { AppError } from '../../core/errors/appError';

const LINKEDIN_REST_BASE = 'https://api.linkedin.com/rest';

const LINKEDIN_VERSIONED_HEADERS: Record<string, string> = {
  'Linkedin-Version': '202602',
  'X-Restli-Protocol-Version': '2.0.0'
};

function buildOrgOwnerUrn(organizationId: string): string {
  return `urn:li:organization:${organizationId}`;
}

function authHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    ...LINKEDIN_VERSIONED_HEADERS
  };
}

async function linkedInRequest<T>(
  method: string,
  url: string,
  token: string,
  body?: unknown
): Promise<T> {
  const headers: Record<string, string> = {
    ...authHeaders(token),
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
  };

  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  const text = await response.text().catch(() => '');

  if (!response.ok) {
    logger.warn(
      { url, method, statusCode: response.status, responseSnippet: text.slice(0, 500) },
      'linkedin-lead-sync-api-error'
    );
    throw new AppError(
      `LinkedIn API request failed (HTTP ${String(response.status)})`,
      response.status >= 500 ? 502 : response.status,
      'linkedin_api_error',
      { statusCode: response.status, responseSnippet: text.slice(0, 500) }
    );
  }

  if (response.status === 204 || text.length === 0) {
    return {} as T;
  }

  return JSON.parse(text) as T;
}

// ---------------------------------------------------------------------------
// Lead Forms
// ---------------------------------------------------------------------------

export interface LinkedInLeadFormQuestion {
  questionId: number;
  name: string;
  predefinedField?: string;
  question?: { localized?: Record<string, string> };
  questionDetails?: unknown;
  responseRequired?: boolean;
}

export interface LinkedInLeadForm {
  id: number;
  name: string;
  state: string;
  created: number;
  lastModified: number;
  content?: {
    questions?: LinkedInLeadFormQuestion[];
  };
  owner?: unknown;
}

interface LinkedInPaginatedResponse<T> {
  elements: T[];
  paging?: { start: number; count: number; total?: number };
}

export async function listLeadForms(
  token: string,
  organizationId: string,
  options?: { start?: number; count?: number }
): Promise<LinkedInPaginatedResponse<LinkedInLeadForm>> {
  const ownerParam = `(organization:${encodeURIComponent(buildOrgOwnerUrn(organizationId))})`;
  const params = new URLSearchParams({ q: 'owner', owner: ownerParam });
  if (options?.start !== undefined) params.set('start', String(options.start));
  if (options?.count !== undefined) params.set('count', String(options.count));

  return linkedInRequest<LinkedInPaginatedResponse<LinkedInLeadForm>>(
    'GET',
    `${LINKEDIN_REST_BASE}/leadForms?${params.toString()}`,
    token
  );
}

export async function getLeadForm(
  token: string,
  formId: string
): Promise<LinkedInLeadForm> {
  return linkedInRequest<LinkedInLeadForm>(
    'GET',
    `${LINKEDIN_REST_BASE}/leadForms/${formId}`,
    token
  );
}

// ---------------------------------------------------------------------------
// Lead Form Responses
// ---------------------------------------------------------------------------

export interface LinkedInAnswerDetails {
  textQuestionAnswer?: { answer: string };
  multipleChoiceAnswer?: { options: number[] };
}

export interface LinkedInFormResponseAnswer {
  questionId: number;
  name?: string;
  answerDetails?: LinkedInAnswerDetails;
}

export interface LinkedInLeadFormResponse {
  id: string;
  leadType: string;
  owner?: unknown;
  submitter?: string;
  submittedAt: number;
  testLead: boolean;
  versionedLeadGenFormUrn?: string;
  formResponse: {
    answers: LinkedInFormResponseAnswer[];
    consentResponses?: { consentId: number; accepted: boolean }[];
  };
  leadMetadata?: unknown;
  associatedEntity?: unknown;
}

export async function getLeadFormResponse(
  token: string,
  responseId: string
): Promise<LinkedInLeadFormResponse> {
  return linkedInRequest<LinkedInLeadFormResponse>(
    'GET',
    `${LINKEDIN_REST_BASE}/leadFormResponses/${encodeURIComponent(responseId)}`,
    token
  );
}

export async function listLeadFormResponses(
  token: string,
  organizationId: string,
  leadType: string,
  timeRange?: { start: number; end: number },
  options?: { start?: number; count?: number }
): Promise<LinkedInPaginatedResponse<LinkedInLeadFormResponse>> {
  const ownerParam = `(organization:${encodeURIComponent(buildOrgOwnerUrn(organizationId))})`;
  const leadTypeParam = `(leadType:${leadType})`;
  const params = new URLSearchParams({
    q: 'owner',
    owner: ownerParam,
    leadType: leadTypeParam,
    limitedToTestLeads: 'false'
  });
  if (timeRange) {
    params.set('submittedAtTimeRange', `(start:${String(timeRange.start)},end:${String(timeRange.end)})`);
  }
  if (options?.start !== undefined) params.set('start', String(options.start));
  if (options?.count !== undefined) params.set('count', String(options.count));

  return linkedInRequest<LinkedInPaginatedResponse<LinkedInLeadFormResponse>>(
    'GET',
    `${LINKEDIN_REST_BASE}/leadFormResponses?${params.toString()}`,
    token
  );
}

// ---------------------------------------------------------------------------
// Lead Notifications (webhook subscriptions)
// ---------------------------------------------------------------------------

export interface LinkedInLeadNotification {
  id: number;
  webhook: string;
  leadType: string;
  owner?: unknown;
  versionedForm?: string;
  associatedEntity?: unknown;
}

export async function createLeadNotification(
  token: string,
  webhook: string,
  organizationId: string,
  leadType: string
): Promise<LinkedInLeadNotification> {
  return linkedInRequest<LinkedInLeadNotification>(
    'POST',
    `${LINKEDIN_REST_BASE}/leadNotifications`,
    token,
    {
      webhook,
      owner: { organization: buildOrgOwnerUrn(organizationId) },
      leadType
    }
  );
}

export async function listLeadNotifications(
  token: string,
  organizationId: string,
  leadType: string
): Promise<LinkedInPaginatedResponse<LinkedInLeadNotification>> {
  const ownerParam = `(value:(organization:${encodeURIComponent(buildOrgOwnerUrn(organizationId))}))`;
  const leadTypeParam = `(leadType:${leadType})`;
  const params = new URLSearchParams({
    q: 'criteria',
    owner: ownerParam,
    leadType: leadTypeParam
  });

  return linkedInRequest<LinkedInPaginatedResponse<LinkedInLeadNotification>>(
    'GET',
    `${LINKEDIN_REST_BASE}/leadNotifications?${params.toString()}`,
    token
  );
}

export async function deleteLeadNotification(
  token: string,
  subscriptionId: string
): Promise<void> {
  await linkedInRequest<Record<string, never>>(
    'DELETE',
    `${LINKEDIN_REST_BASE}/leadNotifications/${subscriptionId}`,
    token
  );
}
