import type { AuthRole, AuthUser } from '@/types/auth';

import { apiRequest, setCsrfToken } from './apiClient';

export async function login(payload: { userId: string; role: AuthRole }): Promise<AuthUser> {
  const response = await apiRequest<{ authenticated: boolean; userId: string; role: AuthRole }>(
    '/api/v1/auth/login',
    {
      method: 'POST',
      body: payload
    }
  );
  if (!response.authenticated) {
    throw new Error('Login failed');
  }
  return {
    userId: response.userId,
    role: response.role
  };
}

export async function logout(): Promise<void> {
  await apiRequest('/api/v1/auth/logout', {
    method: 'POST'
  });
  setCsrfToken('');
}

export async function fetchCsrfToken(): Promise<string> {
  const response = await apiRequest<{ csrfToken: string }>('/api/v1/auth/csrf');
  setCsrfToken(response.csrfToken);
  return response.csrfToken;
}

export async function fetchMe(): Promise<AuthUser> {
  return apiRequest<AuthUser>('/api/v1/auth/me');
}
