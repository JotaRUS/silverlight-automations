'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PROVIDER_DISPLAY_NAMES } from '@/lib/providerConstants';
import { ApiError } from '@/services/apiClient';
import {
  createProviderAccount,
  deleteLinkedInWebhookSubscription,
  listLinkedInLeadForms,
  listProviderAccounts,
  registerLinkedInWebhook,
  testProviderConnection,
  updateProviderAccount,
  updateSyncedForms,
  type LeadFormSummary
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
  'ANYLEADS',
  'EMAIL_PROVIDER',
  'TWILIO',
  'VOICEMAIL_DROP',
  'WHATSAPP_2CHAT',
  'RESPONDIO',
  'LINE',
  'WECHAT',
  'VIBER',
  'TELEGRAM',
  'KAKAOTALK',
  'YAY',
  'GOOGLE_SHEETS',
  'SUPABASE'
];

interface CredentialFieldDef {
  key: string;
  label: string;
  type?: 'text' | 'password' | 'textarea';
  placeholder?: string;
  optional?: boolean;
}

const CREDENTIAL_FIELDS: Record<ProviderType, CredentialFieldDef[]> = {
  APOLLO: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter API key' }],
  SALES_NAV_WEBHOOK: [
    { key: 'clientId', label: 'Client ID', type: 'text', placeholder: 'e.g. 77vlauv23ezc0v' },
    { key: 'clientSecret', label: 'Client Secret', type: 'password', placeholder: 'Primary client secret' },
    { key: 'organizationId', label: 'Organization ID', type: 'text', placeholder: 'LinkedIn org ID (numeric, from company page URL)' }
  ],
  LEADMAGIC: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter API key' }],
  PROSPEO: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter API key' }],
  EXA: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter API key' }],
  ROCKETREACH: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter API key' }],
  WIZA: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter API key' }],
  FORAGER: [
    { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter API key' },
    { key: 'accountId', label: 'Account ID', type: 'text', placeholder: 'Forager account ID (from dashboard URL)' }
  ],
  ZELIQ: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter API key' }],
  CONTACTOUT: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter API key' }],
  DATAGM: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter API key' }],
  PEOPLEDATALABS: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter API key' }],
  ANYLEADS: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter Anyleads API key' }],
  LINKEDIN: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter API key' }],
  EMAIL_PROVIDER: [
    { key: 'host', label: 'SMTP Host', type: 'text', placeholder: 'smtp.sendgrid.net' },
    { key: 'port', label: 'SMTP Port', type: 'text', placeholder: '587' },
    { key: 'user', label: 'SMTP Username', type: 'text', placeholder: 'apikey (literal for SendGrid)' },
    { key: 'pass', label: 'SMTP Password / API Key', type: 'password', placeholder: 'Your SendGrid API key' },
    { key: 'from', label: 'From Address', type: 'text', placeholder: 'outreach@yourdomain.com' }
  ],
  TWILIO: [
    { key: 'accountSid', label: 'Account SID', type: 'text', placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
    { key: 'authToken', label: 'Auth Token', type: 'password', placeholder: 'Enter auth token' },
    { key: 'fromNumber', label: 'From Number', type: 'text', placeholder: '+15551234567' }
  ],
  WHATSAPP_2CHAT: [
    { key: 'apiKey', label: 'API Key', type: 'password', placeholder: '2Chat user API key' },
    { key: 'fromNumber', label: 'From WhatsApp Number', type: 'text', placeholder: '+15551234567' }
  ],
  RESPONDIO: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter API key' }],
  LINE: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter API key' }],
  WECHAT: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter API key' }],
  VIBER: [
    { key: 'apiKey', label: 'Auth Token', type: 'password', placeholder: 'Viber bot auth token' },
    { key: 'senderName', label: 'Sender Name', type: 'text', placeholder: 'Your Bot Name (max 28 chars)' }
  ],
  TELEGRAM: [{ key: 'botToken', label: 'Bot Token', type: 'password', placeholder: 'Enter bot token' }],
  KAKAOTALK: [{ key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter API key' }],
  VOICEMAIL_DROP: [
    { key: 'accountSid', label: 'Account SID', type: 'text', placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
    { key: 'authToken', label: 'Auth Token', type: 'password', placeholder: 'Twilio auth token' },
    { key: 'fromNumber', label: 'From Number', type: 'text', placeholder: '+15551234567' }
  ],
  YAY: [
    { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter API key' },
    { key: 'webhookSecret', label: 'Webhook Secret', type: 'password', placeholder: 'Enter webhook secret' }
  ],
  GOOGLE_SHEETS: [
    { key: 'spreadsheetId', label: 'Spreadsheet ID', type: 'text', placeholder: 'e.g. 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms' },
    { key: 'serviceAccountJson', label: 'Service Account JSON', type: 'textarea', placeholder: 'Paste service account JSON here' }
  ],
  SUPABASE: [
    { key: 'projectUrl', label: 'Project URL', type: 'text', placeholder: 'https://your-project.supabase.co' },
    { key: 'serviceRoleKey', label: 'Service Role Key', type: 'password', placeholder: 'Supabase service role key' },
    { key: 'schema', label: 'Schema', type: 'text', placeholder: 'public' },
    { key: 'tableName', label: 'Table Name', type: 'text', placeholder: 'enriched_leads' },
    { key: 'upsertKey', label: 'Upsert Key', type: 'text', placeholder: 'lead_id' },
    { key: 'columnEmail', label: 'Email Column', type: 'text', placeholder: 'primary_email', optional: true },
    { key: 'columnPhone', label: 'Phone Column', type: 'text', placeholder: 'primary_phone', optional: true },
    { key: 'columnCountry', label: 'Country Column', type: 'text', placeholder: 'country_iso', optional: true },
    { key: 'columnCurrentCompany', label: 'Current Company Column', type: 'text', placeholder: 'company_name', optional: true },
    { key: 'columnLinkedinUrl', label: 'LinkedIn URL Column', type: 'text', placeholder: 'linkedin_url', optional: true },
    { key: 'columnJobTitle', label: 'Job Title Column', type: 'text', placeholder: 'job_title', optional: true }
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

  const allFilled = fields.every((f) => f.optional || (creds[f.key] ?? '').trim().length > 0);

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

function LinkedInLeadSyncPanel({ accountId }: { accountId: string }): JSX.Element {
  const queryClient = useQueryClient();
  const [forms, setForms] = useState<LeadFormSummary[] | null>(null);
  const [selectedFormIds, setSelectedFormIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState('');
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const loadForms = async (): Promise<void> => {
    setLoading('forms');
    setMessage(null);
    try {
      const data = await listLinkedInLeadForms(accountId);
      setForms(data);
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to load forms' });
    } finally {
      setLoading('');
    }
  };

  const saveForms = async (): Promise<void> => {
    setLoading('save-forms');
    setMessage(null);
    try {
      await updateSyncedForms(accountId, Array.from(selectedFormIds));
      setMessage({ tone: 'success', text: 'Synced forms updated.' });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to save' });
    } finally {
      setLoading('');
    }
  };

  const enableWebhook = async (): Promise<void> => {
    setLoading('webhook');
    setMessage(null);
    try {
      const result = await registerLinkedInWebhook(accountId);
      setMessage({ tone: 'success', text: `Webhook registered (ID: ${result.subscriptionId})` });
      void queryClient.invalidateQueries({ queryKey: ['provider-accounts'] });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to register webhook' });
    } finally {
      setLoading('');
    }
  };

  const disableWebhook = async (subscriptionId: string): Promise<void> => {
    setLoading('webhook');
    setMessage(null);
    try {
      await deleteLinkedInWebhookSubscription(accountId, subscriptionId);
      setMessage({ tone: 'success', text: 'Webhook subscription removed.' });
      void queryClient.invalidateQueries({ queryKey: ['provider-accounts'] });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to remove webhook' });
    } finally {
      setLoading('');
    }
  };

  return (
    <div className="mt-3 space-y-3 rounded-md border border-indigo-200 bg-indigo-50/40 p-3">
      <p className="text-sm font-semibold text-indigo-800">LinkedIn Lead Sync</p>

      {message ? (
        <p className={`text-xs ${message.tone === 'success' ? 'text-emerald-700' : 'text-red-600'}`}>
          {message.text}
        </p>
      ) : null}

      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-700">Lead Forms</p>
        {forms === null ? (
          <Button
            variant="secondary"
            onClick={() => void loadForms()}
            disabled={loading === 'forms'}
          >
            {loading === 'forms' ? 'Loading...' : 'Load Lead Forms'}
          </Button>
        ) : forms.length === 0 ? (
          <p className="text-xs text-slate-500">No lead forms found for this organization.</p>
        ) : (
          <>
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {forms.map((form) => (
                <label key={form.id} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={selectedFormIds.has(form.id)}
                    onChange={(e) => {
                      setSelectedFormIds((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(form.id);
                        else next.delete(form.id);
                        return next;
                      });
                    }}
                  />
                  <span className="font-medium">{form.name}</span>
                  <Badge tone={form.state === 'PUBLISHED' ? 'success' : 'neutral'}>
                    {form.state.toLowerCase()}
                  </Badge>
                  <span className="text-slate-400">{form.questionCount} questions</span>
                </label>
              ))}
            </div>
            <Button
              variant="secondary"
              onClick={() => void saveForms()}
              disabled={loading === 'save-forms' || selectedFormIds.size === 0}
            >
              {loading === 'save-forms' ? 'Saving...' : 'Save Form Selection'}
            </Button>
          </>
        )}
      </div>

      <div className="space-y-2 border-t border-indigo-200 pt-2">
        <p className="text-xs font-medium text-slate-700">Real-time Webhook</p>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => void enableWebhook()}
            disabled={loading === 'webhook'}
          >
            {loading === 'webhook' ? 'Processing...' : 'Enable Real-time Lead Sync'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => void disableWebhook('latest')}
            disabled={loading === 'webhook'}
          >
            Disable
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function ProviderAccountsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [providerType, setProviderType] = useState<ProviderType>('APOLLO');
  const [accountLabel, setAccountLabel] = useState('');
  const [credentials, setCredentials] = useState<Record<string, string>>(() => buildEmptyCredentials('APOLLO'));
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

  const activeFields = CREDENTIAL_FIELDS[providerType];
  const allFieldsFilled = activeFields.every((f) => f.optional || (credentials[f.key] ?? '').trim().length > 0);

  const createMutation = useMutation({
    mutationFn: async () => {
      const filteredCredentials = Object.fromEntries(
        Object.entries(credentials).filter(([key, value]) => {
          const field = activeFields.find((f) => f.key === key);
          if (field?.optional && !value.trim()) return false;
          return true;
        })
      );
      return createProviderAccount({
        providerType,
        accountLabel,
        credentials: filteredCredentials
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
                  {PROVIDER_DISPLAY_NAMES[type]}
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
          {activeFields.map((field, idx) => {
            const isFirstOptional = field.optional && (idx === 0 || !activeFields[idx - 1].optional);
            return (
              <div key={field.key}>
                {isFirstOptional ? (
                  <div className="mt-4 mb-2 border-t border-slate-200 pt-4">
                    <p className="text-sm font-medium text-slate-700">Column Mapping <span className="text-xs font-normal text-slate-500">(match your Supabase table columns)</span></p>
                  </div>
                ) : null}
                <label className="mb-1 block text-sm text-slate-600">
                  {field.label}
                  {field.optional ? <span className="ml-1 text-xs text-slate-400">(optional)</span> : null}
                </label>
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
            );
          })}
        </div>

        {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
        <Button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending || !accountLabel || !allFieldsFilled}
        >
          {createMutation.isPending ? 'Creating...' : 'Create Provider Account'}
        </Button>
      </Card>

      {Object.entries(groupedAccounts).map(([groupProviderType, accounts]) => (
        <Card key={groupProviderType} className="space-y-3">
          <h3 className="text-base font-semibold">
            {PROVIDER_DISPLAY_NAMES[groupProviderType as ProviderType] ?? groupProviderType}
          </h3>
          <div className="space-y-2">
            {accounts.map((account) => (
              <div
                key={account.id}
                className={`rounded border p-3 ${
                  account.lastHealthStatus === 'out_of_credits'
                    ? 'border-amber-300 bg-amber-50/60'
                    : 'border-slate-200'
                }`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <p className="font-medium">{account.accountLabel}</p>
                  <div className="flex items-center gap-2">
                    {account.lastHealthStatus === 'out_of_credits' ? (
                      <Badge tone="danger">out of credits</Badge>
                    ) : null}
                    <Badge tone={account.isActive ? 'success' : 'warning'}>
                      {account.isActive ? 'active' : 'inactive'}
                    </Badge>
                  </div>
                </div>
                {account.lastHealthStatus === 'out_of_credits' ? (
                  <div className="mb-2 rounded-md border border-amber-200 bg-amber-100 px-3 py-2 text-sm text-amber-900">
                    This account is out of credits or the subscription has expired.
                    Top up your balance, then click <strong>Test Connection</strong> to re-enable it.
                  </div>
                ) : null}
                <p className="text-xs text-slate-500">
                  Credentials: {account.credentialFields.join(', ') || 'none'}
                </p>
                <p className="text-xs text-slate-500">
                  Health: {account.lastHealthStatus ?? 'unknown'}{' '}
                  {account.lastHealthError && account.lastHealthStatus !== 'out_of_credits'
                    ? `(${formatHealthMessage(account.lastHealthError)})`
                    : ''}
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
                {account.providerType === 'SALES_NAV_WEBHOOK' &&
                  account.lastHealthStatus === 'healthy' ? (
                  <LinkedInLeadSyncPanel accountId={account.id} />
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
