import type { ProjectRecord } from '@/types/project';

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
