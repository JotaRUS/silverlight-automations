'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { fetchLeadExplorer } from '@/services/adminService';

export default function LeadExplorerPage(): JSX.Element {
  const [projectId, setProjectId] = useState('');
  const [status, setStatus] = useState('');
  const [cooldownBlocked, setCooldownBlocked] = useState<'true' | 'false' | ''>('');

  const leadsQuery = useQuery({
    queryKey: ['lead-explorer', { projectId, status, cooldownBlocked }],
    queryFn: () =>
      fetchLeadExplorer({
        projectId: projectId || undefined,
        status: status || undefined,
        cooldownBlocked: cooldownBlocked || undefined
      })
  });

  return (
    <div className="space-y-6">
      <Card className="space-y-3">
        <h1 className="text-lg font-semibold">Lead / Expert Explorer</h1>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <Input
            placeholder="Filter by project id"
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
          />
          <Input
            placeholder="Filter by lead status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          />
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={cooldownBlocked}
            onChange={(event) => setCooldownBlocked(event.target.value as 'true' | 'false' | '')}
          >
            <option value="">Cooldown filter</option>
            <option value="true">Blocked</option>
            <option value="false">Not blocked</option>
          </select>
        </div>
      </Card>

      <Card>
        <p className="mb-3 text-sm text-slate-600">
          Total leads: {leadsQuery.data?.total ?? 0}
        </p>
        <div className="max-h-[540px] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="p-2">Lead</th>
                <th className="p-2">Project</th>
                <th className="p-2">Status</th>
                <th className="p-2">Contacts</th>
              </tr>
            </thead>
            <tbody>
              {leadsQuery.data?.leads.map((lead) => (
                <tr key={String(lead.id)} className="border-b border-slate-100">
                  <td className="p-2">
                    <p className="font-medium">{String(lead.fullName ?? lead.firstName ?? lead.id)}</p>
                    <p className="text-xs text-slate-500">{String(lead.linkedinUrl ?? '')}</p>
                  </td>
                  <td className="p-2">{String((lead.project as { name?: string })?.name ?? lead.projectId ?? '-')}</td>
                  <td className="p-2">{String(lead.status ?? '-')}</td>
                  <td className="p-2">
                    {(lead.expert as { contacts?: { value?: string }[] } | undefined)?.contacts
                      ?.map((contact) => contact.value)
                      .filter(Boolean)
                      .join(', ') ?? '-'}
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
