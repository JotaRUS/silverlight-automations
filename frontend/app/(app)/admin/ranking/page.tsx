'use client';

import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useSocket } from '@/hooks/useSocket';
import {
  fetchRanking,
  type RankingProjectSummary,
  type RankingSnapshot
} from '@/services/adminService';
import { listProjects } from '@/services/projectService';

type SortKey = 'rank' | 'expert' | 'project' | 'score' | 'reason' | 'phone' | 'country' | 'boosts';
type SortDir = 'asc' | 'desc';

function boostBadges(meta: RankingSnapshot['metadata']): JSX.Element[] {
  if (!meta) return [];
  const badges: JSX.Element[] = [];
  if (meta.freshReplyBoost) {
    badges.push(<Badge key="fresh" tone="success">Fresh reply</Badge>);
  }
  if (meta.signupChaseBoost) {
    badges.push(<Badge key="chase" tone="warning">Signup chase</Badge>);
  }
  if (meta.highValueRejectionBoost) {
    badges.push(<Badge key="reject" tone="danger">Callback chase</Badge>);
  }
  return badges;
}

function boostLabel(meta: RankingSnapshot['metadata']): string {
  if (!meta) return '';
  if (meta.freshReplyBoost) return 'Fresh reply';
  if (meta.signupChaseBoost) return 'Signup chase';
  if (meta.highValueRejectionBoost) return 'Callback chase';
  return 'Base';
}

function humanReason(meta: RankingSnapshot['metadata']): string {
  if (!meta) return '—';
  const parts: string[] = [];
  if (meta.freshReplyBoost) parts.push('Fresh reply');
  if (meta.signupChaseBoost) parts.push('Signup chase');
  if (meta.highValueRejectionBoost) parts.push('Callback chase');
  const deficit = typeof meta.completionDeficit === 'number' ? meta.completionDeficit : meta.completionPenalty;
  if (typeof deficit === 'number' && deficit > 0) {
    parts.push(`Deficit ${deficit.toFixed(0)}%`);
  }
  if (typeof meta.verifiedContactCount === 'number') {
    parts.push(`${meta.verifiedContactCount} contact${meta.verifiedContactCount !== 1 ? 's' : ''}`);
  }
  if (typeof meta.callAttemptCount === 'number' && meta.callAttemptCount > 0) {
    parts.push(`${meta.callAttemptCount} attempt${meta.callAttemptCount !== 1 ? 's' : ''}`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'Base';
}

function primaryPhone(snapshot: RankingSnapshot): string | null {
  const phone = snapshot.expert?.contacts.find((c) => c.type === 'PHONE');
  return phone?.value ?? null;
}

function completionPct(summary: RankingProjectSummary): number {
  const raw = Number(summary.completionPercentage);
  return isNaN(raw) ? 0 : raw;
}

function getSortValue(snapshot: RankingSnapshot, key: SortKey, index: number): string | number {
  switch (key) {
    case 'rank': return index;
    case 'expert': return snapshot.expert?.fullName?.toLowerCase() ?? '';
    case 'project': return snapshot.project?.name?.toLowerCase() ?? '';
    case 'score': return Number(snapshot.score);
    case 'reason': return humanReason(snapshot.metadata);
    case 'phone': return primaryPhone(snapshot) ?? '';
    case 'country': return snapshot.expert?.countryIso?.toLowerCase() ?? '';
    case 'boosts': return boostLabel(snapshot.metadata);
  }
}

function SortArrow({ active, dir }: { active: boolean; dir: SortDir }): JSX.Element {
  return (
    <span className={`ml-1 inline-block transition-colors ${active ? 'text-primary' : 'text-slate-300'}`}>
      {dir === 'asc' ? '↑' : '↓'}
    </span>
  );
}

function SkeletonRow(): JSX.Element {
  return (
    <tr>
      <td className="p-3"><div className="h-4 w-6 animate-pulse rounded bg-slate-100" /></td>
      <td className="p-3"><div className="h-4 w-32 animate-pulse rounded bg-slate-100" /></td>
      <td className="p-3"><div className="h-4 w-24 animate-pulse rounded bg-slate-100" /></td>
      <td className="p-3"><div className="h-4 w-12 animate-pulse rounded bg-slate-100" /></td>
      <td className="p-3"><div className="h-4 w-40 animate-pulse rounded bg-slate-100" /></td>
      <td className="p-3"><div className="h-4 w-28 animate-pulse rounded bg-slate-100" /></td>
      <td className="p-3"><div className="h-4 w-10 animate-pulse rounded bg-slate-100" /></td>
      <td className="p-3"><div className="h-4 w-20 animate-pulse rounded bg-slate-100" /></td>
    </tr>
  );
}

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'rank', label: '#' },
  { key: 'expert', label: 'Expert' },
  { key: 'project', label: 'Project' },
  { key: 'score', label: 'Score' },
  { key: 'reason', label: 'Reason' },
  { key: 'phone', label: 'Phone' },
  { key: 'country', label: 'Country' },
  { key: 'boosts', label: 'Boosts' },
];

