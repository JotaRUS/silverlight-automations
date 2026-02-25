'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { apiRequest } from '@/services/apiClient';

interface CallTaskRecord {
  id: string;
  projectId: string;
  expertId: string;
  status: string;
  priorityScore: number;
  executionWindowEndsAt?: string | null;
}

interface CallerPerformanceRecord {
  rolling60MinuteDials: number;
  allocationStatus: string;
}

const outcomeOptions = [
  'INTERESTED_SIGNUP_LINK_SENT',
  'RETRYABLE_REJECTION',
  'NEVER_CONTACT_AGAIN'
] as const;

export default function CallerPage(): JSX.Element {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [refreshNonce, setRefreshNonce] = useState(0);
  useSocket('/caller', 'caller.task.updated', () => setRefreshNonce((value) => value + 1));
  useSocket('/caller', 'caller.performance.updated', () => setRefreshNonce((value) => value + 1));

  const taskQuery = useQuery({
    queryKey: ['caller-task', refreshNonce],
    queryFn: () => apiRequest<CallTaskRecord | null>('/api/v1/call-tasks/current')
  });

  const performanceQuery = useQuery({
    queryKey: ['caller-performance', user?.userId, refreshNonce],
    queryFn: async () => {
      if (!user?.userId) {
        return null;
      }
      return apiRequest<CallerPerformanceRecord | null>(`/api/v1/callers/${user.userId}/performance/latest`);
    }
  });

  const outcomeMutation = useMutation({
    mutationFn: async (outcome: (typeof outcomeOptions)[number]) => {
      if (!taskQuery.data) {
        throw new Error('No assigned task');
      }
      await apiRequest(`/api/v1/call-tasks/${taskQuery.data.id}/outcome`, {
        method: 'POST',
        body: {
          outcome
        }
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['caller-task'] }),
        queryClient.invalidateQueries({ queryKey: ['caller-performance'] })
      ]);
    }
  });

  const secondsRemaining = useMemo(() => {
    if (!taskQuery.data?.executionWindowEndsAt) {
      return null;
    }
    const deadline = new Date(taskQuery.data.executionWindowEndsAt).getTime();
    return Math.max(0, Math.floor((deadline - Date.now()) / 1000));
  }, [taskQuery.data?.executionWindowEndsAt]);

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <h1 className="text-xl font-semibold">Caller Interface</h1>
      <Card className="space-y-2">
        <p className="text-sm text-slate-600">Signed in caller id: {user?.userId ?? '-'}</p>
        <p className="text-sm text-slate-600">
          Dial rate (last 60m): {performanceQuery.data?.rolling60MinuteDials ?? 0}
        </p>
        <p className="text-sm text-slate-600">
          Allocation status: {performanceQuery.data?.allocationStatus ?? 'unknown'}
        </p>
      </Card>
      <Card className="space-y-3">
        <h2 className="font-semibold">Current Assigned Task</h2>
        {taskQuery.data ? (
          <>
            <p className="text-sm">Task ID: {taskQuery.data.id}</p>
            <p className="text-sm">Project: {taskQuery.data.projectId}</p>
            <p className="text-sm">Expert: {taskQuery.data.expertId}</p>
            <p className="text-sm">
              Status: <Badge>{taskQuery.data.status}</Badge>
            </p>
            <p className="text-sm">Priority: {taskQuery.data.priorityScore}</p>
            <p className="text-sm">Timer: {secondsRemaining !== null ? `${secondsRemaining}s` : 'N/A'}</p>
            <div className="flex flex-wrap gap-2">
              {outcomeOptions.map((outcome) => (
                <Button
                  key={outcome}
                  variant={outcome === 'NEVER_CONTACT_AGAIN' ? 'danger' : 'primary'}
                  onClick={() => outcomeMutation.mutate(outcome)}
                >
                  {outcome}
                </Button>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-600">No task assigned.</p>
        )}
      </Card>
    </main>
  );
}
