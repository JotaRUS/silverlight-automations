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
