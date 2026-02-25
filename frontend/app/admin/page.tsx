'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { useSocket } from '@/hooks/useSocket';
import { fetchCallBoard } from '@/services/adminService';
import { listProjects } from '@/services/projectService';

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
  sparkPath
}: {
  title: string;
  value: string;
  trend?: string;
  icon: string;
  iconColor?: string;
  sparkPath: string;
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
          <h3 className="text-2xl font-bold">{value}</h3>
          {trend && (
            <p className={`text-xs font-medium flex items-center gap-1 ${trendIsPositive ? 'text-emerald-600' : 'text-red-500'}`}>
              <span className="material-symbols-outlined text-[14px]">
                {trendIsPositive ? 'trending_up' : 'trending_down'}
              </span>
              {trend}
            </p>
          )}
        </div>
        <div className="w-16 h-8">
          <svg className="w-full h-full stroke-primary fill-none stroke-[3] overflow-visible" viewBox="0 0 100 40">
            <path d={sparkPath} />
          </svg>
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

function AllocationChart() {
  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">analytics</span>
          <h2 className="font-bold text-lg">Allocation Trends</h2>
        </div>
        <span className="text-xs bg-slate-100 rounded-lg px-3 py-1.5 font-medium text-slate-600">Last 24 Hours</span>
      </div>
      <div className="h-64 flex flex-col justify-between">
        <svg
          fill="none"
          height="100%"
          preserveAspectRatio="none"
          viewBox="0 0 480 150"
          width="100%"
        >
          <path
            d="M0 109C18.1538 109 18.1538 21 36.3077 21C54.4615 21 54.4615 41 72.6154 41C90.7692 41 90.7692 93 108.923 93C127.077 93 127.077 33 145.231 33C163.385 33 163.385 101 181.538 101C199.692 101 199.692 61 217.846 61C236 61 236 45 254.154 45C272.308 45 272.308 121 290.462 121C308.615 121 308.615 149 326.769 149C344.923 149 344.923 1 363.077 1C381.231 1 381.231 81 399.385 81C417.538 81 417.538 129 435.692 129C453.846 129 453.846 25 472 25V149H0V109Z"
            fill="url(#trendGradient)"
          />
          <path
            d="M0 109C18.1538 109 18.1538 21 36.3077 21C54.4615 21 54.4615 41 72.6154 41C90.7692 41 90.7692 93 108.923 93C127.077 93 127.077 33 145.231 33C163.385 33 163.385 101 181.538 101C199.692 101 199.692 61 217.846 61C236 61 236 45 254.154 45C272.308 45 272.308 121 290.462 121C308.615 121 308.615 149 326.769 149C344.923 149 344.923 1 363.077 1C381.231 1 381.231 81 399.385 81C417.538 81 417.538 129 435.692 129C453.846 129 453.846 25 472 25"
            stroke="#5048e5"
            strokeLinecap="round"
            strokeWidth="3"
          />
          <defs>
            <linearGradient id="trendGradient" x1="240" x2="240" y1="1" y2="150" gradientUnits="userSpaceOnUse">
              <stop stopColor="#5048e5" stopOpacity="0.2" />
              <stop offset="1" stopColor="#5048e5" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
        <div className="flex justify-between mt-4">
          {['00:00', '06:00', '12:00', '18:00', '23:59'].map((t) => (
            <p key={t} className="text-slate-400 text-xs font-bold">{t}</p>
          ))}
        </div>
      </div>
    </section>
  );
}

const activityItems = [
  {
    icon: 'check_circle',
    bg: 'bg-emerald-100',
    border: 'border-emerald-200',
    color: 'text-emerald-600',
    title: 'Expert Verified',
    desc: 'Identity confirmation completed',
    time: 'Just Now'
  },
  {
    icon: 'add_link',
    bg: 'bg-blue-100',
    border: 'border-blue-200',
    color: 'text-blue-600',
    title: 'New Allocation',
    desc: 'Project matched with experts',
    time: '2 mins ago'
  },
  {
    icon: 'warning',
    bg: 'bg-amber-100',
    border: 'border-amber-200',
    color: 'text-amber-600',
    title: 'Inactivity Alert',
    desc: 'Call exceeded threshold',
    time: '14 mins ago'
  },
  {
    icon: 'cloud_sync',
    bg: 'bg-slate-100',
    border: 'border-slate-200',
    color: 'text-slate-600',
    title: 'System Sync',
    desc: 'CRM records updated successfully',
    time: '45 mins ago'
  }
];

