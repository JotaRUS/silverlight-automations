'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { listProviderAccounts } from '@/services/providerService';
import { createProject, updateProject } from '@/services/projectService';
import type { ProviderAccount, ProviderType } from '@/types/provider';

type WizardStep = 'basics' | 'sources' | 'done';

const GEOGRAPHY_OPTIONS = [
  { code: 'US', label: 'United States' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'CA', label: 'Canada' },
  { code: 'AU', label: 'Australia' },
  { code: 'SG', label: 'Singapore' },
  { code: 'JP', label: 'Japan' },
  { code: 'DE', label: 'Germany' },
  { code: 'FR', label: 'France' },
  { code: 'IN', label: 'India' },
  { code: 'BR', label: 'Brazil' }
];

const PROVIDER_DISPLAY_NAMES: Record<ProviderType, string> = {
  APOLLO: 'Apollo',
  SALES_NAV_WEBHOOK: 'Sales Navigator',
  LEADMAGIC: 'LeadMagic',
  PROSPEO: 'Prospeo',
  EXA: 'Exa.ai',
  ROCKETREACH: 'RocketReach',
  WIZA: 'Wiza',
  FORAGER: 'Forager',
  ZELIQ: 'Zeliq',
  CONTACTOUT: 'ContactOut',
  DATAGM: 'Datagma',
  PEOPLEDATALABS: 'People Data Labs',
  LINKEDIN: 'LinkedIn',
  EMAIL_PROVIDER: 'Email',
  TWILIO: 'Twilio',
  WHATSAPP_2CHAT: 'WhatsApp (2Chat)',
  RESPONDIO: 'Respond.io',
  LINE: 'LINE',
  WECHAT: 'WeChat',
  VIBER: 'Viber',
  TELEGRAM: 'Telegram',
  KAKAOTALK: 'KakaoTalk',
  VOICEMAIL_DROP: 'Voicemail Drop',
  YAY: 'Yay.com',
  GOOGLE_SHEETS: 'Google Sheets'
};

const PROVIDER_TYPE_TO_FIELD: Record<ProviderType, string> = {
  APOLLO: 'apolloProviderAccountId',
  SALES_NAV_WEBHOOK: 'salesNavWebhookProviderAccountId',
  LEADMAGIC: 'leadmagicProviderAccountId',
  PROSPEO: 'prospeoProviderAccountId',
  EXA: 'exaProviderAccountId',
  ROCKETREACH: 'rocketreachProviderAccountId',
  WIZA: 'wizaProviderAccountId',
  FORAGER: 'foragerProviderAccountId',
  ZELIQ: 'zeliqProviderAccountId',
  CONTACTOUT: 'contactoutProviderAccountId',
  DATAGM: 'datagmProviderAccountId',
  PEOPLEDATALABS: 'peopledatalabsProviderAccountId',
  LINKEDIN: 'linkedinProviderAccountId',
  EMAIL_PROVIDER: 'emailProviderAccountId',
  TWILIO: 'twilioProviderAccountId',
  WHATSAPP_2CHAT: 'whatsapp2chatProviderAccountId',
  RESPONDIO: 'respondioProviderAccountId',
  LINE: 'lineProviderAccountId',
  WECHAT: 'wechatProviderAccountId',
  VIBER: 'viberProviderAccountId',
  TELEGRAM: 'telegramProviderAccountId',
  KAKAOTALK: 'kakaotalkProviderAccountId',
  VOICEMAIL_DROP: 'voicemailDropProviderAccountId',
  YAY: 'yayProviderAccountId',
  GOOGLE_SHEETS: 'googleSheetsProviderAccountId'
};

interface ProviderCategory {
  key: string;
  label: string;
  icon: string;
  types: ProviderType[];
}

