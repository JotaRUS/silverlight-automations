'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PROVIDER_DISPLAY_NAMES } from '@/lib/providerConstants';
import { listProjects } from '@/services/projectService';
import { ApiError } from '@/services/apiClient';
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

interface CredentialFieldDef {
  key: string;
  label: string;
  type?: 'text' | 'password' | 'textarea';
  placeholder?: string;
}

const CREDENTIAL_FIELDS: Record<ProviderType, CredentialFieldDef[]> = {
  APOLLO: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter API key' }],
  SALES_NAV_WEBHOOK: [
    { key: 'clientId', label: 'Client ID', type: 'text', placeholder: 'e.g. 77vlauv23ezc0v' },
    { key: 'clientSecret', label: 'Client Secret', type: 'password', placeholder: 'Enter primary client secret' }
  ],
  LEADMAGIC: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter API key' }],
  PROSPEO: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter API key' }],
  EXA: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter API key' }],
  ROCKETREACH: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter API key' }],
  WIZA: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter API key' }],
  FORAGER: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter API key' }],
  ZELIQ: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter API key' }],
  CONTACTOUT: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter API key' }],
  DATAGM: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter API key' }],
  PEOPLEDATALABS: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter API key' }],
  LINKEDIN: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter API key' }],
  EMAIL_PROVIDER: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter API key' }],
  TWILIO: [
    { key: 'accountSid', label: 'Account SID', type: 'text', placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
    { key: 'authToken', label: 'Auth Token', type: 'password', placeholder: 'Enter auth token' }
  ],
  WHATSAPP_2CHAT: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter API key' }],
  RESPONDIO: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter API key' }],
  LINE: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter API key' }],
  WECHAT: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter API key' }],
  VIBER: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter API key' }],
  TELEGRAM: [{ key: 'botToken', label: 'Bot Token', type: 'password', placeholder: 'Enter bot token' }],
  KAKAOTALK: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter API key' }],
  VOICEMAIL_DROP: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter API key' }],
  YAY: [
    { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter API key' },
    { key: 'webhookSecret', label: 'Webhook Secret', type: 'password', placeholder: 'Enter webhook secret' }
  ],
  GOOGLE_SHEETS: [
    { key: 'spreadsheetId', label: 'Spreadsheet ID', type: 'text', placeholder: 'e.g. 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms' },
    { key: 'serviceAccountJson', label: 'Service Account JSON', type: 'textarea', placeholder: 'Paste service account JSON here' }
  ]
};

function buildEmptyCredentials(pt: ProviderType): Record<string, string> {
  const fields = CREDENTIAL_FIELDS[pt];
  const result: Record<string, string> = {};
  for (const field of fields) {
    result[field.key] = '';
  }
  return result;
}

function formatHealthMessage(raw: string | null): string {
  if (!raw) {
    return 'Provider marked as unhealthy.';
  }
  try {
    const parsed = JSON.parse(raw) as { reason?: unknown };
    if (typeof parsed.reason === 'string' && parsed.reason.trim().length > 0) {
      return parsed.reason;
    }
  } catch {
    // keep plain-string message
  }
  return raw;
}

function UpdateCredentialsForm({
  accountId,
  providerType: pt,
  onDone
}: {
  accountId: string;
  providerType: ProviderType;
  onDone: () => void;
}): JSX.Element {
  const queryClient = useQueryClient();
  const fields = CREDENTIAL_FIELDS[pt];
  const [creds, setCreds] = useState<Record<string, string>>(() => buildEmptyCredentials(pt));
  const [error, setError] = useState('');

  const allFilled = fields.every((f) => (creds[f.key] ?? '').trim().length > 0);

  const mutation = useMutation({
    mutationFn: () => updateProviderAccount(accountId, { credentials: creds }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['provider-accounts'] });
      onDone();
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Update failed')
  });

  return (
    <div className="mt-3 space-y-2 rounded-md border border-indigo-200 bg-indigo-50/50 p-3">
      <p className="text-sm font-medium text-indigo-700">Update Credentials</p>
      {fields.map((field) => (
        <div key={field.key}>
          <label className="mb-1 block text-xs text-slate-600">{field.label}</label>
          {field.type === 'textarea' ? (
            <textarea
              value={creds[field.key] ?? ''}
              onChange={(e) => setCreds((p) => ({ ...p, [field.key]: e.target.value }))}
              placeholder={field.placeholder}
              rows={3}
              className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
            />
          ) : (
            <Input
              type={field.type ?? 'text'}
              value={creds[field.key] ?? ''}
              onChange={(e) => setCreds((p) => ({ ...p, [field.key]: e.target.value }))}
              placeholder={field.placeholder}
            />
          )}
        </div>
      ))}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      <div className="flex gap-2">
        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !allFilled}
        >
          {mutation.isPending ? 'Saving...' : 'Save Credentials'}
        </Button>
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}

export default function ProviderAccountsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [providerType, setProviderType] = useState<ProviderType>('APOLLO');
  const [accountLabel, setAccountLabel] = useState('');
  const [credentials, setCredentials] = useState<Record<string, string>>(() => buildEmptyCredentials('APOLLO'));
  const [projectId, setProjectId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [editingCredentials, setEditingCredentials] = useState<string | null>(null);
  const [accountActionFeedback, setAccountActionFeedback] = useState<
    Record<string, { tone: 'success' | 'error'; message: string }>
  >({});

  const handleProviderTypeChange = useCallback((newType: ProviderType) => {
    setProviderType(newType);
    setCredentials(buildEmptyCredentials(newType));
  }, []);

  const setCredentialField = useCallback((key: string, value: string) => {
    setCredentials((prev) => ({ ...prev, [key]: value }));
  }, []);

  const providerAccountsQuery = useQuery({
    queryKey: ['provider-accounts'],
    queryFn: () => listProviderAccounts()
  });
  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: () => listProjects()
  });

  const activeFields = CREDENTIAL_FIELDS[providerType];
  const allFieldsFilled = activeFields.every((f) => (credentials[f.key] ?? '').trim().length > 0);

  const createMutation = useMutation({
    mutationFn: async () => {
      return createProviderAccount({
        providerType,
        accountLabel,
        credentials
      });
    },
    onSuccess: () => {
      setErrorMessage('');
      setAccountLabel('');
      setCredentials(buildEmptyCredentials(providerType));
      void queryClient.invalidateQueries({ queryKey: ['provider-accounts'] });
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : 'Unable to create provider account';
      const code = error instanceof ApiError ? ` (code: ${error.code})` : '';
      setErrorMessage(`${msg}${code}`);
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
            <label className="mb-1 block text-sm font-medium">Provider Type</label>
            <select
              value={providerType}
              onChange={(event) => handleProviderTypeChange(event.target.value as ProviderType)}
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
            <label className="mb-1 block text-sm font-medium">Account Label</label>
            <Input
              value={accountLabel}
              onChange={(event) => setAccountLabel(event.target.value)}
              placeholder="e.g. Production, Staging, Team-A"
            />
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium">Credentials <span className="text-xs font-normal text-slate-500">(encrypted at rest)</span></p>
          {activeFields.map((field) => (
            <div key={field.key}>
              <label className="mb-1 block text-sm text-slate-600">{field.label}</label>
              {field.type === 'textarea' ? (
                <textarea
                  value={credentials[field.key] ?? ''}
                  onChange={(event) => setCredentialField(field.key, event.target.value)}
                  placeholder={field.placeholder}
                  rows={4}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
                />
              ) : (
                <Input
                  type={field.type ?? 'text'}
                  value={credentials[field.key] ?? ''}
                  onChange={(event) => setCredentialField(field.key, event.target.value)}
                  placeholder={field.placeholder}
                />
              )}
            </div>
          ))}
        </div>

        {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
        <Button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending || !accountLabel || !allFieldsFilled}
        >
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
          <h3 className="text-base font-semibold">
            {PROVIDER_DISPLAY_NAMES[groupProviderType as ProviderType] ?? groupProviderType}
          </h3>
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
                  {account.lastHealthError ? `(${formatHealthMessage(account.lastHealthError)})` : ''}
                </p>
                {account.lastHealthError ? (
                  <details className="mt-2 rounded border border-slate-200 bg-slate-50 p-2">
                    <summary className="cursor-pointer text-xs font-medium text-slate-700">
                      Health Debug Details
                    </summary>
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-[11px] text-slate-600">
                      {account.lastHealthError}
                    </pre>
                  </details>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      void (async () => {
                        try {
                          const updated = await testProviderConnection(account.id);
                          await queryClient.invalidateQueries({ queryKey: ['provider-accounts'] });
                          if (updated.lastHealthStatus === 'healthy') {
                            setAccountActionFeedback((prev) => ({
                              ...prev,
                              [account.id]: {
                                tone: 'success',
                                message: 'Connection is healthy.'
                              }
                            }));
                            return;
                          }
                          const reason = formatHealthMessage(updated.lastHealthError);
                          setAccountActionFeedback((prev) => ({
                            ...prev,
                            [account.id]: {
                              tone: 'error',
                              message: `Connection check completed: ${reason}`
                            }
                          }));
                        } catch (error) {
                          setAccountActionFeedback((prev) => ({
                            ...prev,
                            [account.id]: {
                              tone: 'error',
                              message:
                                error instanceof Error
                                  ? error.message
                                  : 'Connection check failed.'
                            }
                          }));
                        }
                      })();
                    }}
                  >
                    Test Connection
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      void (async () => {
                        try {
                          await updateProviderAccount(account.id, {
                            isActive: !account.isActive
                          });
                          await queryClient.invalidateQueries({ queryKey: ['provider-accounts'] });
                          setAccountActionFeedback((prev) => ({
                            ...prev,
                            [account.id]: {
                              tone: 'success',
                              message: `Account ${account.isActive ? 'deactivated' : 'activated'}.`
                            }
                          }));
                        } catch (error) {
                          setAccountActionFeedback((prev) => ({
                            ...prev,
                            [account.id]: {
                              tone: 'error',
                              message:
                                error instanceof Error
                                  ? error.message
                                  : 'Unable to update account status.'
                            }
                          }));
                        }
                      })();
                    }}
                  >
                    {account.isActive ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setEditingCredentials(editingCredentials === account.id ? null : account.id)}
                  >
                    Update Credentials
                  </Button>
                  <Button
                    onClick={() => {
                      if (!selectedProjectId) {
                        return;
                      }
                      void (async () => {
                        try {
                          await bindProviderToProject(account.id, selectedProjectId);
                          setAccountActionFeedback((prev) => ({
                            ...prev,
                            [account.id]: {
                              tone: 'success',
                              message: 'Provider bound to project.'
                            }
                          }));
                        } catch (error) {
                          setAccountActionFeedback((prev) => ({
                            ...prev,
                            [account.id]: {
                              tone: 'error',
                              message:
                                error instanceof Error
                                  ? error.message
                                  : 'Unable to bind provider to project.'
                            }
                          }));
                        }
                      })();
                    }}
                  >
                    Bind to Project
                  </Button>
                </div>
                {accountActionFeedback[account.id] ? (
                  <p
                    className={`mt-2 text-xs ${
                      accountActionFeedback[account.id].tone === 'success'
                        ? 'text-emerald-700'
                        : 'text-red-600'
                    }`}
                  >
                    {accountActionFeedback[account.id].message}
                  </p>
                ) : null}
                {editingCredentials === account.id ? (
                  <UpdateCredentialsForm
                    accountId={account.id}
                    providerType={account.providerType as ProviderType}
                    onDone={() => setEditingCredentials(null)}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
