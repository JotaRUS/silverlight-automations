'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { apiRequest } from '@/services/apiClient';
import type {
  CallerPerformanceRecord,
  CallLogRecord,
  EnrichedCallTask,
  ExpertContact,
  OutreachThreadRecord
} from '@/types/caller';

const outcomeOptions = [
  { key: 'INTERESTED_SIGNUP_LINK_SENT', label: 'Expert Interested', variant: 'primary' },
  { key: 'RETRYABLE_REJECTION', label: 'Not Interested / Hung Up', variant: 'secondary' },
  { key: 'NEVER_CONTACT_AGAIN', label: 'Never Call Again', variant: 'danger' }
] as const;

type OutcomeKey = (typeof outcomeOptions)[number]['key'];

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

function getCountryName(iso: string | null): string {
  if (!iso) return 'Unknown';
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(iso.toUpperCase()) ?? iso;
  } catch {
    return iso;
  }
}

function getLanguageNames(codes: string[]): string {
  if (!codes.length) return 'Unknown';
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'language' });
    return codes.map((c) => dn.of(c) ?? c).join(', ');
  } catch {
    return codes.join(', ');
  }
}

function getBestPhone(contacts: ExpertContact[]): { number: string; verified: boolean } | null {
  const phones = contacts.filter((c) => c.type === 'PHONE');
  const verified = phones.find((c) => c.verificationStatus === 'VERIFIED');
  const primary = phones.find((c) => c.isPrimary);
  const best = verified ?? primary ?? phones[0];
  if (!best) return null;
  return { number: best.value, verified: best.verificationStatus === 'VERIFIED' };
}

function getOutcomeTone(outcome: string | null): 'neutral' | 'success' | 'warning' | 'danger' {
  switch (outcome) {
    case 'INTERESTED_SIGNUP_LINK_SENT':
      return 'success';
    case 'RETRYABLE_REJECTION':
    case 'NO_ANSWER':
    case 'BUSY':
      return 'warning';
    case 'NEVER_CONTACT_AGAIN':
    case 'FAILED':
      return 'danger';
    default:
      return 'neutral';
  }
}

