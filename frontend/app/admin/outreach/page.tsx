'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useSocket } from '@/hooks/useSocket';
import { fetchOutreachThreads } from '@/services/adminService';

export default function OutreachMonitorPage(): JSX.Element {
  const [projectId, setProjectId] = useState('');
  const [refreshNonce, setRefreshNonce] = useState(0);
  useSocket('/admin', 'outreach.thread.updated', () => setRefreshNonce((value) => value + 1));

  const threadsQuery = useQuery({
    queryKey: ['outreach-threads', projectId, refreshNonce],
    queryFn: () => fetchOutreachThreads(projectId || undefined)
  });

  return (
    <div className="space-y-6">
      <Card className="space-y-2">
        <h1 className="text-lg font-semibold">Outreach Monitor</h1>
        <Input
          placeholder="Filter by project id"
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
        />
      </Card>
      <Card>
        <div className="space-y-3">
          {threadsQuery.data?.map((thread) => (
            <div key={String(thread.id)} className="rounded border border-slate-200 p-3">
              <p className="font-medium">
                {String((thread.expert as { fullName?: string } | undefined)?.fullName ?? thread.expertId)}
              </p>
              <p className="text-xs text-slate-500">
                Channel: {String(thread.channel)} · Status: {String(thread.status)} · Replied:{' '}
                {String(thread.replied)}
              </p>
              <div className="mt-2 max-h-40 overflow-auto rounded bg-slate-50 p-2 text-xs">
                {((thread.messages as { body?: string; createdAt?: string; direction?: string }[] | undefined) ?? [])
                  .map((message) => `${message.direction ?? 'unknown'}: ${message.body ?? ''} (${message.createdAt ?? ''})`)
                  .join('\n')}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
