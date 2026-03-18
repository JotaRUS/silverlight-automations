import type {
  ProjectCompanyRecord,
  ProjectJobTitleRecord,
  ProjectRecord
} from '@/types/project';

import { apiRequest } from './apiClient';

export async function listProjects(): Promise<ProjectRecord[]> {
  return apiRequest<ProjectRecord[]>('/api/v1/projects');
}

export async function getProject(projectId: string): Promise<ProjectRecord> {
  return apiRequest<ProjectRecord>(`/api/v1/projects/${projectId}`);
}

export async function createProject(payload: Partial<ProjectRecord> & {
  name: string;
  targetThreshold: number;
  geographyIsoCodes: string[];
}): Promise<ProjectRecord> {
  return apiRequest<ProjectRecord>('/api/v1/projects', {
    method: 'POST',
    body: payload
  });
}

export async function updateProject(projectId: string, payload: Partial<ProjectRecord>): Promise<ProjectRecord> {
  return apiRequest<ProjectRecord>(`/api/v1/projects/${projectId}`, {
    method: 'PATCH',
    body: payload
  });
}

export async function kickProject(projectId: string): Promise<{ sourcingQueued: boolean; enrichmentQueued: number }> {
  return apiRequest<{ sourcingQueued: boolean; enrichmentQueued: number }>(
    `/api/v1/projects/${projectId}/kick`,
    { method: 'POST' }
  );
}

export async function deleteProject(projectId: string): Promise<void> {
  await apiRequest<void>(`/api/v1/projects/${projectId}`, {
    method: 'DELETE'
  });
}

export async function addSalesNavSearches(
  projectId: string,
  searches: { sourceUrl: string; normalizedUrl: string; metadata?: Record<string, unknown> }[]
): Promise<{ created: number }> {
  return apiRequest<{ created: number }>(`/api/v1/projects/${projectId}/sales-nav-searches`, {
    method: 'POST',
    body: { searches }
  });
}

export async function listProjectCompanies(projectId: string): Promise<ProjectCompanyRecord[]> {
  return apiRequest<ProjectCompanyRecord[]>(`/api/v1/projects/${projectId}/companies`);
}

export async function addProjectCompanies(
  projectId: string,
  companies: { name: string; domain?: string; countryIso?: string }[]
): Promise<{ createdOrUpdated: number }> {
  return apiRequest<{ createdOrUpdated: number }>(`/api/v1/projects/${projectId}/companies`, {
    method: 'POST',
    body: { companies }
  });
}

export async function listProjectJobTitles(projectId: string): Promise<ProjectJobTitleRecord[]> {
  return apiRequest<ProjectJobTitleRecord[]>(`/api/v1/projects/${projectId}/job-titles`);
}

export async function addProjectJobTitles(
  projectId: string,
  jobTitles: { title: string; relevanceScore?: number }[]
): Promise<{ createdOrUpdated: number }> {
  return apiRequest<{ createdOrUpdated: number }>(`/api/v1/projects/${projectId}/job-titles`, {
    method: 'POST',
    body: { jobTitles }
  });
}

export async function triggerJobTitleDiscovery(
  projectId: string,
  companies: { companyName: string; companyId?: string }[],
  geographyIsoCodes: string[]
): Promise<{ accepted: boolean }> {
  return apiRequest<{ accepted: boolean }>('/api/v1/job-title-discovery/trigger', {
    method: 'POST',
    body: { projectId, companies, geographyIsoCodes }
  });
}

export interface SalesNavSearchRecord {
  id: string;
  sourceUrl: string;
  normalizedUrl: string;
  isActive: boolean;
  createdAt: string;
  _count?: { leads: number };
}

export async function listSalesNavSearches(projectId: string): Promise<SalesNavSearchRecord[]> {
  return apiRequest<SalesNavSearchRecord[]>(`/api/v1/projects/${projectId}/sales-nav-searches`);
}

export async function deleteSalesNavSearch(projectId: string, searchId: string): Promise<void> {
  await apiRequest(`/api/v1/projects/${projectId}/sales-nav-searches/${searchId}`, {
    method: 'DELETE'
  });
}

export async function importLeadsCsv(
  projectId: string,
  leads: Record<string, string>[],
  salesNavSearchId?: string
): Promise<{ imported: number; duplicatesSkipped: number; errors: string[] }> {
  return apiRequest(`/api/v1/projects/${projectId}/import-leads`, {
    method: 'POST',
    body: { leads, salesNavSearchId }
  });
}

export async function scrapeSalesNav(
  projectId: string,
  salesNavSearchId?: string
): Promise<{ queued: number }> {
  return apiRequest<{ queued: number }>(`/api/v1/projects/${projectId}/scrape-sales-nav`, {
    method: 'POST',
    body: salesNavSearchId ? { salesNavSearchId } : {}
  });
}

export async function getScrapingStatus(projectId: string): Promise<{ scraping: boolean }> {
  return apiRequest<{ scraping: boolean }>(`/api/v1/projects/${projectId}/scraping-status`);
}

export interface ScreeningQuestionRecord {
  id: string;
  projectId: string;
  prompt: string;
  displayOrder: number;
  required: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export async function listScreeningQuestions(projectId: string): Promise<ScreeningQuestionRecord[]> {
  return apiRequest<ScreeningQuestionRecord[]>(`/api/v1/projects/${projectId}/screening-questions`);
}

export async function createScreeningQuestion(
  projectId: string,
  data: { prompt: string; displayOrder: number; required?: boolean }
): Promise<ScreeningQuestionRecord> {
  return apiRequest<ScreeningQuestionRecord>(`/api/v1/projects/${projectId}/screening-questions`, {
    method: 'POST',
    body: data
  });
}

export async function updateScreeningQuestion(
  projectId: string,
  questionId: string,
  data: { prompt?: string; displayOrder?: number; required?: boolean }
): Promise<ScreeningQuestionRecord> {
  return apiRequest<ScreeningQuestionRecord>(`/api/v1/projects/${projectId}/screening-questions/${questionId}`, {
    method: 'PATCH',
    body: data
  });
}

export async function deleteScreeningQuestion(projectId: string, questionId: string): Promise<void> {
  await apiRequest(`/api/v1/projects/${projectId}/screening-questions/${questionId}`, {
    method: 'DELETE'
  });
}

export interface AvailableChannel {
  channel: string;
  label: string;
}

export async function listAvailableChannels(projectId: string): Promise<AvailableChannel[]> {
  return apiRequest<AvailableChannel[]>(`/api/v1/projects/${projectId}/available-channels`);
}