function ActivityFeed() {
  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      <div className="p-5 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">stream</span>
          <h2 className="font-bold text-lg">Activity Feed</h2>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 bg-primary/10 rounded-full">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
          <span className="text-[10px] font-bold text-primary uppercase">Socket Connected</span>
        </div>
      </div>
      <div className="p-5 flex-1 space-y-6 max-h-[600px] overflow-y-auto">
        {activityItems.map((item, idx) => (
          <div key={item.title} className="relative flex gap-4">
            {idx < activityItems.length - 1 && (
              <div className="absolute left-4 top-10 bottom-0 w-px bg-slate-200" />
            )}
            <div className={`relative z-10 size-8 rounded-full ${item.bg} flex items-center justify-center ${item.color} border ${item.border}`}>
              <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
            </div>
            <div>
              <p className="text-sm font-semibold">{item.title}</p>
              <p className="text-xs text-slate-500 mb-1">{item.desc}</p>
              <p className="text-[10px] text-slate-400 uppercase font-bold">{item.time}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="p-4 border-t border-slate-200">
        <button className="w-full py-2 text-xs font-bold text-primary hover:bg-primary/5 rounded-lg transition-colors uppercase tracking-wider">
          View Full Logs
        </button>
      </div>
    </section>
  );
}

export default function AdminDashboardPage(): JSX.Element {
  const [refreshNonce, setRefreshNonce] = useState(0);
  useSocket('/admin', 'call-allocation.updated', () => setRefreshNonce((v) => v + 1));
  useSocket('/admin', 'caller.performance.updated', () => setRefreshNonce((v) => v + 1));

  const callBoardQuery = useQuery<CallBoardResponse>({
    queryKey: ['call-board', refreshNonce],
    queryFn: () => fetchCallBoard()
  });

  const projectsQuery = useQuery({
    queryKey: ['projects-count'],
    queryFn: () => listProjects()
  });

  const tasks = callBoardQuery.data?.tasks ?? [];
  const activeTasks = tasks.filter(
    (t) => t.status === 'ASSIGNED' || t.status === 'DIALING' || t.status === 'ACTIVE'
  );
  const pendingTasks = tasks.filter((t) => t.status === 'PENDING');
  const allTasks = [...activeTasks, ...pendingTasks].slice(0, 5);

  const projectCount = projectsQuery.data?.length ?? 0;
  const callerCount = callBoardQuery.data?.callers?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Projects"
          value={String(projectCount)}
          trend="+12%"
          icon="folder_managed"
          sparkPath="M0 35 Q 20 10, 40 25 T 80 5 T 100 20"
        />
        <StatCard
          title="Active Callers"
          value={String(callerCount)}
          trend="+5%"
          icon="groups"
          sparkPath="M0 30 Q 25 35, 50 15 T 100 10"
        />
        <StatCard
          title="Active Tasks"
          value={String(activeTasks.length)}
          trend={`${activeTasks.length} live`}
          icon="verified"
          sparkPath="M0 20 Q 25 15, 50 25 T 100 5"
        />
        <StatCard
          title="System Health"
          value="Optimal"
          icon="sensors"
          iconColor="text-emerald-500"
          sparkPath="M0 20 H 20 L 25 5 L 35 35 L 45 20 H 100"
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
                  {allTasks.length === 0 && (
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
          <AllocationChart />
        </div>

        {/* Activity Feed sidebar */}
        <aside>
          <ActivityFeed />
        </aside>
      </div>
    </div>
  );
}
