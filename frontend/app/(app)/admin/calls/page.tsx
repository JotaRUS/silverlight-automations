'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useSocket } from '@/hooks/useSocket';
import {
  fetchCallBoard,
  requeueCallTask,
  type CallBoardCaller,
  type CallBoardMetric,
  type CallBoardTask
} from '@/services/adminService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function phonesForExpert(task: CallBoardTask): string[] {
  return task.expert.contacts
    .filter((c) => c.type === 'PHONE')
    .map((c) => c.valueNormalized ?? c.value);
}

function callerStatusTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  switch (status) {
    case 'ACTIVE':
      return 'success';
    case 'WARMUP_GRACE':
    case 'AT_RISK':
      return 'warning';
    case 'PAUSED_LOW_DIAL_RATE':
    case 'RESTRICTED_FRAUD':
    case 'SUSPENDED':
      return 'danger';
    default:
      return 'neutral';
  }
}

function taskStatusTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  switch (status) {
    case 'DIALING':
      return 'warning';
    case 'ASSIGNED':
      return 'success';
    default:
      return 'neutral';
  }
}

function statusLabel(s: string): string {
  return s.replace(/_/g, ' ');
}

// ---------------------------------------------------------------------------
// Live timer hook — re-renders every second
// ---------------------------------------------------------------------------

