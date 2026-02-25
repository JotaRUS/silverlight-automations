'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useSocket } from '@/hooks/useSocket';
import { fetchCallBoard } from '@/services/adminService';

interface CallBoardResponse {
  tasks: Record<string, unknown>[];
  callers: Record<string, unknown>[];
  metrics: Record<string, unknown>[];
}

export default function CallAllocationLiveBoardPage(): JSX.Element {
  const [refreshNonce, setRefreshNonce] = useState(0);
  useSocket('/admin', 'call-allocation.updated', () => setRefreshNonce((value) => value + 1));
  useSocket('/admin', 'caller.performance.updated', () => setRefreshNonce((value) => value + 1));

  const callBoardQuery = useQuery<CallBoardResponse>({
    queryKey: ['call-board', refreshNonce],
    queryFn: () => fetchCallBoard()
  });

  const tasks = callBoardQuery.data?.tasks ?? [];
  const callers = callBoardQuery.data?.callers ?? [];
  const metrics = callBoardQuery.data?.metrics ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Call Allocation Live Board</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <h2 className="mb-2 font-semibold">Available Tasks</h2>
          <div className="space-y-2 text-sm">
            {tasks
              .filter((task) => task.status === 'PENDING')
              .map((task) => (
                <div key={String(task.id)} className="rounded border border-slate-200 p-2">
                  <p>Task: {String(task.id)}</p>
                  <p className="text-xs text-slate-500">Priority: {String(task.priorityScore)}</p>
                </div>
              ))}
          </div>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">Assigned per Caller</h2>
          <div className="space-y-2 text-sm">
            {tasks
              .filter((task) => task.status === 'ASSIGNED' || task.status === 'DIALING')
              .map((task) => (
                <div key={String(task.id)} className="rounded border border-slate-200 p-2">
                  <p>Caller: {String(task.callerId ?? '-')}</p>
                  <p className="text-xs text-slate-500">Task: {String(task.id)}</p>
                  <Badge tone={task.status === 'DIALING' ? 'warning' : 'neutral'}>{String(task.status)}</Badge>
                </div>
              ))}
          </div>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">Caller Status</h2>
          <div className="space-y-2 text-sm">
            {callers.map((caller) => {
              const latestMetric = metrics.find((metric) => metric.callerId === caller.id);
              return (
                <div key={String(caller.id)} className="rounded border border-slate-200 p-2">
                  <p className="font-medium">{String(caller.name ?? caller.id)}</p>
                  <p className="text-xs text-slate-500">Status: {String(caller.allocationStatus)}</p>
                  <p className="text-xs text-slate-500">
                    Dial rate: {String(latestMetric?.rolling60MinuteDials ?? 0)} / 60m
                  </p>
                  <p className="text-xs text-slate-500">
                    Grace mode: {String(latestMetric?.graceModeActive ?? false)}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
