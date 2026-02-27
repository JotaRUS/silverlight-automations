'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  dispatchScreening,
  escalateScreening,
  fetchScreeningResponses,
  triggerScreeningFollowUp,
  updateScreeningResponse
} from '@/services/adminService';
import { listProjects } from '@/services/projectService';

type ScreeningStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETE' | 'ESCALATED';

const STATUS_CONFIG: Record<ScreeningStatus, { label: string; icon: string; color: string; bg: string; border: string }> = {
  PENDING: { label: 'Pending', icon: 'hourglass_top', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
  IN_PROGRESS: { label: 'In Progress', icon: 'pending', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
  COMPLETE: { label: 'Complete', icon: 'check_circle', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  ESCALATED: { label: 'Escalated', icon: 'priority_high', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' }
};

interface ScreeningRecord {
  id: string;
  projectId: string;
  expertId: string;
  questionId: string;
  channel: string;
  status: ScreeningStatus;
  responseText?: string;
  score?: number;
  qualified?: boolean;
  submittedAt?: string;
  createdAt: string;
  updatedAt: string;
  question?: { id: string; prompt: string; displayOrder: number; required: boolean };
  expert?: { id: string; fullName?: string; email?: string };
}

function formatRelative(dateString: string): string {
  const diff = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function DispatchForm({
  projects,
  onDispatched,
  onCancel
}: {
  projects: { id: string; name: string }[];
  onDispatched: () => void;
  onCancel: () => void;
}): JSX.Element {
  const [projectId, setProjectId] = useState('');
  const [expertId, setExpertId] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => dispatchScreening({ projectId, expertId }),
    onSuccess: (data) => {
      setError('');
      setProjectId('');
      setExpertId('');
      onDispatched();
      if (data.sent === 0) setError('No screening questions found for this project.');
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Dispatch failed')
  });

  return (
    <Card className="space-y-4 border-primary/30">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">quiz</span>
          Dispatch Screening
        </h3>
        <button onClick={onCancel} className="rounded-lg p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
          <span className="material-symbols-outlined text-xl">close</span>
        </button>
      </div>
      <p className="text-sm text-slate-500">
        Send all screening questions for a project to an expert via their preferred channel.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Project</label>
          <select
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">Select a project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Expert ID</label>
          <Input
            value={expertId}
            onChange={(e) => setExpertId(e.target.value)}
            placeholder="UUID of the expert"
          />
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel} className="bg-slate-100 text-slate-700 hover:bg-slate-200">Cancel</Button>
        <Button
          onClick={() => mutation.mutate()}
          disabled={!projectId || !expertId || mutation.isPending}
        >
          {mutation.isPending ? 'Dispatching...' : 'Dispatch Questions'}
        </Button>
      </div>
    </Card>
  );
}

function ResponseActions({
  record,
  onFollowUp,
  onEscalate,
  onEdit
}: {
  record: ScreeningRecord;
  onFollowUp: (id: string) => void;
  onEscalate: (id: string) => void;
  onEdit: (record: ScreeningRecord) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
      >
        <span className="material-symbols-outlined text-xl">more_vert</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-50 w-52 rounded-xl bg-white shadow-lg border border-slate-200 py-1 text-sm">
            <button
              onClick={() => { onEdit(record); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-slate-50 transition-colors"
            >
              <span className="material-symbols-outlined text-base text-primary">edit</span>
              Edit Response
            </button>
            {record.status !== 'COMPLETE' && record.status !== 'ESCALATED' && (
              <button
                onClick={() => { onFollowUp(record.id); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-slate-50 transition-colors"
              >
                <span className="material-symbols-outlined text-base text-amber-600">notifications_active</span>
                Send Follow-up
              </button>
            )}
            {record.status !== 'ESCALATED' && (
              <button
                onClick={() => { onEscalate(record.id); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 flex items-center gap-2 text-red-600 hover:bg-red-50 transition-colors"
              >
                <span className="material-symbols-outlined text-base">warning</span>
                Escalate to Call
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function EditResponseModal({
  record,
  onSave,
  onCancel,
  isPending
}: {
  record: ScreeningRecord;
  onSave: (id: string, data: { status?: string; responseText?: string }) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [status, setStatus] = useState<ScreeningStatus>(record.status);
  const [responseText, setResponseText] = useState(record.responseText ?? '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-lg w-full mx-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">edit_note</span>
            Edit Screening Response
          </h3>
          <button onClick={onCancel} className="rounded-lg p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        <div className="bg-slate-50 rounded-lg p-3 text-sm">
          <p className="font-medium text-slate-700">{record.expert?.fullName ?? record.expertId}</p>
          <p className="text-xs text-slate-500 mt-0.5">{record.question?.prompt ?? 'Unknown question'}</p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Status</label>
          <select
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            value={status}
            onChange={(e) => setStatus(e.target.value as ScreeningStatus)}
          >
            {(Object.keys(STATUS_CONFIG) as ScreeningStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Response Text</label>
          <textarea
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary min-h-[100px] resize-y"
            value={responseText}
            onChange={(e) => setResponseText(e.target.value)}
            placeholder="Enter the expert's response..."
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button onClick={onCancel} className="bg-slate-100 text-slate-700 hover:bg-slate-200">Cancel</Button>
          <Button
            onClick={() => {
              const data: { status?: string; responseText?: string } = {};
              if (status !== record.status) data.status = status;
              if (responseText !== (record.responseText ?? '')) data.responseText = responseText;
              onSave(record.id, data);
            }}
            disabled={isPending}
          >
            {isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function ScreeningPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [filterStatus, setFilterStatus] = useState<ScreeningStatus | ''>('');
  const [showDispatch, setShowDispatch] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ScreeningRecord | null>(null);

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: () => listProjects()
  });

  const queryKey = ['screening-responses', selectedProjectId, filterStatus];
  const responsesQuery = useQuery({
    queryKey,
    queryFn: () => fetchScreeningResponses(
      selectedProjectId || undefined,
      filterStatus || undefined
    )
  });

  const followUpMutation = useMutation({
    mutationFn: (responseId: string) => triggerScreeningFollowUp(responseId),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey }); }
  });

  const escalateMutation = useMutation({
    mutationFn: (responseId: string) => escalateScreening(responseId),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey }); }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { status?: string; responseText?: string } }) =>
      updateScreeningResponse(id, data),
    onSuccess: () => {
      setEditingRecord(null);
      void queryClient.invalidateQueries({ queryKey });
    }
  });

  const handleFollowUp = useCallback((id: string) => followUpMutation.mutate(id), [followUpMutation]);
  const handleEscalate = useCallback((id: string) => escalateMutation.mutate(id), [escalateMutation]);
  const handleSave = useCallback(
    (id: string, data: { status?: string; responseText?: string }) => updateMutation.mutate({ id, data }),
    [updateMutation]
  );

  const responses = (responsesQuery.data ?? []) as unknown as ScreeningRecord[];

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of responses) {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
    }
    return counts;
  }, [responses]);

  const projectName = projectsQuery.data?.find((p) => p.id === selectedProjectId)?.name;

  return (
    <div className="space-y-6">
      {/* Edit modal */}
      {editingRecord && (
        <EditResponseModal
          record={editingRecord}
          onSave={handleSave}
          onCancel={() => setEditingRecord(null)}
          isPending={updateMutation.isPending}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Screening</h2>
          <p className="text-sm text-slate-500">Manage expert screening questions and responses</p>
        </div>
        <Button onClick={() => setShowDispatch((v) => !v)}>
          <span className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-base">send</span>
            Dispatch Screening
          </span>
        </Button>
      </div>

      {/* Dispatch form */}
      {showDispatch && (
        <DispatchForm
          projects={projectsQuery.data ?? []}
          onDispatched={() => {
            setShowDispatch(false);
            void queryClient.invalidateQueries({ queryKey });
          }}
          onCancel={() => setShowDispatch(false)}
        />
      )}

      {/* Filters */}
      <Card className="flex flex-wrap items-center gap-3">
        <span className="material-symbols-outlined text-slate-400">filter_list</span>
        <select
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          value={selectedProjectId}
          onChange={(e) => setSelectedProjectId(e.target.value)}
        >
          <option value="">All projects</option>
          {projectsQuery.data?.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as ScreeningStatus | '')}
        >
          <option value="">All statuses</option>
          {(Object.keys(STATUS_CONFIG) as ScreeningStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
          ))}
        </select>
        {projectName && (
          <span className="text-xs text-slate-400">{responses.length} response{responses.length !== 1 ? 's' : ''} for {projectName}</span>
        )}
        {!projectName && (
          <span className="ml-auto text-xs text-slate-400">{responses.length} response{responses.length !== 1 ? 's' : ''}</span>
        )}
      </Card>

      {/* Status summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(Object.keys(STATUS_CONFIG) as ScreeningStatus[]).map((s) => {
          const cfg = STATUS_CONFIG[s];
          const count = statusCounts[s] ?? 0;
          const isActive = filterStatus === s;
          return (
            <button
              key={s}
              onClick={() => setFilterStatus(isActive ? '' : s)}
              className={`rounded-xl border p-4 text-left transition-all ${
                isActive
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`material-symbols-outlined text-xl ${cfg.color}`}>{cfg.icon}</span>
                <span className="text-xl font-bold tabular-nums">{count}</span>
              </div>
              <p className="text-xs font-medium text-slate-500">{cfg.label}</p>
            </button>
          );
        })}
      </div>

      {/* Mutation feedback */}
      {(followUpMutation.isError || escalateMutation.isError || updateMutation.isError) && (
        <Card className="border-red-200 bg-red-50 text-sm text-red-700 flex items-center gap-2">
          <span className="material-symbols-outlined text-base">error</span>
          Action failed. Please try again.
        </Card>
      )}

      {/* Loading */}
      {responsesQuery.isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {responsesQuery.error && (
        <Card className="border-red-200 bg-red-50 text-sm text-red-700">
          Failed to load responses: {responsesQuery.error instanceof Error ? responsesQuery.error.message : 'Unknown error'}
        </Card>
      )}

      {/* Empty state */}
      {!responsesQuery.isLoading && responses.length === 0 && (
        <Card className="py-12 text-center">
          <span className="material-symbols-outlined text-4xl text-slate-300">quiz</span>
          <p className="mt-2 text-sm text-slate-500">
            {selectedProjectId ? 'No screening responses for this project' : 'No screening responses yet'}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Use &ldquo;Dispatch Screening&rdquo; to send questions to an expert.
          </p>
        </Card>
      )}

      {/* Responses table */}
      {!responsesQuery.isLoading && responses.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Expert</th>
                  <th className="px-4 py-3">Question</th>
                  <th className="px-4 py-3">Response</th>
                  <th className="px-4 py-3">Channel</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {responses.map((record) => {
                  const cfg = STATUS_CONFIG[record.status] ?? STATUS_CONFIG.PENDING;
                  return (
                    <tr key={record.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800 truncate max-w-[160px]">
                          {record.expert?.fullName ?? record.expertId.slice(0, 8)}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-slate-600 line-clamp-2 max-w-[200px]">
                          {record.question?.prompt ?? '—'}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {record.responseText ? (
                          <p className="text-xs text-slate-600 line-clamp-2 max-w-[200px]">{record.responseText}</p>
                        ) : (
                          <span className="text-xs text-slate-300 italic">No response yet</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                          {record.channel}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${cfg.color} ${cfg.bg} ${cfg.border}`}>
                          <span className="material-symbols-outlined text-xs">{cfg.icon}</span>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {record.score != null ? (
                          <div className="flex items-center gap-1.5">
                            <div className="h-1.5 w-10 rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${Number(record.score) >= 7 ? 'bg-emerald-500' : Number(record.score) >= 4 ? 'bg-amber-400' : 'bg-red-400'}`}
                                style={{ width: `${Math.min(100, Number(record.score) * 10)}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-slate-400 tabular-nums">{Number(record.score).toFixed(1)}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                        {formatRelative(record.updatedAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <ResponseActions
                          record={record}
                          onFollowUp={handleFollowUp}
                          onEscalate={handleEscalate}
                          onEdit={setEditingRecord}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
