'use client';

import { useCallback, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useSocket } from '@/hooks/useSocket';
import {
  bulkExportLeads,
  bulkOutreachLeads,
  resumeSourcing,
  fetchQueueStats,
  type QueueStat
} from '@/services/adminService';
import { listProjects } from '@/services/projectService';

interface WorkerJobEvent {
  queueName: string;
  jobId: string;
  status: 'active' | 'completed' | 'failed';
  timestamp: string;
  durationMs?: number;
  error?: string;
  data?: Record<string, unknown>;
}

interface FeedEntry extends WorkerJobEvent {
  uid: string;
}

const MAX_FEED_SIZE = 200;

const STATUS_CONFIG: Record<
  WorkerJobEvent['status'],
  { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger'; dot: string }
> = {
  active: { label: 'Active', tone: 'neutral', dot: 'bg-blue-500 animate-pulse' },
  completed: { label: 'Completed', tone: 'success', dot: 'bg-emerald-500' },
  failed: { label: 'Failed', tone: 'danger', dot: 'bg-red-500' }
};

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 1000) return 'just now';
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

let uidCounter = 0;

export default function WorkersPage(): JSX.Element {
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const [queueFilter, setQueueFilter] = useState<string>('all');
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());
  const [actionProjectId, setActionProjectId] = useState<string>('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const statsQuery = useQuery({
    queryKey: ['workers', 'queue-stats'],
    queryFn: fetchQueueStats,
    refetchInterval: 5000
  });

  const projectsQuery = useQuery({
    queryKey: ['projects-list'],
    queryFn: listProjects
  });

  const runAction = async (action: 'export' | 'outreach' | 'resume-sourcing') => {
    setActionLoading(action);
    setActionResult(null);
    try {
      if (action === 'resume-sourcing') {
        if (!actionProjectId) return;
        const result = await resumeSourcing(actionProjectId);
        const parts: string[] = [];
        if (result.leadFormCount === 0) {
          parts.push(`No Lead Gen Forms found for org ${result.organizationId}. Create a Lead Gen Form on your LinkedIn company page first.`);
        } else {
          parts.push(`${String(result.leadFormCount)} Lead Gen Form(s) found: ${result.leadFormNames.join(', ')}.`);
        }
        if (result.leadsFound > 0) {
          parts.push(`${String(result.leadsFound)} new lead(s) queued for ingestion.`);
        } else if (result.totalResponses > 0) {
          parts.push(`${String(result.totalResponses)} form response(s) in last ${String(result.lookbackDays)}d, all already processed.`);
        } else {
          parts.push(`No form submissions in the last ${String(result.lookbackDays)} days.`);
        }
        if (result.errors?.length) {
          parts.push(`Errors: ${result.errors.join('; ')}`);
        }
        setActionResult(parts.join(' '));
      } else {
        const pid = actionProjectId || undefined;
        const result =
          action === 'export' ? await bulkExportLeads(pid) : await bulkOutreachLeads(pid);
        setActionResult(`Queued ${result.queued} job(s)`);
      }
    } catch (err) {
      setActionResult(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(null);
    }
  };

  const onWorkerEvent = useCallback((event: WorkerJobEvent) => {
    if (pausedRef.current) return;
    const uid = `${++uidCounter}-${event.jobId}`;
    setFeed((prev) => [{ ...event, uid }, ...prev].slice(0, MAX_FEED_SIZE));
  }, []);

  useSocket<WorkerJobEvent>('/admin', 'worker.job.update', onWorkerEvent);

  const toggleError = (uid: string) => {
    setExpandedErrors((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const projectNameMap = new Map(
    (projectsQuery.data ?? []).map((p) => [p.id, p.name])
  );

  const projectFiltered = actionProjectId
    ? feed.filter((e) => e.data?.projectId === actionProjectId)
    : feed;
  const queueNames = Array.from(new Set(projectFiltered.map((e) => e.queueName))).sort();
  const filteredFeed = queueFilter === 'all' ? projectFiltered : projectFiltered.filter((e) => e.queueName === queueFilter);

  const queues: QueueStat[] = statsQuery.data?.queues ?? [];
  const activeQueues = queues.filter(
    (q) => q.waiting > 0 || q.active > 0 || q.failed > 0 || q.delayed > 0
  );
  const idleQueues = queues.filter(
    (q) => q.waiting === 0 && q.active === 0 && q.failed === 0 && q.delayed === 0
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Workers</h1>
        <span className="text-xs text-slate-500">
          {statsQuery.isFetching ? 'Refreshing...' : `${queues.length} queues`}
        </span>
      </div>

      {/* Actions */}
      <Card>
        <h2 className="mb-3 text-sm font-medium text-slate-600">Actions</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-500">Project</label>
            <select
              value={actionProjectId}
              onChange={(e) => setActionProjectId(e.target.value)}
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="">All projects</option>
              {(projectsQuery.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <Button
            onClick={() => void runAction('export')}
            disabled={actionLoading !== null}
          >
            {actionLoading === 'export' ? 'Queuing...' : 'Export not-exported leads'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => void runAction('outreach')}
            disabled={actionLoading !== null}
          >
            {actionLoading === 'outreach' ? 'Queuing...' : 'Outreach enriched leads'}
          </Button>
          {actionProjectId && (
            <Button
              variant="secondary"
              onClick={() => void runAction('resume-sourcing')}
              disabled={actionLoading !== null}
            >
              {actionLoading === 'resume-sourcing' ? 'Polling...' : 'Poll Lead Sync'}
            </Button>
          )}
          {actionResult && (
            <span className="text-sm text-slate-600">{actionResult}</span>
          )}
        </div>
      </Card>

      {/* Queue Stats */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-slate-600">Queue Statistics</h2>
        {activeQueues.length > 0 && (
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {activeQueues.map((q) => (
              <QueueStatCard key={q.name} stat={q} />
            ))}
          </div>
        )}
        {idleQueues.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {idleQueues.map((q) => (
              <span
                key={q.name}
                className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-500"
              >
                {q.name}
                {q.completed > 0 && (
                  <span className="ml-1 text-emerald-600">{q.completed} done</span>
                )}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Live Feed */}
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-medium text-slate-600">Live Feed</h2>
          <select
            value={queueFilter}
            onChange={(e) => setQueueFilter(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-xs"
          >
            <option value="all">All queues</option>
            {queueNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            className="!px-2 !py-1 !text-xs"
            onClick={() => setPaused((p) => !p)}
          >
            {paused ? 'Resume' : 'Pause'}
          </Button>
          <Button
            variant="secondary"
            className="!px-2 !py-1 !text-xs"
            onClick={() => setFeed([])}
          >
            Clear
          </Button>
          <span className="text-xs text-slate-400">
            {filteredFeed.length} event{filteredFeed.length !== 1 ? 's' : ''}
            {paused && ' (paused)'}
          </span>
        </div>

        <Card className="max-h-[32rem] overflow-y-auto !p-0">
          {filteredFeed.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">
              {paused
                ? 'Feed paused — events are not being captured.'
                : 'Waiting for worker events...'}
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Queue</th>
                  <th className="px-3 py-2 font-medium">Job ID</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Duration</th>
                  <th className="px-3 py-2 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredFeed.map((entry) => {
                  const cfg = STATUS_CONFIG[entry.status];
                  return (
                    <tr key={entry.uid} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                        {formatRelativeTime(entry.timestamp)}
                      </td>
                      <td className="px-3 py-2">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-700">
                          {entry.queueName}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-500">
                        {entry.jobId.length > 12
                          ? `${entry.jobId.slice(0, 12)}...`
                          : entry.jobId}
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`inline-block h-2 w-2 rounded-full ${cfg.dot}`} />
                          <Badge tone={cfg.tone}>{cfg.label}</Badge>
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                        {formatDuration(entry.durationMs)}
                      </td>
                      <td className="max-w-xs px-3 py-2">
                        {entry.error && (
                          <button
                            type="button"
                            onClick={() => toggleError(entry.uid)}
                            className="text-left text-red-600 hover:underline"
                          >
                            {expandedErrors.has(entry.uid)
                              ? entry.error
                              : `${entry.error.slice(0, 80)}${entry.error.length > 80 ? '...' : ''}`}
                          </button>
                        )}
                        {entry.data && !entry.error && (
                          <span className="text-slate-400">
                            <JobDetails data={entry.data} projectNameMap={projectNameMap} />
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </section>
    </div>
  );
}

function QueueStatCard({ stat }: { stat: QueueStat }): JSX.Element {
  return (
    <Card className="!p-3">
      <div className="mb-2 truncate font-mono text-xs font-semibold text-slate-800">
        {stat.name}
      </div>
      <div className="grid grid-cols-5 gap-1 text-center text-[11px]">
        <StatPill label="Wait" value={stat.waiting} color="text-slate-600" />
        <StatPill label="Active" value={stat.active} color="text-blue-600" />
        <StatPill label="Done" value={stat.completed} color="text-emerald-600" />
        <StatPill label="Fail" value={stat.failed} color="text-red-600" />
        <StatPill label="Delay" value={stat.delayed} color="text-amber-600" />
      </div>
    </Card>
  );
}

function JobDetails({
  data,
  projectNameMap
}: {
  data: Record<string, unknown>;
  projectNameMap: Map<string, string>;
}): JSX.Element {
  const parts: string[] = [];

  const projectName =
    typeof data.projectName === 'string'
      ? data.projectName
      : typeof data.projectId === 'string'
        ? projectNameMap.get(data.projectId) ?? null
        : null;
  if (projectName) parts.push(projectName);

  const expertName = typeof data.expertName === 'string' ? data.expertName : null;
  if (expertName) parts.push(expertName);

  if (parts.length === 0) {
    const displayKeys = Object.entries(data).filter(
      ([k]) => !['projectId', 'expertId', 'leadId', 'projectName', 'expertName'].includes(k)
    );
    if (displayKeys.length > 0) {
      return <>{displayKeys.map(([k, v]) => `${k}=${String(v)}`).join(' ')}</>;
    }
    return <>—</>;
  }

  return <>{parts.join(' · ')}</>;
}

function StatPill({
  label,
  value,
  color
}: {
  label: string;
  value: number;
  color: string;
}): JSX.Element {
  return (
    <div>
      <div className={`text-base font-semibold ${color}`}>{value}</div>
      <div className="text-slate-400">{label}</div>
    </div>
  );
}
