import { apiRequest } from './apiClient';

export interface Notification {
  id: string;
  type: string;
  severity: 'INFO' | 'WARNING' | 'ERROR';
  title: string;
  message: string;
  projectId: string | null;
  metadata: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export async function fetchNotifications(options?: {
  unreadOnly?: boolean;
  limit?: number;
}): Promise<Notification[]> {
  const params = new URLSearchParams();
  if (options?.unreadOnly) params.set('unreadOnly', 'true');
  if (options?.limit) params.set('limit', String(options.limit));
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return apiRequest<Notification[]>(`/api/v1/notifications${suffix}`);
}

export async function fetchUnreadCount(): Promise<{ count: number }> {
  return apiRequest<{ count: number }>('/api/v1/notifications/unread-count');
}

export async function markNotificationsRead(ids: string[]): Promise<void> {
  await apiRequest('/api/v1/notifications/mark-read', {
    method: 'POST',
    body: { ids }
  });
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiRequest('/api/v1/notifications/mark-all-read', { method: 'POST' });
}