function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function formatDuration(ms: number): string {
  if (ms <= 0) return '0s';
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

// ---------------------------------------------------------------------------
// Requeue Dialog
// ---------------------------------------------------------------------------

function RequeueDialog({
  taskId,
  expertName,
  onClose
}: {
  taskId: string;
  expertName: string;
  onClose: () => void;
}): JSX.Element {
  const [reason, setReason] = useState('');
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => requeueCallTask(taskId, reason || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['call-board'] });
      onClose();
    }
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
        <h3 className="text-base font-semibold text-slate-900">Requeue Task</h3>
        <p className="mt-1 text-sm text-slate-500">
          This will cancel the current assignment and return the task for{' '}
          <span className="font-medium text-slate-700">{expertName}</span> to the pending pool.
        </p>
        <textarea
          className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          rows={3}
          placeholder="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        {mutation.isError && (
          <p className="mt-2 text-xs text-red-600">Failed to requeue. Please try again.</p>
        )}
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Requeuing...' : 'Confirm Requeue'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function SkeletonCard(): JSX.Element {
  return (
    <div className="animate-pulse space-y-2 rounded border border-slate-100 p-3">
      <div className="h-4 w-2/3 rounded bg-slate-100" />
      <div className="h-3 w-1/2 rounded bg-slate-100" />
      <div className="h-3 w-1/3 rounded bg-slate-100" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  icon
}: {
  label: string;
  value: number;
  icon: string;
}): JSX.Element {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <span className="material-symbols-outlined text-xl text-primary">{icon}</span>
      <div>
        <p className="text-xl font-bold text-slate-900">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function CallAllocationLiveBoardPage(): JSX.Element {
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [requeueTarget, setRequeueTarget] = useState<{ id: string; name: string } | null>(null);
  const now = useNow();

  const bumpNonce = useCallback(() => setRefreshNonce((v) => v + 1), []);
  const stableBumpRef = useRef(bumpNonce);
  stableBumpRef.current = bumpNonce;

  const stableAllocationHandler = useCallback(() => stableBumpRef.current(), []);
  const stablePerformanceHandler = useCallback(() => stableBumpRef.current(), []);

  useSocket('/admin', 'call-allocation.updated', stableAllocationHandler);
  useSocket('/admin', 'call-allocation.outcome', stableAllocationHandler);
  useSocket('/admin', 'caller.performance.updated', stablePerformanceHandler);

  const callBoardQuery = useQuery({
    queryKey: ['call-board', refreshNonce],
    queryFn: () => fetchCallBoard(),
    refetchInterval: 30_000
  });

  const tasks = callBoardQuery.data?.tasks ?? [];
  const callers = callBoardQuery.data?.callers ?? [];
  const metrics = callBoardQuery.data?.metrics ?? [];

  const pendingTasks = useMemo(() => tasks.filter((t) => t.status === 'PENDING'), [tasks]);
  const activeTasks = useMemo(
    () => tasks.filter((t) => t.status === 'ASSIGNED' || t.status === 'DIALING'),
    [tasks]
  );

  const activeCallerCount = useMemo(
    () => callers.filter((c) => ['ACTIVE', 'WARMUP_GRACE', 'AT_RISK'].includes(c.allocationStatus)).length,
    [callers]
  );
  const idleCallerCount = useMemo(
    () => callers.filter((c) => c.allocationStatus === 'IDLE_NO_AVAILABLE_TASKS').length,
    [callers]
  );

  const metricByCaller = useMemo(() => {
    const map = new Map<string, CallBoardMetric>();
    for (const m of metrics) {
      if (!map.has(m.callerId)) map.set(m.callerId, m);
    }
    return map;
  }, [metrics]);

  const callerById = useMemo(() => {
    const map = new Map<string, CallBoardCaller>();
    for (const c of callers) map.set(c.id, c);
    return map;
  }, [callers]);

  const assignmentsByCaller = useMemo(() => {
    const map = new Map<string, CallBoardTask[]>();
    for (const t of activeTasks) {
      const key = t.callerId ?? 'unassigned';
      const list = map.get(key) ?? [];
      list.push(t);
      map.set(key, list);
    }
    return map;
  }, [activeTasks]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Call Allocation Live Board</h1>
          <p className="text-sm text-slate-500">
            Real-time view of the autonomous call allocation engine
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Live
        </span>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Pending Tasks" value={pendingTasks.length} icon="hourglass_top" />
        <StatCard label="Active Calls" value={activeTasks.length} icon="call" />
        <StatCard label="Active Callers" value={activeCallerCount} icon="headset_mic" />
        <StatCard label="Idle Callers" value={idleCallerCount} icon="pause_circle" />
      </div>

      {/* Error banner */}
      {callBoardQuery.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load call board data. Retrying automatically...
        </div>
      )}

      {/* Three-column board */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Available Tasks */}
        <Card className="flex flex-col">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">
              Available Tasks
              {pendingTasks.length > 0 && (
                <span className="ml-2 text-xs font-normal text-slate-400">({pendingTasks.length})</span>
              )}
            </h2>
            <span className="material-symbols-outlined text-lg text-slate-400">queue</span>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto text-sm" style={{ maxHeight: 'calc(100vh - 320px)' }}>
            {callBoardQuery.isLoading && (
              <>
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </>
            )}
            {!callBoardQuery.isLoading && pendingTasks.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <span className="material-symbols-outlined mb-2 text-3xl text-slate-300">check_circle</span>
                <p className="text-sm text-slate-400">No pending tasks</p>
                <p className="text-xs text-slate-300">Allocation engine is idle</p>
              </div>
            )}
            {pendingTasks.map((task) => {
              const phones = phonesForExpert(task);
              return (
                <div key={task.id} className="rounded-lg border border-slate-200 p-3 transition hover:border-slate-300">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-800">{task.expert.fullName}</p>
                      <p className="truncate text-xs text-slate-500">{task.project.name}</p>
                    </div>
                    <Badge tone="neutral">P{String(Number(task.priorityScore))}</Badge>
                  </div>
                  {phones.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {phones.map((phone) => (
                        <span
                          key={phone}
                          className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700"
                        >
                          <span className="material-symbols-outlined text-xs">call</span>
                          {phone}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                    <span>
                      {task.expert.countryIso ?? '—'}
                      {task.expert.timezone ? ` · ${task.expert.timezone.split('/').pop()}` : ''}
                    </span>
                    <button
                      className="text-slate-400 transition hover:text-primary"
                      title="Requeue"
                      onClick={() => setRequeueTarget({ id: task.id, name: task.expert.fullName })}
                    >
                      <span className="material-symbols-outlined text-base">refresh</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Active Assignments */}
        <Card className="flex flex-col">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">
              Active Assignments
              {activeTasks.length > 0 && (
                <span className="ml-2 text-xs font-normal text-slate-400">({activeTasks.length})</span>
              )}
            </h2>
            <span className="material-symbols-outlined text-lg text-slate-400">assignment_ind</span>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto text-sm" style={{ maxHeight: 'calc(100vh - 320px)' }}>
            {callBoardQuery.isLoading && (
              <>
                <SkeletonCard />
                <SkeletonCard />
              </>
            )}
            {!callBoardQuery.isLoading && activeTasks.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <span className="material-symbols-outlined mb-2 text-3xl text-slate-300">person_off</span>
                <p className="text-sm text-slate-400">No active assignments</p>
                <p className="text-xs text-slate-300">Tasks will appear here when assigned to callers</p>
              </div>
            )}
            {Array.from(assignmentsByCaller.entries()).map(([callerId, callerTasks]) => {
              const caller = callerById.get(callerId);
              return (
                <div key={callerId}>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {caller?.name ?? callerId.slice(0, 8)}
                  </p>
                  <div className="space-y-2">
                    {callerTasks.map((task) => {
                      const phones = phonesForExpert(task);
                      const assignedMs = task.assignedAt
                        ? now.getTime() - new Date(task.assignedAt).getTime()
                        : 0;
                      const windowEnd = task.executionWindowEndsAt
                        ? new Date(task.executionWindowEndsAt).getTime()
                        : null;
                      const remainingMs = windowEnd ? windowEnd - now.getTime() : null;
                      const isUrgent = remainingMs !== null && remainingMs < 3 * 60 * 1000 && remainingMs > 0;
                      const isExpired = remainingMs !== null && remainingMs <= 0;

                      return (
                        <div
                          key={task.id}
                          className={`rounded-lg border p-3 transition ${
                            isExpired
                              ? 'border-red-300 bg-red-50'
                              : isUrgent
                                ? 'border-amber-300 bg-amber-50'
                                : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium text-slate-800">
                                {task.expert.fullName}
                              </p>
                              <p className="truncate text-xs text-slate-500">{task.project.name}</p>
                            </div>
                            <Badge tone={taskStatusTone(task.status)}>{task.status}</Badge>
                          </div>

                          {phones.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {phones.map((phone) => (
                                <span
                                  key={phone}
                                  className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700"
                                >
                                  <span className="material-symbols-outlined text-xs">call</span>
                                  {phone}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="mt-2 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-3 text-slate-400">
                              <span>Assigned {formatDuration(assignedMs)} ago</span>
                              {remainingMs !== null && (
                                <span
                                  className={
                                    isExpired
                                      ? 'font-semibold text-red-600'
                                      : isUrgent
                                        ? 'font-semibold text-amber-600'
                                        : ''
                                  }
                                >
                                  {isExpired ? 'Window expired' : `${formatDuration(remainingMs)} left`}
                                </span>
                              )}
                            </div>
                            <button
                              className="text-slate-400 transition hover:text-primary"
                              title="Requeue"
                              onClick={() =>
                                setRequeueTarget({ id: task.id, name: task.expert.fullName })
                              }
                            >
                              <span className="material-symbols-outlined text-base">refresh</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Caller Status */}
        <Card className="flex flex-col">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">
              Caller Status
              {callers.length > 0 && (
                <span className="ml-2 text-xs font-normal text-slate-400">({callers.length})</span>
              )}
            </h2>
            <span className="material-symbols-outlined text-lg text-slate-400">group</span>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto text-sm" style={{ maxHeight: 'calc(100vh - 320px)' }}>
            {callBoardQuery.isLoading && (
              <>
                <SkeletonCard />
                <SkeletonCard />
              </>
            )}
            {!callBoardQuery.isLoading && callers.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <span className="material-symbols-outlined mb-2 text-3xl text-slate-300">group_off</span>
                <p className="text-sm text-slate-400">No callers registered</p>
              </div>
            )}
            {callers.map((caller) => {
              const metric = metricByCaller.get(caller.id);
              const dialRate = metric?.rolling60MinuteDials ?? 0;
              const dialTarget = 30;
              const dialPct = Math.min(100, Math.round((dialRate / dialTarget) * 100));
              const isFraud = caller.fraudStatus !== 'NONE';

              return (
                <div
                  key={caller.id}
                  className={`rounded-lg border p-3 ${isFraud ? 'border-red-200 bg-red-50' : 'border-slate-200'}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-slate-800">{caller.name}</p>
                    <Badge tone={callerStatusTone(caller.allocationStatus)}>
                      {statusLabel(caller.allocationStatus)}
                    </Badge>
                  </div>
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Dial rate (60m)</span>
                      <span className="font-medium">
                        {dialRate} / {dialTarget}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full transition-all ${
                          dialPct >= 80 ? 'bg-emerald-500' : dialPct >= 40 ? 'bg-amber-400' : 'bg-red-400'
                        }`}
                        style={{ width: `${dialPct}%` }}
                      />
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
                    {metric?.graceModeActive && (
                      <span className="inline-flex items-center gap-0.5 text-amber-600">
                        <span className="material-symbols-outlined text-xs">shield</span>
                        Grace
                      </span>
                    )}
                    {isFraud && (
                      <span className="inline-flex items-center gap-0.5 font-semibold text-red-600">
                        <span className="material-symbols-outlined text-xs">warning</span>
                        {statusLabel(caller.fraudStatus)}
                      </span>
                    )}
                    <span>{caller.timezone.split('/').pop()}</span>
                    {caller.regionIsoCodes.length > 0 && (
                      <span>{caller.regionIsoCodes.join(', ')}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Requeue Dialog */}
      {requeueTarget && (
        <RequeueDialog
          taskId={requeueTarget.id}
          expertName={requeueTarget.name}
          onClose={() => setRequeueTarget(null)}
        />
      )}
    </div>
  );
}
