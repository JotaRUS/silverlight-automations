'use client';

import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';

import { Card } from '@/components/ui/card';
import { useSocket } from '@/hooks/useSocket';
import { fetchLeadExplorer } from '@/services/adminService';
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
  createdAt: string;
  project?: { id: string; name: string };
  expert?: {
    fullName?: string;
    contacts?: { type: string; value: string; verificationStatus?: string }[];
  };
}

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

export default function LeadsPage(): JSX.Element {
  const searchParams = useSearchParams();
  const initialProjectId = searchParams.get('projectId') ?? '';

  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId);
  const [filterStatus, setFilterStatus] = useState<LeadStatus | ''>('');
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [socketConnected, setSocketConnected] = useState(false);

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

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: () => listProjects()
  });

  const leadsQuery = useQuery({
    queryKey: ['leads-pipeline', selectedProjectId, filterStatus, refreshNonce],
    queryFn: () =>
      fetchLeadExplorer({
        projectId: selectedProjectId || undefined,
        status: filterStatus || undefined
      }),
    refetchInterval: 10_000
  });

  const leads = (leadsQuery.data?.leads ?? []) as unknown as LeadRecord[];

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const lead of leads) {
      counts[lead.status] = (counts[lead.status] ?? 0) + 1;
    }
    return counts;
  }, [leads]);

  const filteredLeads = useMemo(() => {
    if (!filterStatus) return leads;
    return leads.filter((l) => l.status === filterStatus);
  }, [leads, filterStatus]);

  return (
    <div className="space-y-6">
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
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary"
          value={selectedProjectId}
          onChange={(e) => setSelectedProjectId(e.target.value)}
        >
          <option value="">All projects</option>
          {projectsQuery.data?.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as LeadStatus | '')}
        >
          <option value="">All statuses</option>
          {PIPELINE_STAGES.map((s) => (
            <option key={s.status} value={s.status}>{s.label}</option>
          ))}
        </select>
        <span className="ml-auto text-xs text-slate-400">
          {leadsQuery.data?.total ?? 0} lead{(leadsQuery.data?.total ?? 0) !== 1 ? 's' : ''}
        </span>
      </Card>

      {/* Pipeline stage cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {PIPELINE_STAGES.map((stage) => {
          const count = stageCounts[stage.status] ?? 0;
          const isActive = filterStatus === stage.status;
          return (
            <button
              key={stage.status}
              onClick={() => setFilterStatus(isActive ? '' : stage.status)}
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
      {!leadsQuery.isLoading && leads.length === 0 && (
        <Card className="py-12 text-center">
          <span className="material-symbols-outlined text-4xl text-slate-300">group_add</span>
          <p className="mt-2 text-sm text-slate-500">
            {selectedProjectId ? 'No leads for this project yet' : 'No leads in the system yet'}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Leads will appear here automatically as the SalesNav scraper sends them in
          </p>
        </Card>
      )}

      {/* Leads table */}
      {!leadsQuery.isLoading && filteredLeads.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Lead</th>
                  <th className="px-4 py-3">Project</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Contacts</th>
                  <th className="px-4 py-3">Confidence</th>
                  <th className="px-4 py-3">Added</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLeads.map((lead) => {
                  const badge = statusBadge(lead.status);
                  const contacts = lead.expert?.contacts ?? [];
                  const emails = contacts.filter((c) => c.type === 'EMAIL');
                  const phones = contacts.filter((c) => c.type === 'PHONE');
                  return (
                    <tr key={lead.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-slate-800">
                            {lead.fullName ?? ([lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'Unknown')}
                          </p>
                          {lead.jobTitle && (
                            <p className="text-xs text-slate-400 line-clamp-1">{lead.jobTitle}</p>
                          )}
                          {lead.linkedinUrl && (
                            <a
                              href={lead.linkedinUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-primary hover:underline"
                            >
                              LinkedIn ↗
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {lead.project?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${badge.class}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {(lead.countryIso || lead.regionIso) ? (
                          <span className="inline-flex rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                            {[lead.countryIso, lead.regionIso].filter(Boolean).join(' / ')}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-0.5">
                          {emails.length > 0 && (
                            <p className="text-xs text-slate-600 flex items-center gap-1">
                              <span className="material-symbols-outlined text-xs text-slate-400">mail</span>
                              {emails[0].value}
                            </p>
                          )}
                          {phones.length > 0 && (
                            <p className="text-xs text-slate-600 flex items-center gap-1">
                              <span className="material-symbols-outlined text-xs text-slate-400">call</span>
                              {phones[0].value}
                            </p>
                          )}
                          {contacts.length === 0 && <span className="text-xs text-slate-300">—</span>}
                        </div>
                      </td>
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
                      <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                        {formatRelative(lead.createdAt)}
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
