import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import CallerPage from '@/app/(app)/caller/page';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      userId: 'caller-1',
      role: 'caller'
    }
  })
}));

vi.mock('@/hooks/useSocket', () => ({
  useSocket: () => undefined
}));

describe('caller flow', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders current task and submits outcome', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'task-1',
          projectId: 'project-1',
          expertId: 'expert-1',
          status: 'ASSIGNED',
          priorityScore: 100
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          rolling60MinuteDials: 12,
          allocationStatus: 'ACTIVE'
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({})
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'task-1',
          projectId: 'project-1',
          expertId: 'expert-1',
          status: 'ASSIGNED',
          priorityScore: 100
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          rolling60MinuteDials: 12,
          allocationStatus: 'ACTIVE'
        })
      });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <QueryClientProvider client={new QueryClient()}>
        <CallerPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Task task-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Expert Interested'));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/call-tasks/task-1/outcome',
        expect.objectContaining({
          method: 'POST'
        })
      );
    });
  });
});
