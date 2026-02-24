'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { fetchRanking } from '@/services/adminService';

export default function RankingDashboardPage(): JSX.Element {
  const [projectId, setProjectId] = useState('');
  const rankingQuery = useQuery({
    queryKey: ['ranking', projectId],
    queryFn: () => fetchRanking(projectId || undefined)
  });

  return (
    <div className="space-y-6">
      <Card className="space-y-2">
        <h1 className="text-lg font-semibold">Ranking Dashboard</h1>
        <Input
          placeholder="Filter by project id"
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
        />
      </Card>

      <Card>
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="p-2">Rank</th>
                <th className="p-2">Expert</th>
                <th className="p-2">Score</th>
                <th className="p-2">Reason</th>
                <th className="p-2">Project</th>
              </tr>
            </thead>
            <tbody>
              {rankingQuery.data?.map((record) => (
                <tr key={String(record.id)} className="border-b border-slate-100">
                  <td className="p-2">{String(record.rank)}</td>
                  <td className="p-2">
                    {String((record.expert as { fullName?: string } | undefined)?.fullName ?? record.expertId ?? '-')}
                  </td>
                  <td className="p-2">{String(record.score)}</td>
                  <td className="p-2">{String(record.reason)}</td>
                  <td className="p-2">
                    {String((record.project as { name?: string } | undefined)?.name ?? record.projectId ?? '-')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
