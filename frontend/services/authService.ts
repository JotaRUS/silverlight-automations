import type { AuthUser } from '@/types/auth';

import { apiRequest, setCsrfToken } from './apiClient';

interface LoginResponse {
  authenticated: boolean;
  userId: string;
  role: 'admin' | 'ops' | 'caller';
  name: string;
  email: string;
  csrfToken: string;
}

export async function login(payload: { email: string; password: string }): Promise<AuthUser> {
  const response = await apiRequest<LoginResponse>('/api/v1/auth/login', {
    method: 'POST',
    body: payload
  });
  if (!response.authenticated) {
    throw new Error('Login failed');
  }
  setCsrfToken(response.csrfToken);
  return {
    userId: response.userId,
    role: response.role,
    name: response.name,
    email: response.email
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
