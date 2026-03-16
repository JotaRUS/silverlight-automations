'use client';

import { useQuery } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useSocket } from '@/hooks/useSocket';
import {
  fetchDlq,
  fetchFraudEvents,
  fetchObsSummary,
  fetchSystemEvents,
  fetchWebhookEvents,
  type DlqJobRecord,
  type SystemEventRecord
} from '@/services/adminService';

type Tab = 'activity' | 'dlq' | 'webhooks' | 'fraud';

const CATEGORIES = ['', 'SYSTEM', 'JOB', 'WEBHOOK', 'ENFORCEMENT', 'FRAUD', 'ALLOCATION'] as const;
const TIME_RANGES = [
  { label: 'Last 1h', ms: 3600000 },
  { label: 'Last 6h', ms: 21600000 },
  { label: 'Last 24h', ms: 86400000 },
  { label: 'Last 7d', ms: 604800000 },
  { label: 'All time', ms: 0 }
] as const;

function categoryTone(cat: string): 'success' | 'warning' | 'danger' | 'neutral' {
  switch (cat) {
    case 'FRAUD': return 'danger';
    case 'ENFORCEMENT': return 'warning';
    case 'JOB': return 'success';
    default: return 'neutral';
  }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function JsonPayload({ data }: { data: Record<string, unknown> | null }): JSX.Element | null {
  if (!data) return null;
  return (
    <pre className="mt-2 max-h-48 overflow-auto rounded bg-slate-50 p-3 text-xs font-mono text-slate-700 border border-slate-200">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function SkeletonRows({ cols }: { cols: number }): JSX.Element {
  return (
    <>
      {[1, 2, 3, 4, 5].map((i) => (
        <tr key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="p-3"><div className="h-4 w-full animate-pulse rounded bg-slate-100" /></td>
          ))}
        </tr>
      ))}
    </>
  );
}

function Pagination({ total, limit, offset, onChange }: {
  total: number; limit: number; offset: number;
  onChange: (offset: number) => void;
}): JSX.Element | null {
  const pages = Math.ceil(total / limit);
  if (pages <= 1) return null;
  const current = Math.floor(offset / limit);
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-3 pt-3 text-xs text-slate-500">
      <span>{total} total</span>
      <div className="flex gap-1">
        <button
          disabled={current === 0}
          onClick={() => onChange(Math.max(0, offset - limit))}
          className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-30"
        >
          Prev
        </button>
        <span className="px-2 py-1">Page {current + 1} / {pages}</span>
        <button
          disabled={current >= pages - 1}
          onClick={() => onChange(offset + limit)}
          className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-30"
        >
          Next
        </button>
      </div>
    </div>
  );
}

