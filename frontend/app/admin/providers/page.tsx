'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { listProjects } from '@/services/projectService';
import {
  bindProviderToProject,
  createProviderAccount,
  listProviderAccounts,
  testProviderConnection,
  updateProviderAccount
} from '@/services/providerService';
import type { ProviderType } from '@/types/provider';

const providerTypes: ProviderType[] = [
  'APOLLO',
  'SALES_NAV_WEBHOOK',
  'LEADMAGIC',
  'PROSPEO',
  'EXA',
  'ROCKETREACH',
  'WIZA',
  'FORAGER',
  'ZELIQ',
  'CONTACTOUT',
  'DATAGM',
  'PEOPLEDATALABS',
  'LINKEDIN',
  'EMAIL_PROVIDER',
  'TWILIO',
  'WHATSAPP_2CHAT',
  'RESPONDIO',
  'LINE',
  'WECHAT',
  'VIBER',
  'TELEGRAM',
  'KAKAOTALK',
  'VOICEMAIL_DROP',
  'YAY',
  'GOOGLE_SHEETS'
];

export default function ProviderAccountsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [providerType, setProviderType] = useState<ProviderType>('APOLLO');
  const [accountLabel, setAccountLabel] = useState('');
  const [credentialsJson, setCredentialsJson] = useState('{\n  "apiKey": ""\n}');
  const [projectId, setProjectId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const providerAccountsQuery = useQuery({
    queryKey: ['provider-accounts'],
    queryFn: () => listProviderAccounts()
  });
  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: () => listProjects()
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const parsedCredentials = JSON.parse(credentialsJson) as Record<string, unknown>;
      return createProviderAccount({
        providerType,
        accountLabel,
        credentials: parsedCredentials
      });
    },
    onSuccess: () => {
      setErrorMessage('');
      setAccountLabel('');
      void queryClient.invalidateQueries({ queryKey: ['provider-accounts'] });
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to create provider account');
    }
  });

  const projectOptions = projectsQuery.data ?? [];
  const selectedProjectId = projectId || projectOptions[0]?.id || '';

  const groupedAccounts = useMemo(() => {
    const activeAccounts = providerAccountsQuery.data ?? [];
    return activeAccounts.reduce<Record<string, typeof activeAccounts>>((accumulator, account) => {
      accumulator[account.providerType] = [...(accumulator[account.providerType] ?? []), account];
      return accumulator;
    }, {});
  }, [providerAccountsQuery.data]);

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <h1 className="text-lg font-semibold">Provider Accounts</h1>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm">Provider Type</label>
            <select
              value={providerType}
              onChange={(event) => setProviderType(event.target.value as ProviderType)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {providerTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm">Account Label</label>
            <Input value={accountLabel} onChange={(event) => setAccountLabel(event.target.value)} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm">Credentials JSON (masked on save)</label>
          <textarea
            value={credentialsJson}
            onChange={(event) => setCredentialsJson(event.target.value)}
            rows={6}
            className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
          />
        </div>
        {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
        <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !accountLabel}>
          {createMutation.isPending ? 'Creating...' : 'Create Provider Account'}
        </Button>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-base font-semibold">Bind to Project</h2>
        <select
          value={selectedProjectId}
          onChange={(event) => setProjectId(event.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {projectOptions.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </Card>

      {Object.entries(groupedAccounts).map(([groupProviderType, accounts]) => (
        <Card key={groupProviderType} className="space-y-3">
          <h3 className="text-base font-semibold">{groupProviderType}</h3>
          <div className="space-y-2">
            {accounts.map((account) => (
              <div key={account.id} className="rounded border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="font-medium">{account.accountLabel}</p>
                  <Badge tone={account.isActive ? 'success' : 'warning'}>
                    {account.isActive ? 'active' : 'inactive'}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500">
                  Credentials: {account.credentialFields.join(', ') || 'none'}
                </p>
                <p className="text-xs text-slate-500">
                  Health: {account.lastHealthStatus ?? 'unknown'}{' '}
                  {account.lastHealthError ? `(${account.lastHealthError})` : ''}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      void testProviderConnection(account.id).then(() =>
                        queryClient.invalidateQueries({ queryKey: ['provider-accounts'] })
                      );
                    }}
                  >
                    Test Connection
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      void updateProviderAccount(account.id, {
                        isActive: !account.isActive
                      }).then(() => queryClient.invalidateQueries({ queryKey: ['provider-accounts'] }));
                    }}
                  >
                    {account.isActive ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button
                    onClick={() => {
                      if (!selectedProjectId) {
                        return;
                      }
                      void bindProviderToProject(account.id, selectedProjectId);
                    }}
                  >
                    Bind to Project
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
