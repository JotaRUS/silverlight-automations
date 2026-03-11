'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Card } from '@/components/ui/card';
import { useSocket } from '@/hooks/useSocket';
import { deleteLead, fetchLeadExplorer, updateLead, type LeadExplorerResponse } from '@/services/adminService';
import { listProjects } from '@/services/projectService';

type LeadStatus = 'NEW' | 'ENRICHING' | 'ENRICHED' | 'OUTREACH_PENDING' | 'CONTACTED' | 'REPLIED' | 'DISQUALIFIED' | 'CONVERTED';

const PIPELINE_STAGES: { status: LeadStatus; label: string; icon: string; color: string; bg: string }[] = [
  { status: 'NEW', label: 'New', icon: 'person_add', color: 'text-slate-600', bg: 'bg-slate-100' },
  { status: 'ENRICHING', label: 'Enriching', icon: 'search', color: 'text-amber-600', bg: 'bg-amber-50' },
  { status: 'ENRICHED', label: 'Enriched', icon: 'verified', color: 'text-blue-600', bg: 'bg-blue-50' },
  { status: 'OUTREACH_PENDING', label: 'Outreach Pending', icon: 'schedule_send', color: 'text-indigo-600', bg: 'bg-indigo-50' },
  { status: 'CONTACTED', label: 'Contacted', icon: 'send', color: 'text-purple-600', bg: 'bg-purple-50' },
  { status: 'REPLIED', label: 'Replied', icon: 'reply', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { status: 'CONVERTED', label: 'Converted', icon: 'check_circle', color: 'text-green-700', bg: 'bg-green-50' },
  { status: 'DISQUALIFIED', label: 'Disqualified', icon: 'block', color: 'text-red-600', bg: 'bg-red-50' }
];

interface EnrichmentAttemptRecord {
  provider: string;
  status: string;
  confidenceScore?: number;
  attemptedAt: string;
}

interface LeadRecord {
  id: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  jobTitle?: string;
  linkedinUrl?: string;
  regionIso?: string;
  countryIso?: string;
  status: LeadStatus;
  enrichmentConfidence?: number;
  googleSheetsExportedAt?: string | null;
  supabaseExportedAt?: string | null;
  createdAt: string;
  metadata?: { city?: string; state?: string; country?: string; companyName?: string; [key: string]: unknown };
  project?: { id: string; name: string };
  expert?: {
    fullName?: string;
    currentCompany?: string;
    contacts?: { type: string; value: string; verificationStatus?: string }[];
  };
  enrichmentAttempts?: EnrichmentAttemptRecord[];
}

type ColumnKey = 'firstName' | 'lastName' | 'jobTitle' | 'currentCompany' | 'status' | 'location' | 'email' | 'phone' | 'linkedin' | 'confidence' | 'exported' | 'added' | 'actions';

const ALL_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: 'firstName', label: 'First Name' },
  { key: 'lastName', label: 'Last Name' },
  { key: 'jobTitle', label: 'Job Title' },
  { key: 'currentCompany', label: 'Current Company' },
  { key: 'status', label: 'Status' },
  { key: 'location', label: 'Location' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'confidence', label: 'Confidence' },
  { key: 'exported', label: 'Exported' },
  { key: 'added', label: 'Added' },
  { key: 'actions', label: 'Actions' }
];

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;

function statusBadge(status: LeadStatus): { label: string; class: string } {
  const stage = PIPELINE_STAGES.find((s) => s.status === status);
  if (!stage) return { label: status, class: 'text-slate-600 bg-slate-100 border-slate-200' };
  const borderMap: Record<string, string> = {
    'bg-slate-100': 'border-slate-200',
    'bg-amber-50': 'border-amber-200',
    'bg-blue-50': 'border-blue-200',
    'bg-indigo-50': 'border-indigo-200',
    'bg-purple-50': 'border-purple-200',
    'bg-emerald-50': 'border-emerald-200',
    'bg-green-50': 'border-green-200',
    'bg-red-50': 'border-red-200'
  };
  return { label: stage.label, class: `${stage.color} ${stage.bg} ${borderMap[stage.bg] ?? 'border-slate-200'}` };
}

const ENRICHMENT_PROVIDER_LABELS: Record<string, string> = {
  APOLLO: 'Apollo', LEADMAGIC: 'LeadMagic', PROSPEO: 'Prospeo', EXA: 'Exa',
  ROCKETREACH: 'RocketReach', WIZA: 'Wiza', FORAGER: 'Forager', ZELIQ: 'Zeliq',
  CONTACTOUT: 'ContactOut', DATAGM: 'DataGM', PEOPLEDATALABS: 'PeopleDataLabs', ANYLEADS: 'AnyLeads'
};

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