function formatOutcome(outcome: string | null): string {
  if (!outcome) return '—';
  return outcome.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function CallerPage(): JSX.Element {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [refreshNonce, setRefreshNonce] = useState(0);
  useSocket('/caller', 'caller.task.updated', () => setRefreshNonce((v) => v + 1));
  useSocket('/caller', 'caller.performance.updated', () => setRefreshNonce((v) => v + 1));

  const taskQuery = useQuery({
    queryKey: ['caller-task', refreshNonce],
    queryFn: () => apiRequest<EnrichedCallTask | null>('/api/v1/call-tasks/current')
  });

  const performanceQuery = useQuery({
    queryKey: ['caller-performance', user?.userId, refreshNonce],
    queryFn: async () => {
      if (!user?.userId) return null;
      return apiRequest<CallerPerformanceRecord | null>(`/api/v1/callers/${user.userId}/performance/latest`);
    }
  });

  const outcomeMutation = useMutation({
    mutationFn: async (outcome: OutcomeKey) => {
      if (!taskQuery.data) throw new Error('No assigned task');
      await apiRequest(`/api/v1/call-tasks/${taskQuery.data.id}/outcome`, {
        method: 'POST',
        body: { outcome }
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['caller-task'] }),
        queryClient.invalidateQueries({ queryKey: ['caller-performance'] })
      ]);
    }
  });

  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!taskQuery.data?.executionWindowEndsAt) {
      setSecondsRemaining(null);
      return;
    }
    const deadline = new Date(taskQuery.data.executionWindowEndsAt).getTime();
    const update = () => setSecondsRemaining(Math.max(0, Math.floor((deadline - Date.now()) / 1000)));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [taskQuery.data?.executionWindowEndsAt]);

  const task = taskQuery.data;
  const expert = task?.expert;
  const phone = expert ? getBestPhone(expert.contacts) : null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      {/* Caller status bar */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Caller Interface</h1>
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <span>ID: {user?.userId ?? '—'}</span>
          <span className="text-slate-300">|</span>
          <span>Dials/hr: {performanceQuery.data?.rolling60MinuteDials ?? 0}</span>
          <span className="text-slate-300">|</span>
          <Badge tone={performanceQuery.data?.allocationStatus === 'ACTIVE' ? 'success' : 'neutral'}>
            {performanceQuery.data?.allocationStatus ?? 'unknown'}
          </Badge>
        </div>
      </div>

      {!task ? (
        <Card className="py-16 text-center">
          <p className="text-lg text-slate-400">No task assigned</p>
          <p className="mt-1 text-sm text-slate-400">Waiting for the next available task…</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Expert info card */}
          <Card className="space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">{expert?.fullName ?? 'Unknown Expert'}</h2>
                {(expert?.currentRole ?? expert?.currentCompany) && (
                  <p className="mt-0.5 text-sm text-slate-500">
                    {[expert?.currentRole, expert?.currentCompany].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              <div className="text-right">
                {secondsRemaining !== null && (
                  <div
                    className={`text-2xl font-mono font-bold tabular-nums ${secondsRemaining < 120 ? 'text-red-600' : 'text-slate-700'}`}
                  >
                    {formatTimer(secondsRemaining)}
                  </div>
                )}
                <Badge>{task.status}</Badge>
              </div>
            </div>

            {/* Phone number — large and prominent */}
            {phone ? (
              <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-4 py-3">
                <span className="text-2xl font-semibold tracking-wide text-slate-900">{phone.number}</span>
                {phone.verified && <Badge tone="success">Verified</Badge>}
              </div>
            ) : (
              <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
                No phone number available for this expert
              </div>
            )}

            {/* Details grid */}
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <div>
                <span className="text-slate-400">Country</span>
                <p className="font-medium text-slate-700">{getCountryName(expert?.countryIso ?? null)}</p>
              </div>
              <div>
                <span className="text-slate-400">Languages</span>
                <p className="font-medium text-slate-700">{getLanguageNames(expert?.languageCodes ?? [])}</p>
              </div>
              <div>
                <span className="text-slate-400">Timezone</span>
                <p className="font-medium text-slate-700">{expert?.timezone ?? '—'}</p>
              </div>
              <div>
                <span className="text-slate-400">Project</span>
                <p className="font-medium text-slate-700">{task.project?.name ?? task.projectId}</p>
              </div>
              <div>
                <span className="text-slate-400">Priority</span>
                <p className="font-medium text-slate-700">{Number(task.priorityScore)}</p>
              </div>
              <div>
                <span className="text-slate-400">Dial attempts</span>
                <p className="font-medium text-slate-700">{task.attemptedDialCount}</p>
              </div>
            </div>
          </Card>

          {/* Call history */}
          <CallHistory callLogs={expert?.callLogs ?? []} />

          {/* Outreach notes */}
          <OutreachNotes threads={expert?.outreachThreads ?? []} />

          {/* Action buttons */}
          <Card>
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-400">Record Outcome</p>
            <div className="flex flex-wrap gap-3">
              {outcomeOptions.map((opt) => (
                <Button
                  key={opt.key}
                  variant={opt.variant}
                  className="flex-1 py-3 text-base"
                  disabled={outcomeMutation.isPending}
                  onClick={() => outcomeMutation.mutate(opt.key)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
            {outcomeMutation.isError && (
              <p className="mt-2 text-sm text-red-600">
                Failed to submit outcome. Please try again.
              </p>
            )}
          </Card>

          {/* Task metadata (small footer) */}
          <p className="text-center text-xs text-slate-400">Task {task.id}</p>
        </div>
      )}
    </main>
  );
}

function CallHistory({ callLogs }: { callLogs: CallLogRecord[] }): JSX.Element | null {
  if (!callLogs.length) {
    return (
      <Card>
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Call History</p>
        <p className="mt-2 text-sm text-slate-400">No previous calls recorded</p>
      </Card>
    );
  }

  return (
    <Card className="space-y-1">
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">
        Call History ({callLogs.length} previous)
      </p>
      <div className="divide-y divide-slate-100">
        {callLogs.map((log) => {
          const outcome = log.callTask?.callOutcome ?? log.terminationReason;
          const notes = log.metadata && typeof log.metadata === 'object' && 'notes' in log.metadata
            ? String(log.metadata.notes)
            : null;

          return (
            <div key={log.id} className="flex items-center gap-4 py-2.5 text-sm">
              <span className="w-36 shrink-0 text-slate-500">{formatDateTime(log.startedAt ?? log.createdAt)}</span>
              <span className="w-16 shrink-0 font-mono text-slate-700">{formatDuration(log.durationSeconds)}</span>
              <Badge tone={getOutcomeTone(outcome ?? null)}>{formatOutcome(outcome ?? null)}</Badge>
              <span className="truncate text-slate-500">{log.dialedNumber}</span>
              {notes && <span className="ml-auto truncate text-xs italic text-slate-400">{notes}</span>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function OutreachNotes({ threads }: { threads: OutreachThreadRecord[] }): JSX.Element | null {
  if (!threads.length) return null;

  return (
    <Card className="space-y-1">
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">Previous Outreach</p>
      <div className="space-y-3">
        {threads.map((thread) => (
          <div key={thread.id} className="rounded-md border border-slate-100 p-3">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Badge>{thread.channel}</Badge>
              <span>{formatDateTime(thread.lastMessageAt ?? thread.firstContactAt)}</span>
              {thread.replied && <Badge tone="success">Replied</Badge>}
            </div>
            {thread.messages.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {thread.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`text-sm ${msg.direction === 'INBOUND' ? 'font-medium text-slate-800' : 'text-slate-600'}`}
                  >
                    <span className="mr-1.5 text-xs text-slate-400">
                      {msg.direction === 'INBOUND' ? 'IN' : 'OUT'}
                    </span>
                    {msg.body.length > 200 ? `${msg.body.slice(0, 200)}…` : msg.body}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
