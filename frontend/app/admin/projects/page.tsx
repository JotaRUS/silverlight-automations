'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { listProjects } from '@/services/projectService';
import type { ProjectStatus } from '@/types/project';

const statusConfig: Record<ProjectStatus, { label: string; color: string; bg: string }> = {
  ACTIVE: { label: 'Active', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  COMPLETED: { label: 'Completed', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
  PAUSED: { label: 'Paused', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
  ARCHIVED: { label: 'Archived', color: 'text-slate-500', bg: 'bg-slate-50 border-slate-200' }
};

function StatusBadge({ status }: { status: ProjectStatus }): JSX.Element {
  const cfg = statusConfig[status];
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg.color} ${cfg.bg}`}>
      {cfg.label}
    </span>
  );
}

function ProgressBar({ percentage }: { percentage: number }): JSX.Element {
  const clamped = Math.min(100, Math.max(0, percentage));
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${clamped >= 100 ? 'bg-emerald-500' : clamped >= 50 ? 'bg-primary' : 'bg-amber-400'}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="text-xs font-medium text-slate-500 tabular-nums w-10 text-right">{clamped.toFixed(0)}%</span>
    </div>
  );
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

export default function ProjectsPage(): JSX.Element {
  const { data: projects, isLoading, error } = useQuery({
    queryKey: ['projects'],
    queryFn: () => listProjects()
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Projects</h2>
          <p className="text-sm text-slate-500">All expert sourcing projects and their current status</p>
        </div>
        <Link href="/admin/projects/new">
          <Button>
            <span className="material-symbols-outlined text-lg mr-1">add</span>
            New Project
          </Button>
        </Link>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50 text-sm text-red-700">
          Failed to load projects: {error instanceof Error ? error.message : 'Unknown error'}
        </Card>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {!isLoading && projects && projects.length === 0 && (
        <Card className="py-12 text-center">
          <span className="material-symbols-outlined text-4xl text-slate-300">work_off</span>
          <p className="mt-2 text-sm text-slate-500">No projects yet</p>
        </Card>
      )}

      {!isLoading && projects && projects.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Project</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Progress</th>
                  <th className="px-4 py-3 text-right">Signed Up</th>
                  <th className="px-4 py-3 text-right">Target</th>
                  <th className="px-4 py-3">Regions</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {projects.map((project) => (
                  <tr key={project.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-slate-800">{project.name}</p>
                        {project.description && (
                          <p className="mt-0.5 text-xs text-slate-400 line-clamp-1">{project.description}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={project.status} />
                    </td>
                    <td className="px-4 py-3 min-w-[140px]">
                      <ProgressBar percentage={Number(project.completionPercentage)} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {project.signedUpCount}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                      {project.targetThreshold}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {project.geographyIsoCodes.slice(0, 3).map((code) => (
                          <span key={code} className="inline-flex rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                            {code}
                          </span>
                        ))}
                        {project.geographyIsoCodes.length > 3 && (
                          <span className="text-xs text-slate-400">+{project.geographyIsoCodes.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <PriorityIndicator priority={project.priority} />
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                      {formatDate(project.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!isLoading && projects && projects.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SummaryCard
            icon="folder"
            label="Total"
            value={projects.length}
          />
          <SummaryCard
            icon="play_circle"
            label="Active"
            value={projects.filter((p) => p.status === 'ACTIVE').length}
            color="text-emerald-600"
          />
          <SummaryCard
            icon="check_circle"
            label="Completed"
            value={projects.filter((p) => p.status === 'COMPLETED').length}
            color="text-blue-600"
          />
          <SummaryCard
            icon="pause_circle"
            label="Paused"
            value={projects.filter((p) => p.status === 'PAUSED').length}
            color="text-amber-600"
          />
        </div>
      )}
    </div>
  );
}

function PriorityIndicator({ priority }: { priority: number }): JSX.Element {
  if (priority >= 3) {
    return <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600"><span className="material-symbols-outlined text-sm">keyboard_double_arrow_up</span>High</span>;
  }
  if (priority >= 1) {
    return <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600"><span className="material-symbols-outlined text-sm">keyboard_arrow_up</span>Med</span>;
  }
  return <span className="inline-flex items-center gap-1 text-xs text-slate-400"><span className="material-symbols-outlined text-sm">remove</span>Low</span>;
}

function SummaryCard({ icon, label, value, color }: { icon: string; label: string; value: number; color?: string }): JSX.Element {
  return (
    <Card className="flex items-center gap-3">
      <span className={`material-symbols-outlined text-2xl ${color ?? 'text-slate-400'}`}>{icon}</span>
      <div>
        <p className="text-lg font-bold tabular-nums">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </Card>
  );
}