function LeadActions({
  lead,
  onStatusChange,
  onDelete
}: {
  lead: LeadRecord;
  onStatusChange: (id: string, status: LeadStatus) => void;
  onDelete: (id: string) => void;
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
            <p className="px-3 py-1.5 text-[10px] font-bold uppercase text-slate-400 tracking-wider">Change Status</p>
            {PIPELINE_STAGES.map((stage) => (
              <button
                key={stage.status}
                disabled={lead.status === stage.status}
                onClick={() => {
                  onStatusChange(lead.id, stage.status);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-slate-50 transition-colors ${lead.status === stage.status ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <span className={`material-symbols-outlined text-base ${stage.color}`}>{stage.icon}</span>
                {stage.label}
              </button>
            ))}
            <div className="border-t border-slate-100 my-1" />
            <button
              onClick={() => {
                onDelete(lead.id);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 flex items-center gap-2 text-red-600 hover:bg-red-50 transition-colors"
            >
              <span className="material-symbols-outlined text-base">delete</span>
              Delete Lead
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function PaginationBar({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange
}: {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-slate-500">
          Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, totalItems)} of {totalItems}
        </span>
        <select
          className="rounded border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-primary"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>{size} / page</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:pointer-events-none"
          title="First page"
        >
          <span className="material-symbols-outlined text-base">first_page</span>
        </button>
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:pointer-events-none"
          title="Previous"
        >
          <span className="material-symbols-outlined text-base">chevron_left</span>
        </button>
        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
          let pageNum: number;
          if (totalPages <= 5) {
            pageNum = i + 1;
          } else if (currentPage <= 3) {
            pageNum = i + 1;
          } else if (currentPage >= totalPages - 2) {
            pageNum = totalPages - 4 + i;
          } else {
            pageNum = currentPage - 2 + i;
          }
          return (
            <button
              key={pageNum}
              onClick={() => onPageChange(pageNum)}
              className={`size-7 rounded text-xs font-medium transition-colors ${
                pageNum === currentPage
                  ? 'bg-primary text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {pageNum}
            </button>
          );
        })}
        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:pointer-events-none"
          title="Next"
        >
          <span className="material-symbols-outlined text-base">chevron_right</span>
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:pointer-events-none"
          title="Last page"
        >
          <span className="material-symbols-outlined text-base">last_page</span>
        </button>
      </div>
    </div>
  );
}

function ColumnToggle({
  visibleColumns,
  onToggle
}: {
  visibleColumns: Record<ColumnKey, boolean>;
  onToggle: (key: ColumnKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
      >
        <span className="material-symbols-outlined text-sm">view_column</span>
        Columns
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-48 rounded-lg border border-slate-200 bg-white shadow-lg py-1">
          {ALL_COLUMNS.filter((c) => c.key !== 'actions').map((col) => (
            <label key={col.key} className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-slate-50 cursor-pointer">
              <input
                type="checkbox"
                checked={visibleColumns[col.key]}
                onChange={() => onToggle(col.key)}
                className="rounded border-slate-300"
              />
              {col.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LeadsPage(): JSX.Element {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const initialProjectId = searchParams.get('projectId') ?? '';

  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId);
  const [filterStatus, setFilterStatus] = useState<LeadStatus | ''>('');
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [socketConnected, setSocketConnected] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>(() => {
    const defaults: Record<ColumnKey, boolean> = {} as Record<ColumnKey, boolean>;
    for (const col of ALL_COLUMNS) defaults[col.key] = true;
    return defaults;
  });

  useSocket('/admin', 'lead.ingested', () => {
    setRefreshNonce((v) => v + 1);
    setSocketConnected(true);
  });
  useSocket('/admin', 'lead.enriched', () => {
    setRefreshNonce((v) => v + 1);
    setSocketConnected(true);
  });
  useSocket('/admin', 'outreach.thread.updated', () => {
    setRefreshNonce((v) => v + 1);
    setSocketConnected(true);
  });
  useSocket('/admin', 'outreach.reply.received', () => {
    setRefreshNonce((v) => v + 1);
    setSocketConnected(true);
  });

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: () => listProjects()
  });

  useEffect(() => {
    if (!selectedProjectId && projectsQuery.data && projectsQuery.data.length > 0) {
      setSelectedProjectId(projectsQuery.data[0].id);
    }
  }, [projectsQuery.data, selectedProjectId]);

  const leadsQuery = useQuery<LeadExplorerResponse>({
    queryKey: ['leads-pipeline', selectedProjectId, filterStatus, currentPage, pageSize, refreshNonce],
    queryFn: () =>
      fetchLeadExplorer({
        projectId: selectedProjectId || undefined,
        status: filterStatus || undefined,
        page: currentPage,
        pageSize
      }),
    enabled: !!selectedProjectId,
    refetchInterval: 10_000
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: LeadStatus }) => updateLead(id, { status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leads-pipeline'] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteLead(id),
    onSuccess: () => {
      setConfirmDelete(null);
      void queryClient.invalidateQueries({ queryKey: ['leads-pipeline'] });
    }
  });

  const handleStatusChange = useCallback(
    (id: string, status: LeadStatus) => updateMutation.mutate({ id, status }),
    [updateMutation]
  );

  const handleDelete = useCallback(
    (id: string) => setConfirmDelete(id),
    []
  );

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  }, []);

  const toggleColumn = useCallback((key: ColumnKey) => {
    setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const leads = (leadsQuery.data?.leads ?? []) as unknown as LeadRecord[];
  const totalLeads = leadsQuery.data?.total ?? 0;
  const totalPages = leadsQuery.data?.totalPages ?? 1;

  const stageCounts = useMemo(() => {
    return leadsQuery.data?.statusCounts ?? {};
  }, [leadsQuery.data?.statusCounts]);

  const show = (key: ColumnKey) => visibleColumns[key];

  const noProjects = projectsQuery.isSuccess && (projectsQuery.data?.length ?? 0) === 0;

  if (noProjects) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold">Leads Pipeline</h2>
          <p className="text-sm text-slate-500">Watch leads flow through the sourcing pipeline in real-time</p>
        </div>
        <Card className="py-16 text-center space-y-3">
          <span className="material-symbols-outlined text-5xl text-slate-300">folder_open</span>
          <p className="text-sm font-medium text-slate-600">No projects yet</p>
          <p className="text-xs text-slate-400">Create your first project to start tracking leads.</p>
          <Link
            href="/admin/projects/new"
            className="inline-flex items-center gap-1.5 mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Create Project
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Delete confirmation dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                <span className="material-symbols-outlined">warning</span>
              </div>
              <div>
                <h3 className="font-semibold">Delete Lead</h3>
                <p className="text-sm text-slate-500">This action cannot be undone.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(confirmDelete)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-500 transition-colors disabled:opacity-60"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Leads Pipeline</h2>
          <p className="text-sm text-slate-500">Watch leads flow through the sourcing pipeline in real-time</p>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 rounded-full">
          <span className="relative flex h-2 w-2">
            {socketConnected && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            )}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${socketConnected ? 'bg-primary' : 'bg-slate-400'}`} />
          </span>
          <span className="text-[10px] font-bold text-primary uppercase">
            {socketConnected ? 'Live' : 'Polling 10s'}
          </span>
        </div>
      </div>

      {/* Filters */}
      <Card className="flex flex-wrap items-center gap-3">
        <span className="material-symbols-outlined text-slate-400">filter_list</span>
        <select
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          value={selectedProjectId}
          onChange={(e) => { setSelectedProjectId(e.target.value); setCurrentPage(1); }}
        >
          {projectsQuery.data?.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value as LeadStatus | ''); setCurrentPage(1); }}
        >
          <option value="">All statuses</option>
          {PIPELINE_STAGES.map((s) => (
            <option key={s.status} value={s.status}>{s.label}</option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-400">{totalLeads} lead{totalLeads !== 1 ? 's' : ''}</span>
          <ColumnToggle visibleColumns={visibleColumns} onToggle={toggleColumn} />
        </div>
      </Card>

      {/* Pipeline stage cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {PIPELINE_STAGES.map((stage) => {
          const count = stageCounts[stage.status] ?? 0;
          const isActive = filterStatus === stage.status;
          return (
            <button
              key={stage.status}
              onClick={() => { setFilterStatus(isActive ? '' : stage.status); setCurrentPage(1); }}
              className={`rounded-xl border p-3 text-center transition-all ${
                isActive
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <span className={`material-symbols-outlined text-xl ${stage.color}`}>{stage.icon}</span>
              <p className="text-lg font-bold mt-1 tabular-nums">{count}</p>
              <p className="text-[10px] font-medium text-slate-500 truncate">{stage.label}</p>
            </button>
          );
        })}
      </div>

      {/* Loading */}
      {leadsQuery.isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {/* Error */}
      {leadsQuery.error && (
        <Card className="border-red-200 bg-red-50 text-sm text-red-700">
          Failed to load leads: {leadsQuery.error instanceof Error ? leadsQuery.error.message : 'Unknown error'}
        </Card>
      )}

      {/* Empty state */}
      {!leadsQuery.isLoading && leads.length === 0 && selectedProjectId && (
        <Card className="py-12 text-center">
          <span className="material-symbols-outlined text-4xl text-slate-300">group_add</span>
          <p className="mt-2 text-sm text-slate-500">No leads for this project yet</p>
          <p className="mt-1 text-xs text-slate-400">
            Leads are sourced automatically. The auto-sourcing engine queues enrichment and outreach for active projects.
          </p>
        </Card>
      )}

      {/* Mutation feedback */}
      {updateMutation.isError && (
        <Card className="border-red-200 bg-red-50 text-sm text-red-700 flex items-center gap-2">
          <span className="material-symbols-outlined text-base">error</span>
          Failed to update: {updateMutation.error instanceof Error ? updateMutation.error.message : 'Unknown error'}
        </Card>
      )}

      {/* Leads table */}
      {!leadsQuery.isLoading && leads.length > 0 && (
        <Card className="overflow-hidden p-0">
          {/* Top pagination */}
          {totalPages > 1 && (
            <div className="border-b border-slate-100">
              <PaginationBar
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalLeads}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                onPageSizeChange={handlePageSizeChange}
              />
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {show('firstName') && <th className="px-4 py-3">First Name</th>}
                  {show('lastName') && <th className="px-4 py-3">Last Name</th>}
                  {show('jobTitle') && <th className="px-4 py-3">Job Title</th>}
                  {show('currentCompany') && <th className="px-4 py-3">Current Company</th>}
                  {show('status') && <th className="px-4 py-3">Status</th>}
                  {show('location') && <th className="px-4 py-3">Location</th>}
                  {show('email') && <th className="px-4 py-3">Email</th>}
                  {show('phone') && <th className="px-4 py-3">Phone</th>}
                  {show('linkedin') && <th className="px-4 py-3">LinkedIn</th>}
                  {show('confidence') && <th className="px-4 py-3">Confidence</th>}
                  {show('exported') && <th className="px-4 py-3">Exported</th>}
                  {show('added') && <th className="px-4 py-3">Added</th>}
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leads.map((lead) => {
                  const badge = statusBadge(lead.status);
                  const contacts = lead.expert?.contacts ?? [];
                  const emails = contacts.filter((c) => c.type === 'EMAIL');
                  const phones = contacts.filter((c) => c.type === 'PHONE');
                  const linkedinContact = contacts.find((c) => c.type === 'LINKEDIN');
                  const linkedinUrl = lead.linkedinUrl ?? linkedinContact?.value;
                  const locationParts = [
                    lead.metadata?.city,
                    lead.metadata?.state,
                    lead.countryIso
                  ].filter(Boolean);
                  const firstName = lead.firstName ?? lead.fullName?.split(' ')[0] ?? '';
                  const lastName = lead.lastName ?? (lead.fullName?.split(' ').slice(1).join(' ')) ?? '';
                  const currentCompany = lead.expert?.currentCompany ?? lead.metadata?.companyName ?? '';
                  return (
                    <tr key={lead.id} className="hover:bg-slate-50/50 transition-colors">
                      {show('firstName') && (
                        <td className="px-4 py-3 text-sm font-medium text-slate-800 whitespace-nowrap">
                          {firstName || <span className="text-slate-300">—</span>}
                        </td>
                      )}
                      {show('lastName') && (
                        <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">
                          {lastName || <span className="text-slate-300">—</span>}
                        </td>
                      )}
                      {show('jobTitle') && (
                        <td className="px-4 py-3 text-xs text-slate-600 max-w-[160px] truncate" title={lead.jobTitle ?? ''}>
                          {lead.jobTitle || <span className="text-slate-300">—</span>}
                        </td>
                      )}
                      {show('currentCompany') && (
                        <td className="px-4 py-3 text-xs text-slate-600 max-w-[140px] truncate" title={currentCompany}>
                          {currentCompany || <span className="text-slate-300">—</span>}
                        </td>
                      )}
                      {show('status') && (
                        <td className="px-4 py-3">
                          {lead.status === 'ENRICHED' && lead.enrichmentAttempts && lead.enrichmentAttempts.length > 0 ? (
                            <div className="group relative inline-flex">
                              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold cursor-default ${badge.class}`}>
                                {badge.label}
                              </span>
                              <div className="pointer-events-none absolute left-0 top-full z-20 mt-1.5 hidden w-56 rounded-lg border border-slate-200 bg-white p-2.5 shadow-lg group-hover:block">
                                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Enrichment providers</p>
                                <div className="space-y-1">
                                  {lead.enrichmentAttempts.map((attempt, i) => (
                                    <div key={i} className="flex items-center justify-between text-[11px]">
                                      <span className="font-medium text-slate-700">
                                        {ENRICHMENT_PROVIDER_LABELS[attempt.provider] ?? attempt.provider}
                                      </span>
                                      <span className={
                                        attempt.status === 'SUCCESS'
                                          ? 'text-emerald-600'
                                          : attempt.status === 'RATE_LIMITED'
                                            ? 'text-amber-600'
                                            : 'text-red-500'
                                      }>
                                        {attempt.status === 'SUCCESS' ? 'found data' : attempt.status === 'RATE_LIMITED' ? 'rate limited' : 'no data'}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${badge.class}`}>
                              {badge.label}
                            </span>
                          )}
                        </td>
                      )}
                      {show('location') && (
                        <td className="px-4 py-3">
                          {locationParts.length > 0 ? (
                            <span className="inline-flex rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600" title={locationParts.join(', ')}>
                              {locationParts.join(', ')}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>
                      )}
                      {show('email') && (
                        <td className="px-4 py-3">
                          {emails.length > 0 ? (
                            <p className="text-xs text-slate-600 flex items-center gap-1 max-w-[180px]" title={emails[0].value}>
                              <span className="material-symbols-outlined text-xs text-slate-400 shrink-0">mail</span>
                              <span className="truncate">{emails[0].value}</span>
                            </p>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>
                      )}
                      {show('phone') && (
                        <td className="px-4 py-3">
                          {phones.length > 0 ? (
                            <p className="text-xs text-slate-600 flex items-center gap-1">
                              <span className="material-symbols-outlined text-xs text-slate-400 shrink-0">call</span>
                              {phones[0].value}
                            </p>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>
                      )}
                      {show('linkedin') && (
                        <td className="px-4 py-3">
                          {linkedinUrl ? (
                            <a
                              href={linkedinUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
                              </svg>
                              Profile
                            </a>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>
                      )}
                      {show('confidence') && (
                        <td className="px-4 py-3">
                          {lead.enrichmentConfidence != null ? (
                            <div className="flex items-center gap-1.5">
                              <div className="h-1.5 w-12 rounded-full bg-slate-100 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${Number(lead.enrichmentConfidence) >= 0.7 ? 'bg-emerald-500' : Number(lead.enrichmentConfidence) >= 0.4 ? 'bg-amber-400' : 'bg-red-400'}`}
                                  style={{ width: `${Math.min(100, Number(lead.enrichmentConfidence) * 100)}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-slate-400 tabular-nums">
                                {(Number(lead.enrichmentConfidence) * 100).toFixed(0)}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>
                      )}
                      {show('exported') && (
                        <td className="px-4 py-3">
                          {(() => {
                            const destinations: { name: string; at: string }[] = [];
                            if (lead.googleSheetsExportedAt) destinations.push({ name: 'Google Sheets', at: lead.googleSheetsExportedAt });
                            if (lead.supabaseExportedAt) destinations.push({ name: 'Supabase', at: lead.supabaseExportedAt });
                            if (destinations.length === 0) {
                              return <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-400">No</span>;
                            }
                            return (
                              <div className="group relative inline-flex">
                                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 cursor-default">
                                  Yes
                                </span>
                                <div className="pointer-events-none absolute left-0 top-full z-20 mt-1.5 hidden w-52 rounded-lg border border-slate-200 bg-white p-2.5 shadow-lg group-hover:block">
                                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Export destinations</p>
                                  <div className="space-y-1">
                                    {destinations.map((dest) => (
                                      <div key={dest.name} className="flex items-center justify-between text-[11px]">
                                        <span className="font-medium text-slate-700">{dest.name}</span>
                                        <span className="text-emerald-600">{formatRelative(dest.at)}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </td>
                      )}
                      {show('added') && (
                        <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                          {formatRelative(lead.createdAt)}
                        </td>
                      )}
                      <td className="px-4 py-3 text-right">
                        <LeadActions
                          lead={lead}
                          onStatusChange={handleStatusChange}
                          onDelete={handleDelete}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Bottom pagination */}
          {totalPages > 1 && (
            <div className="border-t border-slate-100">
              <PaginationBar
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalLeads}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                onPageSizeChange={handlePageSizeChange}
              />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