export default function RankingDashboardPage(): JSX.Element {
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const bumpNonce = useCallback(() => setRefreshNonce((v) => v + 1), []);
  const stableRef = useRef(bumpNonce);
  stableRef.current = bumpNonce;
  const stableHandler = useCallback(() => stableRef.current(), []);

  useSocket('/admin', 'ranking.updated', stableHandler);

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: () => listProjects()
  });

  const rankingQuery = useQuery({
    queryKey: ['ranking', selectedProjectId, refreshNonce],
    queryFn: () => fetchRanking(selectedProjectId || undefined),
    refetchInterval: 60_000
  });

  const snapshots = rankingQuery.data?.snapshots ?? [];
  const projectSummaries = rankingQuery.data?.projectSummaries ?? [];

  const sortedSnapshots = useMemo(() => {
    const indexed = snapshots.map((s, i) => ({ snapshot: s, originalIndex: i }));
    indexed.sort((a, b) => {
      const va = getSortValue(a.snapshot, sortKey, a.originalIndex);
      const vb = getSortValue(b.snapshot, sortKey, b.originalIndex);
      let cmp: number;
      if (typeof va === 'number' && typeof vb === 'number') {
        cmp = va - vb;
      } else {
        cmp = String(va).localeCompare(String(vb));
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return indexed.map((item) => item.snapshot);
  }, [snapshots, sortKey, sortDir]);

  const maxScore = snapshots.length > 0
    ? Math.max(...snapshots.map((s) => Number(s.score)))
    : 1;

  function handleSort(key: SortKey): void {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'score' ? 'desc' : 'asc');
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Expert Ranking</h1>
          <p className="text-sm text-slate-500">
            Priority-ranked experts for call allocation across all active projects
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Live
        </span>
      </div>

      {/* Filter + Project Summaries */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
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
          <span className="text-xs text-slate-400">
            {snapshots.length} expert{snapshots.length !== 1 ? 's' : ''} ranked
          </span>
        </div>

        {/* Project completion cards */}
        {projectSummaries.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {projectSummaries.map((ps) => {
              const pct = completionPct(ps);
              return (
                <div
                  key={ps.id}
                  className={`rounded-lg border p-3 ${selectedProjectId === ps.id ? 'border-primary bg-primary/5' : 'border-slate-200'}`}
                >
                  <p className="truncate text-sm font-medium text-slate-800">{ps.name}</p>
                  <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500">
                    <span>{ps.signedUpCount} / {ps.targetThreshold} signed up</span>
                    <span className="font-medium">{pct.toFixed(0)}%</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full transition-all ${
                        pct >= 80 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-400' : 'bg-red-400'
                      }`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Error banner */}
      {rankingQuery.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load ranking data. Retrying automatically...
        </div>
      )}

      {/* Ranking table */}
      <Card>
        <div className="overflow-x-auto" style={{ maxHeight: 'calc(100vh - 420px)' }}>
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className="p-3 font-semibold cursor-pointer select-none hover:text-slate-700 transition-colors"
                    onClick={() => handleSort(col.key)}
                  >
                    {col.label}
                    <SortArrow active={sortKey === col.key} dir={sortKey === col.key ? sortDir : 'asc'} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rankingQuery.isLoading && (
                <>
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                </>
              )}
              {!rankingQuery.isLoading && snapshots.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-16 text-center">
                    <span className="material-symbols-outlined mb-2 block text-4xl text-slate-300">
                      leaderboard
                    </span>
                    <p className="text-sm text-slate-400">No ranking snapshots yet</p>
                    <p className="text-xs text-slate-300">
                      Rankings are computed every 60 seconds for callable experts
                    </p>
                  </td>
                </tr>
              )}
              {sortedSnapshots.map((snapshot, index) => {
                const score = Number(snapshot.score);
                const phone = primaryPhone(snapshot);
                const scorePct = maxScore > 0 ? (score / maxScore) * 100 : 0;

                return (
                  <tr key={snapshot.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-medium text-slate-400">{index + 1}</td>
                    <td className="p-3">
                      <p className="font-medium text-slate-800 truncate max-w-[200px]">
                        {snapshot.expert?.fullName ?? '—'}
                      </p>
                    </td>
                    <td className="p-3">
                      <p className="text-slate-600 truncate max-w-[160px]">
                        {snapshot.project?.name ?? '—'}
                      </p>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800 tabular-nums w-8">{score.toFixed(1)}</span>
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${Math.min(100, score)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-xs text-slate-500 max-w-[240px] truncate">
                      {humanReason(snapshot.metadata)}
                    </td>
                    <td className="p-3">
                      {phone ? (
                        <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                          <span className="material-symbols-outlined text-xs">call</span>
                          {phone}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                    <td className="p-3 text-xs text-slate-500">
                      {snapshot.expert?.countryIso ?? '—'}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {boostBadges(snapshot.metadata)}
                        {boostBadges(snapshot.metadata).length === 0 && (
                          <span className="text-xs text-slate-300">Base</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
