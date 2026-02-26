'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { useSocket } from '@/hooks/useSocket';
import { fetchCallBoard, fetchDashboardStats, type DashboardStats } from '@/services/adminService';

interface CallBoardResponse {
  tasks: Record<string, unknown>[];
  callers: Record<string, unknown>[];
  metrics: Record<string, unknown>[];
}

function StatCard({
  title,
  value,
  trend,
  icon,
  iconColor,
  loading
}: {
  title: string;
  value: string;
  trend?: string | null;
  icon: string;
  iconColor?: string;
  loading?: boolean;
}) {
  const trendIsPositive = trend?.startsWith('+');
  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
      <div className="flex justify-between items-start mb-2">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <span className={`material-symbols-outlined ${iconColor ?? 'text-primary'}`}>{icon}</span>
      </div>
      <div className="flex items-end justify-between">
        <div>
          {loading ? (
            <div className="h-8 w-16 bg-slate-100 rounded animate-pulse" />
          ) : (
            <h3 className="text-2xl font-bold">{value}</h3>
          )}
          {trend && (
            <p className={`text-xs font-medium flex items-center gap-1 ${trendIsPositive ? 'text-emerald-600' : 'text-red-500'}`}>
              <span className="material-symbols-outlined text-[14px]">
                {trendIsPositive ? 'trending_up' : 'trending_down'}
              </span>
              {trend}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status?.toUpperCase() ?? '';
  if (normalized === 'ASSIGNED' || normalized === 'DIALING' || normalized === 'ACTIVE') {
    return (
      <span className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
        <span className="size-1.5 rounded-full bg-emerald-600 animate-pulse" />
        {status}
      </span>
    );
  }
  if (normalized === 'PENDING' || normalized === 'CONNECTING') {
    return (
      <span className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
        <span className="size-1.5 rounded-full bg-amber-600" />
        {status}
      </span>
    );
  }
  return <Badge>{status}</Badge>;
}

function buildChartPath(hourlyTasks: { hour: string; count: number }[]): { path: string; fillPath: string } {
  if (hourlyTasks.length === 0) {
    return { path: 'M0 75 H480', fillPath: 'M0 75 H480 V150 H0 Z' };
  }

  const maxCount = Math.max(...hourlyTasks.map((h) => h.count), 1);
  const points = hourlyTasks.map((h, i) => {
    const x = (i / Math.max(hourlyTasks.length - 1, 1)) * 480;
    const y = 150 - (h.count / maxCount) * 140 - 5;
    return { x, y };
  });

  if (points.length === 1) {
    const p = points[0];
    return {
      path: `M0 ${p.y} H480`,
      fillPath: `M0 ${p.y} H480 V150 H0 Z`
    };
  }

  let d = `M${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx = (prev.x + curr.x) / 2;
    d += ` C${cpx} ${prev.y}, ${cpx} ${curr.y}, ${curr.x} ${curr.y}`;
  }

  const last = points[points.length - 1];
  const fillD = `${d} V150 H0 V${points[0].y} Z`;

  return { path: d, fillPath: fillD };
}

function AllocationChart({ hourlyTasks, loading }: { hourlyTasks: { hour: string; count: number }[]; loading: boolean }) {
  const { path, fillPath } = useMemo(() => buildChartPath(hourlyTasks), [hourlyTasks]);

  const labels = useMemo(() => {
    if (hourlyTasks.length === 0) return ['00:00', '06:00', '12:00', '18:00', '23:59'];
    const step = Math.max(Math.floor(hourlyTasks.length / 5), 1);
    const result: string[] = [];
    for (let i = 0; i < hourlyTasks.length; i += step) {
      const d = new Date(hourlyTasks[i].hour);
      result.push(`${String(d.getHours()).padStart(2, '0')}:00`);
    }
    return result;
  }, [hourlyTasks]);

  const totalTasks = hourlyTasks.reduce((sum, h) => sum + h.count, 0);

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">analytics</span>
          <h2 className="font-bold text-lg">Allocation Trends</h2>
        </div>
        <span className="text-xs bg-slate-100 rounded-lg px-3 py-1.5 font-medium text-slate-600">
          Last 24 Hours &middot; {totalTasks} tasks
        </span>
      </div>
      <div className="h-64 flex flex-col justify-between">
        {loading ? (
          <div className="flex-1 bg-slate-50 rounded-lg animate-pulse" />
        ) : (
          <svg
            fill="none"
            height="100%"
            preserveAspectRatio="none"
            viewBox="0 0 480 150"
            width="100%"
          >
            <path d={fillPath} fill="url(#trendGradient)" />
            <path d={path} stroke="#5048e5" strokeLinecap="round" strokeWidth="3" />
            <defs>
              <linearGradient id="trendGradient" x1="240" x2="240" y1="1" y2="150" gradientUnits="userSpaceOnUse">
                <stop stopColor="#5048e5" stopOpacity="0.2" />
                <stop offset="1" stopColor="#5048e5" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
        )}
        <div className="flex justify-between mt-4">
          {labels.map((t) => (
            <p key={t} className="text-slate-400 text-xs font-bold">{t}</p>
          ))}
        </div>
      </div>
    </section>
  );
}

const CATEGORY_META: Record<string, { icon: string; bg: string; border: string; color: string }> = {
  ALLOCATION: { icon: 'add_link', bg: 'bg-blue-100', border: 'border-blue-200', color: 'text-blue-600' },
  ENFORCEMENT: { icon: 'gavel', bg: 'bg-amber-100', border: 'border-amber-200', color: 'text-amber-600' },
  FRAUD: { icon: 'warning', bg: 'bg-red-100', border: 'border-red-200', color: 'text-red-600' },
  JOB: { icon: 'work', bg: 'bg-indigo-100', border: 'border-indigo-200', color: 'text-indigo-600' },
  WEBHOOK: { icon: 'webhook', bg: 'bg-purple-100', border: 'border-purple-200', color: 'text-purple-600' },
  SYSTEM: { icon: 'cloud_sync', bg: 'bg-slate-100', border: 'border-slate-200', color: 'text-slate-600' }
};

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function ActivityFeed({
  events,
  loading,
  socketConnected
}: {
  events: DashboardStats['recentEvents'];
  loading: boolean;
  socketConnected: boolean;
}) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      <div className="p-5 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">stream</span>
          <h2 className="font-bold text-lg">Activity Feed</h2>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 bg-primary/10 rounded-full">
          <span className="relative flex h-2 w-2">
            {socketConnected && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            )}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${socketConnected ? 'bg-primary' : 'bg-slate-400'}`} />
          </span>
          <span className="text-[10px] font-bold text-primary uppercase">
            {socketConnected ? 'Live' : 'Polling'}
          </span>
        </div>
      </div>
      <div className="p-5 flex-1 space-y-6 max-h-[600px] overflow-y-auto">
        {loading && (
          <>
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="flex gap-4">
                <div className="size-8 rounded-full bg-slate-100 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 bg-slate-100 rounded animate-pulse" />
                  <div className="h-3 w-48 bg-slate-50 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </>
        )}
        {!loading && events.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-8">No recent events</p>
        )}
        {events.map((event, idx) => {
          const meta = CATEGORY_META[event.category] ?? CATEGORY_META.SYSTEM;
          return (
            <div key={event.id} className="relative flex gap-4">
              {idx < events.length - 1 && (
                <div className="absolute left-4 top-10 bottom-0 w-px bg-slate-200" />
              )}
              <div className={`relative z-10 size-8 rounded-full ${meta.bg} flex items-center justify-center ${meta.color} border ${meta.border}`}>
                <span className="material-symbols-outlined text-[18px]">{meta.icon}</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{event.message}</p>
                <p className="text-xs text-slate-500 mb-1">
                  {event.category} &middot; {event.entityType}
                  {event.entityId ? ` #${event.entityId.slice(0, 8)}` : ''}
                </p>
                <p className="text-[10px] text-slate-400 uppercase font-bold">
                  {formatRelativeTime(event.createdAt)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function AdminDashboardPage(): JSX.Element {
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [socketConnected, setSocketConnected] = useState(false);

  useSocket('/admin', 'call-allocation.updated', () => {
    setRefreshNonce((v) => v + 1);
    setSocketConnected(true);
  });
  useSocket('/admin', 'caller.performance.updated', () => {
    setRefreshNonce((v) => v + 1);
    setSocketConnected(true);
  });

  const dashboardQuery = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats', refreshNonce],
    queryFn: () => fetchDashboardStats(),
    refetchInterval: 30_000
  });

  const callBoardQuery = useQuery<CallBoardResponse>({
    queryKey: ['call-board', refreshNonce],
    queryFn: () => fetchCallBoard()
  });

  const stats = dashboardQuery.data;
  const tasks = callBoardQuery.data?.tasks ?? [];
  const activeTasks = tasks.filter(
    (t) => t.status === 'ASSIGNED' || t.status === 'DIALING' || t.status === 'ACTIVE'
  );
  const pendingTasks = tasks.filter((t) => t.status === 'PENDING');
  const allTasks = [...activeTasks, ...pendingTasks].slice(0, 5);

  const healthLabel = stats?.systemHealth === 'healthy' ? 'Healthy' : stats?.systemHealth === 'degraded' ? 'Degraded' : stats ? 'Down' : '—';
  const healthColor = stats?.systemHealth === 'healthy'
    ? 'text-emerald-500'
    : stats?.systemHealth === 'degraded'
      ? 'text-amber-500'
      : 'text-red-500';

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Projects"
          value={String(stats?.projectCount ?? 0)}
          trend={stats?.projectTrend}
          icon="folder_managed"
          loading={dashboardQuery.isLoading}
        />
        <StatCard
          title="Active Callers"
          value={String(stats?.callerCount ?? 0)}
          trend={stats?.callerTrend}
          icon="groups"
          loading={dashboardQuery.isLoading}
        />
        <StatCard
          title="Active Tasks"
          value={String(stats?.activeTaskCount ?? 0)}
          trend={activeTasks.length > 0 ? `${activeTasks.length} live` : null}
          icon="verified"
          loading={dashboardQuery.isLoading}
        />
        <StatCard
          title="System Health"
          value={healthLabel}
          icon="sensors"
          iconColor={healthColor}
          loading={dashboardQuery.isLoading}
        />
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Call Allocation Live Board */}
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">podium</span>
                <h2 className="font-bold text-lg">Call Allocation Live Board</h2>
              </div>
              <span className="px-2 py-1 bg-emerald-100 text-emerald-600 text-[10px] font-bold uppercase tracking-wider rounded">
                Live Stream
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Task / Expert</th>
                    <th className="px-5 py-3 font-semibold">Caller</th>
                    <th className="px-5 py-3 font-semibold">Priority</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {callBoardQuery.isLoading && (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center">
                        <div className="h-4 w-48 bg-slate-100 rounded animate-pulse mx-auto" />
                      </td>
                    </tr>
                  )}
                  {!callBoardQuery.isLoading && allTasks.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-sm text-slate-400">
                        No active tasks — board will refresh in real-time
                      </td>
                    </tr>
                  )}
                  {allTasks.map((task) => (
                    <tr key={String(task.id)} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-4">
                        <div>
                          <p className="text-sm font-semibold">Task #{String(task.id).slice(0, 8)}</p>
                          <p className="text-xs text-slate-500">{String(task.expertId ?? 'Unassigned')}</p>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm font-mono text-slate-600">
                        {String(task.callerId ?? '—')}
                      </td>
                      <td className="px-5 py-4 text-sm">
                        {String(task.priorityScore ?? '—')}
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={String(task.status)} />
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button className="text-primary hover:text-primary/80">
                          <span className="material-symbols-outlined text-[20px]">monitoring</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Allocation Trends */}
          <AllocationChart
            hourlyTasks={stats?.hourlyTasks ?? []}
            loading={dashboardQuery.isLoading}
          />
        </div>

        {/* Activity Feed sidebar */}
        <aside>
          <ActivityFeed
            events={stats?.recentEvents ?? []}
            loading={dashboardQuery.isLoading}
            socketConnected={socketConnected}
          />
        </aside>
      </div>
    </div>
  );
}