const PROVIDER_CATEGORIES: ProviderCategory[] = [
  {
    key: 'sourcing',
    label: 'Lead Sourcing',
    icon: 'person_search',
    types: ['APOLLO', 'SALES_NAV_WEBHOOK']
  },
  {
    key: 'enrichment',
    label: 'Data Enrichment',
    icon: 'database',
    types: ['LEADMAGIC', 'PROSPEO', 'EXA', 'ROCKETREACH', 'WIZA', 'FORAGER', 'ZELIQ', 'CONTACTOUT', 'DATAGM', 'PEOPLEDATALABS']
  },
  {
    key: 'outreach',
    label: 'Outreach Channels',
    icon: 'campaign',
    types: ['LINKEDIN', 'EMAIL_PROVIDER', 'TWILIO', 'WHATSAPP_2CHAT', 'RESPONDIO', 'LINE', 'WECHAT', 'VIBER', 'TELEGRAM', 'KAKAOTALK', 'VOICEMAIL_DROP']
  },
  {
    key: 'operations',
    label: 'Calling & Operations',
    icon: 'call',
    types: ['YAY', 'GOOGLE_SHEETS']
  }
];

export default function NewProjectWizardPage(): JSX.Element {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>('basics');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [targetThreshold, setTargetThreshold] = useState('10');
  const [priority, setPriority] = useState('0');
  const [selectedGeos, setSelectedGeos] = useState<string[]>(['US']);

  const [projectId, setProjectId] = useState('');
  const [createError, setCreateError] = useState('');

  // providerAccountId -> true/false
  const [selectedProviders, setSelectedProviders] = useState<Record<string, boolean>>({});
  const [bindError, setBindError] = useState('');

  const providersQuery = useQuery({
    queryKey: ['providerAccounts', 'active'],
    queryFn: () => listProviderAccounts({ isActive: true })
  });

  const accountsByType = useMemo(() => {
    const map = new Map<ProviderType, ProviderAccount[]>();
    for (const acct of providersQuery.data ?? []) {
      const list = map.get(acct.providerType) ?? [];
      list.push(acct);
      map.set(acct.providerType, list);
    }
    return map;
  }, [providersQuery.data]);

  const createMutation = useMutation({
    mutationFn: async () => {
      return createProject({
        name,
        description: description || undefined,
        targetThreshold: Number(targetThreshold) || 10,
        geographyIsoCodes: selectedGeos,
        priority: Number(priority) || 0,
        overrideCooldown: false,
        regionConfig: {}
      });
    },
    onSuccess: (project) => {
      setProjectId(project.id);
      setStep('sources');
      setCreateError('');
    },
    onError: (err) => {
      setCreateError(err instanceof Error ? err.message : 'Failed to create project');
    }
  });

  const bindMutation = useMutation({
    mutationFn: async () => {
      const bindings: Record<string, string> = {};
      const allAccounts = providersQuery.data ?? [];

      for (const acct of allAccounts) {
        if (selectedProviders[acct.id]) {
          const field = PROVIDER_TYPE_TO_FIELD[acct.providerType];
          bindings[field] = acct.id;
        }
      }

      if (Object.keys(bindings).length === 0) {
        throw new Error('Select at least one lead source');
      }

      return updateProject(projectId, bindings as never);
    },
    onSuccess: () => {
      setStep('done');
      setBindError('');
    },
    onError: (err) => {
      setBindError(err instanceof Error ? err.message : 'Failed to bind providers');
    }
  });

  const toggleProvider = useCallback((accountId: string, providerType: ProviderType) => {
    setSelectedProviders((prev) => {
      const next = { ...prev };
      if (next[accountId]) {
        delete next[accountId];
      } else {
        const allAccounts = providersQuery.data ?? [];
        for (const other of allAccounts) {
          if (other.providerType === providerType && other.id !== accountId) {
            delete next[other.id];
          }
        }
        next[accountId] = true;
      }
      return next;
    });
  }, [providersQuery.data]);

  const toggleGeo = useCallback((code: string) => {
    setSelectedGeos((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  }, []);

  const goToLeads = useCallback(() => {
    router.push(`/admin/leads?projectId=${projectId}`);
  }, [router, projectId]);

  const selectedCount = Object.values(selectedProviders).filter(Boolean).length;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        <StepIndicator num={1} label="Project Details" active={step === 'basics'} done={step !== 'basics'} />
        <div className="h-px flex-1 bg-slate-200" />
        <StepIndicator num={2} label="Lead Sources" active={step === 'sources'} done={step === 'done'} />
        <div className="h-px flex-1 bg-slate-200" />
        <StepIndicator num={3} label="Start Prospecting" active={step === 'done'} done={false} />
      </div>

      {/* Step 1: Project basics */}
      {step === 'basics' && (
        <Card className="space-y-5">
          <div>
            <h2 className="text-lg font-bold">Create a New Project</h2>
            <p className="text-sm text-slate-500">Set up the basics — you can always change these later.</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Project Name *</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. APAC Fintech Experts Q1" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
              <textarea
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary min-h-[60px] resize-y"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of who you're sourcing..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Target Experts *</label>
                <Input type="number" value={targetThreshold} onChange={(e) => setTargetThreshold(e.target.value)} min="1" />
                <p className="mt-1 text-xs text-slate-400">How many experts you need</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Priority</label>
                <select
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                >
                  <option value="0">Low (0)</option>
                  <option value="1">Medium (1)</option>
                  <option value="2">High (2)</option>
                  <option value="3">Critical (3)</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Target Geography *</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {GEOGRAPHY_OPTIONS.map((geo) => (
                  <button
                    key={geo.code}
                    onClick={() => toggleGeo(geo.code)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      selectedGeos.includes(geo.code)
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    {geo.code} — {geo.label}
                  </button>
                ))}
              </div>
              {selectedGeos.length === 0 && (
                <p className="mt-1 text-xs text-red-500">Select at least one geography</p>
              )}
            </div>
          </div>

          {createError && <p className="text-sm text-red-600">{createError}</p>}

          <div className="flex justify-end">
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!name || selectedGeos.length === 0 || createMutation.isPending}
            >
              {createMutation.isPending ? 'Creating...' : 'Create & Continue'}
              <span className="material-symbols-outlined text-base">arrow_forward</span>
            </Button>
          </div>
        </Card>
      )}

      {/* Step 2: Lead Sources — provider account selection matrix */}
      {step === 'sources' && (
        <Card className="space-y-5">
          <div>
            <h2 className="text-lg font-bold">Select Lead Sources</h2>
            <p className="text-sm text-slate-500">
              Choose which configured tools to use for this project. Only accounts with saved API keys or credentials are shown.
            </p>
          </div>

          {providersQuery.isLoading && (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
              Loading configured providers...
            </div>
          )}

          {providersQuery.isSuccess && (providersQuery.data ?? []).length === 0 && (
            <div className="rounded-lg border-2 border-dashed border-slate-200 p-8 text-center">
              <span className="material-symbols-outlined text-4xl text-slate-300 mb-2">key_off</span>
              <p className="text-sm font-medium text-slate-600">No provider accounts configured</p>
              <p className="text-xs text-slate-400 mt-1">
                Go to <button onClick={() => router.push('/admin/settings')} className="text-primary underline">Settings</button> to
                add API keys for your lead sourcing, enrichment, and outreach tools.
              </p>
            </div>
          )}

          {providersQuery.isSuccess && (providersQuery.data ?? []).length > 0 && (
            <div className="space-y-5">
              {PROVIDER_CATEGORIES.map((cat) => {
                const available = cat.types.filter((t) => (accountsByType.get(t)?.length ?? 0) > 0);
                if (available.length === 0) return null;

                return (
                  <div key={cat.key}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="material-symbols-outlined text-base text-slate-500">{cat.icon}</span>
                      <h3 className="text-sm font-semibold text-slate-700">{cat.label}</h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {available.flatMap((provType) =>
                        (accountsByType.get(provType) ?? []).map((acct) => {
                          const isSelected = !!selectedProviders[acct.id];
                          const displayName = PROVIDER_DISPLAY_NAMES[acct.providerType];
                          return (
                            <button
                              key={acct.id}
                              type="button"
                              onClick={() => toggleProvider(acct.id, acct.providerType)}
                              className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${
                                isSelected
                                  ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                              }`}
                            >
                              <div
                                className={`flex size-5 shrink-0 items-center justify-center rounded border transition-colors ${
                                  isSelected
                                    ? 'border-primary bg-primary text-white'
                                    : 'border-slate-300 bg-white'
                                }`}
                              >
                                {isSelected && (
                                  <span className="material-symbols-outlined text-sm">check</span>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-slate-800 truncate">
                                  {displayName} — {acct.accountLabel}
                                </p>
                                {acct.lastHealthStatus && (
                                  <p className={`text-[11px] ${
                                    acct.lastHealthStatus === 'ok' ? 'text-emerald-600' : 'text-amber-600'
                                  }`}>
                                    {acct.lastHealthStatus === 'ok' ? 'Connected' : acct.lastHealthStatus}
                                  </p>
                                )}
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}

              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <span className="material-symbols-outlined text-base text-slate-400">info</span>
                <p className="text-xs text-slate-400">
                  {selectedCount} source{selectedCount !== 1 ? 's' : ''} selected.
                  Only one account per tool type can be bound to a project.
                </p>
              </div>
            </div>
          )}

          {bindError && <p className="text-sm text-red-600">{bindError}</p>}

          <div className="flex justify-between">
            <Button onClick={() => setStep('done')} className="bg-slate-100 text-slate-700 hover:bg-slate-200">
              Skip for now
            </Button>
            <Button
              onClick={() => bindMutation.mutate()}
              disabled={selectedCount === 0 || bindMutation.isPending}
            >
              {bindMutation.isPending ? 'Saving...' : `Bind ${selectedCount} Source${selectedCount !== 1 ? 's' : ''} & Continue`}
              <span className="material-symbols-outlined text-base">arrow_forward</span>
            </Button>
          </div>
        </Card>
      )}

      {/* Step 3: Done */}
      {step === 'done' && (
        <Card className="space-y-5 text-center py-8">
          <div className="flex justify-center">
            <div className="size-16 rounded-full bg-emerald-100 flex items-center justify-center">
              <span className="material-symbols-outlined text-3xl text-emerald-600">check_circle</span>
            </div>
          </div>
          <div>
            <h2 className="text-lg font-bold">Project Created!</h2>
            <p className="text-sm text-slate-500 mt-1">
              Your project is set up with the selected lead sources. Head to the Leads page to
              watch leads flow through the pipeline in real time.
            </p>
          </div>
          <div className="flex justify-center gap-3">
            <Button onClick={() => router.push('/admin/projects')} className="bg-slate-100 text-slate-700 hover:bg-slate-200">
              Back to Projects
            </Button>
            <Button onClick={goToLeads}>
              <span className="material-symbols-outlined text-base">visibility</span>
              View Leads Live
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function StepIndicator({ num, label, active, done }: { num: number; label: string; active: boolean; done: boolean }): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <div className={`size-8 rounded-full flex items-center justify-center text-sm font-bold ${
        done ? 'bg-emerald-500 text-white' : active ? 'bg-primary text-white' : 'bg-slate-100 text-slate-400'
      }`}>
        {done ? <span className="material-symbols-outlined text-sm">check</span> : num}
      </div>
      <span className={`text-sm font-medium hidden sm:inline ${active ? 'text-slate-800' : 'text-slate-400'}`}>
        {label}
      </span>
    </div>
  );
}
