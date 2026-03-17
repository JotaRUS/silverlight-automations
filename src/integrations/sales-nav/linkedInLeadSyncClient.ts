import { logger } from '../../core/logging/logger';
import { AppError } from '../../core/errors/appError';

const LINKEDIN_REST_BASE = 'https://api.linkedin.com/rest';

const LINKEDIN_VERSIONED_HEADERS: Record<string, string> = {
  'Linkedin-Version': '202602',
  'X-Restli-Protocol-Version': '2.0.0'
};

export type LinkedInOwner =
  | { type: 'organization'; id: string }
  | { type: 'sponsoredAccount'; id: string };

function buildOwnerUrn(owner: LinkedInOwner): string {
  return owner.type === 'organization'
    ? `urn:li:organization:${owner.id}`
    : `urn:li:sponsoredAccount:${owner.id}`;
}

function buildOwnerQueryParam(owner: LinkedInOwner): string {
  const urn = encodeURIComponent(buildOwnerUrn(owner));
  return `(${owner.type}:${urn})`;
}

function buildOwnerJsonPayload(owner: LinkedInOwner): Record<string, string> {
  return { [owner.type]: buildOwnerUrn(owner) };
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
  owner: LinkedInOwner,
  options?: { start?: number; count?: number }
): Promise<LinkedInPaginatedResponse<LinkedInLeadForm>> {
  const parts = [`q=owner`, `owner=${buildOwnerQueryParam(owner)}`];
  if (options?.start !== undefined) parts.push(`start=${String(options.start)}`);
  if (options?.count !== undefined) parts.push(`count=${String(options.count)}`);

  return linkedInRequest<LinkedInPaginatedResponse<LinkedInLeadForm>>(
    'GET',
    `${LINKEDIN_REST_BASE}/leadForms?${parts.join('&')}`,
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
  owner: LinkedInOwner,
  leadType: string,
  timeRange?: { start: number; end: number },
  options?: { start?: number; count?: number }
): Promise<LinkedInPaginatedResponse<LinkedInLeadFormResponse>> {
  const parts = [
    `q=owner`,
    `owner=${buildOwnerQueryParam(owner)}`,
    `leadType=(leadType:${leadType})`,
    `limitedToTestLeads=false`
  ];
  if (timeRange) {
    parts.push(`submittedAtTimeRange=(start:${String(timeRange.start)},end:${String(timeRange.end)})`);
  }
  if (options?.start !== undefined) parts.push(`start=${String(options.start)}`);
  if (options?.count !== undefined) parts.push(`count=${String(options.count)}`);

  return linkedInRequest<LinkedInPaginatedResponse<LinkedInLeadFormResponse>>(
    'GET',
    `${LINKEDIN_REST_BASE}/leadFormResponses?${parts.join('&')}`,
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
  owner: LinkedInOwner,
  leadType: string
): Promise<LinkedInLeadNotification> {
  return linkedInRequest<LinkedInLeadNotification>(
    'POST',
    `${LINKEDIN_REST_BASE}/leadNotifications`,
    token,
    {
      webhook,
      owner: buildOwnerJsonPayload(owner),
      leadType
    }
  );
}

export async function listLeadNotifications(
  token: string,
  owner: LinkedInOwner,
  leadType: string
): Promise<LinkedInPaginatedResponse<LinkedInLeadNotification>> {
  const parts = [
    `q=criteria`,
    `owner=(value:${buildOwnerQueryParam(owner)})`,
    `leadType=(leadType:${leadType})`
  ];

  return linkedInRequest<LinkedInPaginatedResponse<LinkedInLeadNotification>>(
    'GET',
    `${LINKEDIN_REST_BASE}/leadNotifications?${parts.join('&')}`,
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