export default function ObservabilityPage(): JSX.Element {
  const [tab, setTab] = useState<Tab>('activity');
  const [refreshNonce, setRefreshNonce] = useState(0);

  const bump = useCallback(() => setRefreshNonce((v) => v + 1), []);
  const stableRef = useRef(bump);
  stableRef.current = bump;
  const stableHandler = useCallback(() => stableRef.current(), []);
  useSocket('/admin', 'observability.updated', stableHandler);

  const [actSearch, setActSearch] = useState('');
  const [actCategory, setActCategory] = useState('');
  const [actRange, setActRange] = useState(86400000);
  const [actOffset, setActOffset] = useState(0);
  const [actExpanded, setActExpanded] = useState<string | null>(null);

  const [dlqSearch, setDlqSearch] = useState('');
  const [dlqQueue, setDlqQueue] = useState('');
  const [dlqRange, setDlqRange] = useState(86400000);
  const [dlqOffset, setDlqOffset] = useState(0);
  const [dlqExpanded, setDlqExpanded] = useState<string | null>(null);

  const [whSearch, setWhSearch] = useState('');
  const [whStatus, setWhStatus] = useState('');
  const [whRange, setWhRange] = useState(86400000);
  const [whOffset, setWhOffset] = useState(0);

  const [frRange, setFrRange] = useState(86400000);
  const [frOffset, setFrOffset] = useState(0);
  const [frExpanded, setFrExpanded] = useState<string | null>(null);

  const summaryQ = useQuery({
    queryKey: ['obs-summary', refreshNonce],
    queryFn: fetchObsSummary,
    refetchInterval: 30_000
  });

  const since = (ms: number) => ms > 0 ? new Date(Date.now() - ms).toISOString() : undefined;

  const activityQ = useQuery({
    queryKey: ['obs-events', actCategory, actSearch, actRange, actOffset, refreshNonce],
    queryFn: () => fetchSystemEvents({
      category: actCategory || undefined,
      search: actSearch || undefined,
      since: since(actRange),
      limit: 50,
      offset: actOffset
    }),
    refetchInterval: 30_000
  });

  const dlqQ = useQuery({
    queryKey: ['obs-dlq', dlqQueue, dlqSearch, dlqRange, dlqOffset, refreshNonce],
    queryFn: () => fetchDlq({
      queueName: dlqQueue || undefined,
      search: dlqSearch || undefined,
      since: since(dlqRange),
      limit: 50,
      offset: dlqOffset
    }),
    refetchInterval: 30_000
  });

  const whQ = useQuery({
    queryKey: ['obs-wh', whStatus, whSearch, whRange, whOffset, refreshNonce],
    queryFn: () => fetchWebhookEvents({
      status: whStatus || undefined,
      search: whSearch || undefined,
      since: since(whRange),
      limit: 50,
      offset: whOffset
    }),
    refetchInterval: 30_000
  });

  const fraudQ = useQuery({
    queryKey: ['obs-fraud', frRange, frOffset, refreshNonce],
    queryFn: () => fetchFraudEvents({
      since: since(frRange),
      limit: 50,
      offset: frOffset
    }),
    refetchInterval: 30_000
  });

  const s = summaryQ.data;

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'activity', label: 'Activity Feed', count: s?.recentEventCount },
    { key: 'dlq', label: 'Dead Letter Queue', count: s?.dlqCount },
    { key: 'webhooks', label: 'Webhook Log', count: s?.webhookCount },
    { key: 'fraud', label: 'Fraud & Violations', count: s?.fraudFlagCount }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">System Observability</h1>
          <p className="text-sm text-slate-500">Search activities, monitor issues, and inspect system events</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Live
        </span>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'System Events', value: s?.recentEventCount, icon: 'timeline', color: 'text-blue-600 bg-blue-50' },
          { label: 'DLQ Items', value: s?.dlqCount, icon: 'error', color: 'text-red-600 bg-red-50' },
          { label: 'Fraud Flags', value: s?.fraudFlagCount, icon: 'shield', color: 'text-amber-600 bg-amber-50' },
          { label: 'Webhooks', value: s?.webhookCount, icon: 'webhook', color: 'text-emerald-600 bg-emerald-50' }
        ].map((m) => (
          <Card key={m.label} className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${m.color}`}>
              <span className="material-symbols-outlined text-lg">{m.icon}</span>
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums text-slate-800">
                {m.value ?? <span className="inline-block h-6 w-10 animate-pulse rounded bg-slate-100" />}
              </p>
              <p className="text-xs text-slate-500">{m.label} (24h)</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.key ? 'text-primary border-b-2 border-primary' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
            {typeof t.count === 'number' && t.count > 0 && (
              <span className="ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-slate-100 px-1.5 text-xs font-semibold text-slate-600">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'activity' && (
        <Card>
          <div className="flex flex-wrap items-center gap-2 pb-3">
            <input
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-primary w-64"
              placeholder="Search messages or correlation IDs..."
              value={actSearch}
              onChange={(e) => { setActSearch(e.target.value); setActOffset(0); }}
            />
            <select className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm" value={actCategory} onChange={(e) => { setActCategory(e.target.value); setActOffset(0); }}>
              <option value="">All categories</option>
              {CATEGORIES.filter(Boolean).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm" value={actRange} onChange={(e) => { setActRange(Number(e.target.value)); setActOffset(0); }}>
              {TIME_RANGES.map((r) => <option key={r.label} value={r.ms}>{r.label}</option>)}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="p-3 font-semibold w-28">Time</th>
                <th className="p-3 font-semibold w-28">Category</th>
                <th className="p-3 font-semibold w-36">Entity</th>
                <th className="p-3 font-semibold">Message</th>
                <th className="p-3 font-semibold w-32">Correlation</th>
              </tr></thead>
              <tbody>
                {activityQ.isLoading && <SkeletonRows cols={5} />}
                {!activityQ.isLoading && (activityQ.data?.events.length ?? 0) === 0 && (
                  <tr><td colSpan={5} className="py-12 text-center text-sm text-slate-400">
                    <span className="material-symbols-outlined mb-1 block text-3xl text-slate-300">search_off</span>
                    No system events found
                  </td></tr>
                )}
                {activityQ.data?.events.map((ev: SystemEventRecord) => (
                  <tr key={ev.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors" onClick={() => setActExpanded(actExpanded === ev.id ? null : ev.id)}>
                    <td className="p-3 text-xs text-slate-500 whitespace-nowrap" title={ev.createdAt}>{relativeTime(ev.createdAt)}</td>
                    <td className="p-3"><Badge tone={categoryTone(ev.category)}>{ev.category}</Badge></td>
                    <td className="p-3 text-xs text-slate-600">
                      <span className="font-medium">{ev.entityType}</span>
                      {ev.entityId && <span className="text-slate-400 ml-1 truncate max-w-[80px] inline-block align-bottom">{ev.entityId.slice(0, 8)}</span>}
                    </td>
                    <td className="p-3 text-sm text-slate-700">
                      {ev.message}
                      {actExpanded === ev.id && <JsonPayload data={ev.payload} />}
                    </td>
                    <td className="p-3 text-xs text-slate-400 font-mono truncate max-w-[120px]">{ev.correlationId ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination total={activityQ.data?.total ?? 0} limit={50} offset={actOffset} onChange={setActOffset} />
        </Card>
      )}

      {tab === 'dlq' && (
        <Card>
          <div className="flex flex-wrap items-center gap-2 pb-3">
            <input
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-primary w-64"
              placeholder="Search error messages..."
              value={dlqSearch}
              onChange={(e) => { setDlqSearch(e.target.value); setDlqOffset(0); }}
            />
            <input
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-primary w-40"
              placeholder="Queue name"
              value={dlqQueue}
              onChange={(e) => { setDlqQueue(e.target.value); setDlqOffset(0); }}
            />
            <select className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm" value={dlqRange} onChange={(e) => { setDlqRange(Number(e.target.value)); setDlqOffset(0); }}>
              {TIME_RANGES.map((r) => <option key={r.label} value={r.ms}>{r.label}</option>)}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="p-3 font-semibold w-28">Time</th>
                <th className="p-3 font-semibold w-36">Queue</th>
                <th className="p-3 font-semibold w-36">Job ID</th>
                <th className="p-3 font-semibold">Error</th>
                <th className="p-3 font-semibold w-32">Correlation</th>
              </tr></thead>
              <tbody>
                {dlqQ.isLoading && <SkeletonRows cols={5} />}
                {!dlqQ.isLoading && (dlqQ.data?.jobs.length ?? 0) === 0 && (
                  <tr><td colSpan={5} className="py-12 text-center text-sm text-slate-400">
                    <span className="material-symbols-outlined mb-1 block text-3xl text-slate-300">check_circle</span>
                    No dead-letter jobs
                  </td></tr>
                )}
                {dlqQ.data?.jobs.map((job: DlqJobRecord) => (
                  <tr key={job.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors" onClick={() => setDlqExpanded(dlqExpanded === job.id ? null : job.id)}>
                    <td className="p-3 text-xs text-slate-500 whitespace-nowrap" title={job.failedAt}>{relativeTime(job.failedAt)}</td>
                    <td className="p-3"><Badge tone="danger">{job.queueName}</Badge></td>
                    <td className="p-3 text-xs font-mono text-slate-600 truncate max-w-[130px]">{job.jobId}</td>
                    <td className="p-3 text-sm text-slate-700">
                      <p className="truncate max-w-md">{job.errorMessage}</p>
                      {dlqExpanded === job.id && (
                        <div className="mt-2 space-y-2">
                          {job.stackTrace && (
                            <pre className="max-h-40 overflow-auto rounded bg-red-50 p-2 text-xs font-mono text-red-800 border border-red-200">
                              {job.stackTrace}
                            </pre>
                          )}
                          <JsonPayload data={job.payload} />
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-xs text-slate-400 font-mono truncate max-w-[120px]">{job.correlationId ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination total={dlqQ.data?.total ?? 0} limit={50} offset={dlqOffset} onChange={setDlqOffset} />
        </Card>
      )}

      {tab === 'webhooks' && (
        <Card>
          <div className="flex flex-wrap items-center gap-2 pb-3">
            <input
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-primary w-64"
              placeholder="Search event IDs..."
              value={whSearch}
              onChange={(e) => { setWhSearch(e.target.value); setWhOffset(0); }}
            />
            <input
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-primary w-32"
              placeholder="Status"
              value={whStatus}
              onChange={(e) => { setWhStatus(e.target.value); setWhOffset(0); }}
            />
            <select className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm" value={whRange} onChange={(e) => { setWhRange(Number(e.target.value)); setWhOffset(0); }}>
              {TIME_RANGES.map((r) => <option key={r.label} value={r.ms}>{r.label}</option>)}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="p-3 font-semibold w-28">Time</th>
                <th className="p-3 font-semibold">Event ID</th>
                <th className="p-3 font-semibold w-28">Status</th>
                <th className="p-3 font-semibold w-40">Hash</th>
              </tr></thead>
              <tbody>
                {whQ.isLoading && <SkeletonRows cols={4} />}
                {!whQ.isLoading && (whQ.data?.events.length ?? 0) === 0 && (
                  <tr><td colSpan={4} className="py-12 text-center text-sm text-slate-400">
                    <span className="material-symbols-outlined mb-1 block text-3xl text-slate-300">webhook</span>
                    No webhook events
                  </td></tr>
                )}
                {whQ.data?.events.map((ev) => (
                  <tr key={ev.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="p-3 text-xs text-slate-500 whitespace-nowrap" title={ev.processedAt}>{relativeTime(ev.processedAt)}</td>
                    <td className="p-3 text-sm font-mono text-slate-700">{ev.eventId}</td>
                    <td className="p-3"><Badge tone={ev.status === 'processed' ? 'success' : 'neutral'}>{ev.status}</Badge></td>
                    <td className="p-3 text-xs font-mono text-slate-400 truncate max-w-[160px]">{ev.hash}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination total={whQ.data?.total ?? 0} limit={50} offset={whOffset} onChange={setWhOffset} />
        </Card>
      )}

      {tab === 'fraud' && (
        <Card>
          <div className="flex flex-wrap items-center gap-2 pb-3">
            <select className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm" value={frRange} onChange={(e) => { setFrRange(Number(e.target.value)); setFrOffset(0); }}>
              {TIME_RANGES.map((r) => <option key={r.label} value={r.ms}>{r.label}</option>)}
            </select>
          </div>

          {/* Fraud call logs */}
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Flagged Call Logs</h3>
          <div className="overflow-x-auto mb-6">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="p-3 font-semibold w-28">Time</th>
                <th className="p-3 font-semibold">Call ID</th>
                <th className="p-3 font-semibold w-28">Caller</th>
                <th className="p-3 font-semibold w-24">Duration</th>
                <th className="p-3 font-semibold w-20">Flag</th>
              </tr></thead>
              <tbody>
                {fraudQ.isLoading && <SkeletonRows cols={5} />}
                {!fraudQ.isLoading && (fraudQ.data?.callLogs.length ?? 0) === 0 && (
                  <tr><td colSpan={5} className="py-8 text-center text-sm text-slate-400">No fraud-flagged calls</td></tr>
                )}
                {fraudQ.data?.callLogs.map((log) => (
                  <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="p-3 text-xs text-slate-500 whitespace-nowrap" title={log.createdAt}>{relativeTime(log.createdAt)}</td>
                    <td className="p-3 text-sm font-mono text-slate-700">{log.callId ?? '—'}</td>
                    <td className="p-3 text-xs text-slate-600 font-mono truncate max-w-[100px]">{log.callerId?.slice(0, 8) ?? '—'}</td>
                    <td className="p-3 text-sm tabular-nums">{log.duration != null ? `${log.duration}s` : '—'}</td>
                    <td className="p-3"><Badge tone="danger">FRAUD</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Enforcement / fraud events */}
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Fraud & Enforcement Events</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="p-3 font-semibold w-28">Time</th>
                <th className="p-3 font-semibold w-28">Category</th>
                <th className="p-3 font-semibold w-36">Entity</th>
                <th className="p-3 font-semibold">Message</th>
              </tr></thead>
              <tbody>
                {fraudQ.isLoading && <SkeletonRows cols={4} />}
                {!fraudQ.isLoading && (fraudQ.data?.events.length ?? 0) === 0 && (
                  <tr><td colSpan={4} className="py-8 text-center text-sm text-slate-400">No enforcement events</td></tr>
                )}
                {fraudQ.data?.events.map((ev: SystemEventRecord) => (
                  <tr key={ev.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors" onClick={() => setFrExpanded(frExpanded === ev.id ? null : ev.id)}>
                    <td className="p-3 text-xs text-slate-500 whitespace-nowrap" title={ev.createdAt}>{relativeTime(ev.createdAt)}</td>
                    <td className="p-3"><Badge tone={categoryTone(ev.category)}>{ev.category}</Badge></td>
                    <td className="p-3 text-xs text-slate-600 font-medium">{ev.entityType}</td>
                    <td className="p-3 text-sm text-slate-700">
                      {ev.message}
                      {frExpanded === ev.id && <JsonPayload data={ev.payload} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination total={(fraudQ.data?.totalLogs ?? 0) + (fraudQ.data?.totalEvents ?? 0)} limit={50} offset={frOffset} onChange={setFrOffset} />
        </Card>
      )}

      {/* Error banner */}
      {(activityQ.isError || dlqQ.isError || whQ.isError || fraudQ.isError) && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load observability data. Retrying automatically...
        </div>
      )}
    </div>
  );
}
