'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useSocket } from '@/hooks/useSocket';
import { fetchCallBoard } from '@/services/adminService';

interface CallTask {
  id: string;
  status: string;
  priorityScore?: number;
  callerId?: string;
  expertId?: string;
  projectId?: string;
  lead?: { expert?: { fullName?: string; contacts?: { type: string; value: string }[] } };
  project?: { name?: string };
}

interface CallBoardResponse {
  tasks: CallTask[];
  callers: Record<string, unknown>[];
  metrics: Record<string, unknown>[];
}

export default function CallAllocationLiveBoardPage(): JSX.Element {
  const [refreshNonce, setRefreshNonce] = useState(0);
  useSocket('/admin', 'call-allocation.updated', () => setRefreshNonce((value) => value + 1));
  useSocket('/admin', 'caller.performance.updated', () => setRefreshNonce((value) => value + 1));

  const callBoardQuery = useQuery({
    queryKey: ['call-board', refreshNonce],
    queryFn: () => fetchCallBoard()
  });

  const raw = callBoardQuery.data as CallBoardResponse | undefined;
  const tasks = raw?.tasks ?? [];
  const callers = raw?.callers ?? [];
  const metrics = raw?.metrics ?? [];

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
                <div key={task.id} className="rounded border border-slate-200 p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-slate-800 truncate">
                      {task.lead?.expert?.fullName ?? task.expertId ?? 'Unknown expert'}
                    </p>
                    <Badge tone="neutral">{task.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 truncate">
                    {task.project?.name ?? task.projectId ?? '—'}
                  </p>
                  {task.lead?.expert?.contacts && task.lead.expert.contacts.length > 0 && (
                    <p className="mt-0.5 text-xs text-slate-400 truncate">
                      {task.lead.expert.contacts[0].value}
                    </p>
                  )}
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                      <span className="material-symbols-outlined text-xs">priority_high</span>
                      Priority: {task.priorityScore ?? '—'}
                    </span>
                  </div>
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
                <div key={task.id} className="rounded border border-slate-200 p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-slate-800 truncate">
                      {task.lead?.expert?.fullName ?? task.expertId ?? 'Unknown expert'}
                    </p>
                    <Badge tone={task.status === 'DIALING' ? 'warning' : 'neutral'}>{task.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 truncate">
                    {task.project?.name ?? task.projectId ?? '—'}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Caller: {String(task.callerId ?? '—')}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                      <span className="material-symbols-outlined text-xs">priority_high</span>
                      Priority: {task.priorityScore ?? '—'}
                    </span>
                  </div>
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
