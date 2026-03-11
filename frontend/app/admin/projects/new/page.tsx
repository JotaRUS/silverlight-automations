'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CountryMultiSelect } from '@/components/ui/country-multi-select';
import { Input } from '@/components/ui/input';
import { TagInput } from '@/components/ui/tag-input';
import {
  EXPORT_DESTINATION_TYPES,
  OUTREACH_CHANNEL_TYPES,
  PROVIDER_CATEGORIES,
  PROVIDER_DISPLAY_NAMES,
  PROVIDER_TYPE_TO_FIELD,
  TEMPLATE_VARIABLES
} from '@/lib/providerConstants';
import { listProviderAccounts } from '@/services/providerService';
import {
  addProjectCompanies,
  addProjectJobTitles,
  createProject,
  updateProject
} from '@/services/projectService';
import type { ProviderAccount, ProviderType } from '@/types/provider';

type WizardStep = 'basics' | 'sources' | 'exports' | 'outreach' | 'done';

const SAMPLE_DATA: Record<string, string> = {
  '{{FirstName}}': 'Jane',
  '{{LastName}}': 'Doe',
  '{{Country}}': 'United States',
  '{{JobTitle}}': 'VP of Engineering',
  '{{CurrentCompany}}': 'Acme Corp'
};

export default function NewProjectWizardPage(): JSX.Element {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>('basics');
  const templateRef = useRef<HTMLTextAreaElement>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [targetThreshold, setTargetThreshold] = useState('10');
  const [priority, setPriority] = useState('0');
  const [selectedGeos, setSelectedGeos] = useState<string[]>(['US']);
  const [companyNames, setCompanyNames] = useState<string[]>([]);
  const [jobTitles, setJobTitles] = useState<string[]>([]);

  const [projectId, setProjectId] = useState('');
  const [createError, setCreateError] = useState('');

  const [selectedProviders, setSelectedProviders] = useState<Record<string, boolean>>({});
  const [selectedExports, setSelectedExports] = useState<Record<string, boolean>>({});
  const [selectedOutreach, setSelectedOutreach] = useState<Record<string, boolean>>({});
  const [outreachTemplate, setOutreachTemplate] = useState('');
  const [bindError, setBindError] = useState('');
  const [exportError, setExportError] = useState('');
  const [outreachError, setOutreachError] = useState('');

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

  const exportAccounts = useMemo(() => {
    const result: ProviderAccount[] = [];
    for (const t of EXPORT_DESTINATION_TYPES) {
      for (const acct of accountsByType.get(t) ?? []) {
        result.push(acct);
      }
    }
    return result;
  }, [accountsByType]);

  const outreachAccounts = useMemo(() => {
    const result: ProviderAccount[] = [];
    for (const t of OUTREACH_CHANNEL_TYPES) {
      for (const acct of accountsByType.get(t) ?? []) {
        if (acct.lastHealthStatus && acct.lastHealthStatus !== 'unhealthy' && acct.lastHealthStatus !== 'out_of_credits') result.push(acct);
      }
    }
    return result;
  }, [accountsByType]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const project = await createProject({
        name,
        description: description || undefined,
        targetThreshold: Number(targetThreshold) || 10,
        geographyIsoCodes: selectedGeos,
        priority: Number(priority) || 0,
        overrideCooldown: false,
        regionConfig: {}
      });

      await Promise.all([
        companyNames.length
          ? addProjectCompanies(
              project.id,
              companyNames.map((companyName) => ({ name: companyName }))
            )
          : Promise.resolve(),
        jobTitles.length
          ? addProjectJobTitles(
              project.id,
              jobTitles.map((title) => ({ title }))
            )
          : Promise.resolve()
      ]);

      return project;
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
      setStep('exports');
      setBindError('');
    },
    onError: (err) => {
      setBindError(err instanceof Error ? err.message : 'Failed to bind providers');
    }
  });

  const exportBindMutation = useMutation({
    mutationFn: async () => {
      const bindings: Record<string, string> = {};
      for (const acct of exportAccounts) {
        if (selectedExports[acct.id]) {
          const field = PROVIDER_TYPE_TO_FIELD[acct.providerType];
          bindings[field] = acct.id;
        }
      }
      if (Object.keys(bindings).length > 0) {
        return updateProject(projectId, bindings as never);
      }
    },
    onSuccess: () => {
      setStep('outreach');
      setExportError('');
    },
    onError: (err) => {
      setExportError(err instanceof Error ? err.message : 'Failed to bind export destinations');
    }
  });

  const outreachBindMutation = useMutation({
    mutationFn: async () => {
      if (!outreachTemplate.trim()) {
        throw new Error('Message template is required');
      }

      const bindings: Record<string, string | null> = {
        outreachMessageTemplate: outreachTemplate
      };
      for (const acct of outreachAccounts) {
        if (selectedOutreach[acct.id]) {
          const field = PROVIDER_TYPE_TO_FIELD[acct.providerType];
          bindings[field] = acct.id;
        }
      }

      return updateProject(projectId, bindings as never);
    },
    onSuccess: () => {
      setStep('done');
      setOutreachError('');
    },
    onError: (err) => {
      setOutreachError(err instanceof Error ? err.message : 'Failed to save outreach configuration');
    }
  });

  const toggleExport = useCallback((accountId: string, providerType: ProviderType) => {
    setSelectedExports((prev) => {
      const next = { ...prev };
      if (next[accountId]) {
        delete next[accountId];
      } else {
        for (const other of exportAccounts) {
          if (other.providerType === providerType && other.id !== accountId) {
            delete next[other.id];
          }
        }
        next[accountId] = true;
      }
      return next;
    });
  }, [exportAccounts]);

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

  const toggleOutreach = useCallback((accountId: string, providerType: ProviderType) => {
    setSelectedOutreach((prev) => {
      const next = { ...prev };
      if (next[accountId]) {
        delete next[accountId];
      } else {
        for (const other of outreachAccounts) {
          if (other.providerType === providerType && other.id !== accountId) {
            delete next[other.id];
          }
        }
        next[accountId] = true;
      }
      return next;
    });
  }, [outreachAccounts]);

  const insertVariable = useCallback((variable: string) => {
    const textarea = templateRef.current;
    if (!textarea) {
      setOutreachTemplate((prev) => prev + variable);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = outreachTemplate.slice(0, start);
    const after = outreachTemplate.slice(end);
    const newValue = before + variable + after;
    setOutreachTemplate(newValue);
    requestAnimationFrame(() => {
      textarea.focus();
      const cursorPos = start + variable.length;
      textarea.setSelectionRange(cursorPos, cursorPos);
    });
  }, [outreachTemplate]);

  const templatePreview = useMemo(() => {
    let preview = outreachTemplate;
    for (const [key, value] of Object.entries(SAMPLE_DATA)) {
      preview = preview.split(key).join(value);
    }
    return preview;
  }, [outreachTemplate]);

  const goToLeads = useCallback(() => {
    router.push(`/admin/leads?projectId=${projectId}`);
  }, [router, projectId]);

  const selectedCount = Object.values(selectedProviders).filter(Boolean).length;
  const outreachSelectedCount = Object.values(selectedOutreach).filter(Boolean).length;

  const isAfterStep = (target: WizardStep): boolean => {
    const order: WizardStep[] = ['basics', 'sources', 'exports', 'outreach', 'done'];
    return order.indexOf(step) > order.indexOf(target);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        <StepIndicator num={1} label="Project Details" active={step === 'basics'} done={step !== 'basics'} />
        <div className="h-px flex-1 bg-slate-200" />
        <StepIndicator num={2} label="Lead Sources" active={step === 'sources'} done={isAfterStep('sources')} />
        <div className="h-px flex-1 bg-slate-200" />
        <StepIndicator num={3} label="Export Destinations" active={step === 'exports'} done={isAfterStep('exports')} />
        <div className="h-px flex-1 bg-slate-200" />
        <StepIndicator num={4} label="Outreach" active={step === 'outreach'} done={isAfterStep('outreach')} />
        <div className="h-px flex-1 bg-slate-200" />
        <StepIndicator num={5} label="Start Prospecting" active={step === 'done'} done={false} />
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
            <CountryMultiSelect
              label="Target Geography *"
              helperText="Search and select any country in the world for this project."
              selectedCodes={selectedGeos}
              onChange={setSelectedGeos}
            />
            {selectedGeos.length === 0 && (
              <p className="-mt-2 text-xs text-red-500">Select at least one geography</p>
            )}
            <TagInput
              label="Company Filters"
              helperText="These company names are stored on the project and used for Apollo search targeting."
              values={companyNames}
              onChange={setCompanyNames}
              placeholder="Type a company name and press Enter"
            />
            <TagInput
              label="Job Title Filters"
              helperText="These titles seed sourcing and enrichment prioritization for the project."
              values={jobTitles}
              onChange={setJobTitles}
              placeholder="Type a job title and press Enter"
            />
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

      {/* Step 2: Lead Sources */}
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
                const available = cat.types
                  .filter((t) => !EXPORT_DESTINATION_TYPES.includes(t) && !OUTREACH_CHANNEL_TYPES.includes(t))
                  .filter((t) => (accountsByType.get(t)?.length ?? 0) > 0);
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
                                    acct.lastHealthStatus === 'healthy' || acct.lastHealthStatus === 'ok' ? 'text-emerald-600' : 'text-amber-600'
                                  }`}>
                                    {acct.lastHealthStatus === 'healthy' || acct.lastHealthStatus === 'ok' ? 'Connected' : acct.lastHealthStatus}
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
            <Button onClick={() => setStep('exports')} className="bg-slate-100 text-slate-700 hover:bg-slate-200">
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

      {/* Step 3: Export Destinations */}
      {step === 'exports' && (
        <Card className="space-y-5">
          <div>
            <h2 className="text-lg font-bold">Export Destinations</h2>
            <p className="text-sm text-slate-500">
              Choose where enriched leads should be automatically exported. Only configured Google Sheets or Supabase accounts are shown.
            </p>
          </div>

          {exportAccounts.length === 0 && (
            <div className="rounded-lg border-2 border-dashed border-slate-200 p-8 text-center">
              <span className="material-symbols-outlined text-4xl text-slate-300 mb-2">cloud_off</span>
              <p className="text-sm font-medium text-slate-600">No export destinations configured</p>
              <p className="text-xs text-slate-400 mt-1">
                Go to <button type="button" onClick={() => router.push('/admin/providers')} className="text-primary underline">Providers</button> to
                add a Google Sheets or Supabase account first.
              </p>
            </div>
          )}

          {exportAccounts.length > 0 && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {exportAccounts.map((acct) => {
                  const isSelected = !!selectedExports[acct.id];
                  const displayName = PROVIDER_DISPLAY_NAMES[acct.providerType];
                  return (
                    <button
                      key={acct.id}
                      type="button"
                      onClick={() => toggleExport(acct.id, acct.providerType)}
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
                            acct.lastHealthStatus === 'healthy' || acct.lastHealthStatus === 'ok' ? 'text-emerald-600' : 'text-amber-600'
                          }`}>
                            {acct.lastHealthStatus === 'healthy' || acct.lastHealthStatus === 'ok' ? 'Connected' : acct.lastHealthStatus}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <span className="material-symbols-outlined text-base text-slate-400">info</span>
                <p className="text-xs text-slate-400">
                  Enriched leads will be automatically sent to the selected destinations.
                </p>
              </div>
            </div>
          )}

          {exportError && <p className="text-sm text-red-600">{exportError}</p>}

          <div className="flex justify-between">
            <Button onClick={() => setStep('outreach')} className="bg-slate-100 text-slate-700 hover:bg-slate-200">
              Skip for now
            </Button>
            <Button
              onClick={() => exportBindMutation.mutate()}
              disabled={Object.values(selectedExports).filter(Boolean).length === 0 || exportBindMutation.isPending}
            >
              {exportBindMutation.isPending ? 'Saving...' : 'Save & Continue'}
              <span className="material-symbols-outlined text-base">arrow_forward</span>
            </Button>
          </div>
        </Card>
      )}

      {/* Step 4: Outreach */}
      {step === 'outreach' && (
        <Card className="space-y-5">
          <div>
            <h2 className="text-lg font-bold">Outreach Configuration</h2>
            <p className="text-sm text-slate-500">
              Select outreach channels and write a message template. Outreach is sent automatically when leads are enriched.
            </p>
          </div>

          {outreachAccounts.length === 0 && (
            <div className="rounded-lg border-2 border-dashed border-slate-200 p-8 text-center">
              <span className="material-symbols-outlined text-4xl text-slate-300 mb-2">campaign</span>
              <p className="text-sm font-medium text-slate-600">No healthy outreach channels available</p>
              <p className="text-xs text-slate-400 mt-1">
                Go to <button type="button" onClick={() => router.push('/admin/providers')} className="text-primary underline">Providers</button> to
                configure and verify outreach channels (Email, SMS, WhatsApp, etc.).
              </p>
            </div>
          )}

          {outreachAccounts.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-700">Outreach Channels</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {outreachAccounts.map((acct) => {
                  const isSelected = !!selectedOutreach[acct.id];
                  const displayName = PROVIDER_DISPLAY_NAMES[acct.providerType];
                  return (
                    <button
                      key={acct.id}
                      type="button"
                      onClick={() => toggleOutreach(acct.id, acct.providerType)}
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
                        {isSelected && <span className="material-symbols-outlined text-sm">check</span>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {displayName} — {acct.accountLabel}
                        </p>
                        <p className="text-[11px] text-emerald-600">Connected</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">Message Template *</h3>
              <span className="text-xs text-slate-400">{outreachTemplate.length} chars</span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {TEMPLATE_VARIABLES.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => insertVariable(v.key)}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:border-slate-300 transition-colors"
                >
                  <span className="material-symbols-outlined text-xs">{v.icon}</span>
                  {v.label}
                </button>
              ))}
            </div>

            <textarea
              ref={templateRef}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary min-h-[100px] resize-y"
              value={outreachTemplate}
              onChange={(e) => setOutreachTemplate(e.target.value)}
              placeholder="Hi {{FirstName}}, we have a project that matches your expertise..."
            />

            {outreachTemplate.trim() && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Preview with sample data</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{templatePreview}</p>
              </div>
            )}

            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <span className="material-symbols-outlined text-base text-amber-500">info</span>
              <p className="text-xs text-slate-500">
                Outreach will only be sent when all template variables have data for a lead.
                If a variable like {'{{CurrentCompany}}'} is missing, outreach is skipped for that lead.
              </p>
            </div>
          </div>

          {outreachError && <p className="text-sm text-red-600">{outreachError}</p>}

          <div className="flex justify-between">
            <Button onClick={() => setStep('done')} className="bg-slate-100 text-slate-700 hover:bg-slate-200">
              Skip for now
            </Button>
            <Button
              onClick={() => outreachBindMutation.mutate()}
              disabled={!outreachTemplate.trim() || outreachSelectedCount === 0 || outreachBindMutation.isPending}
            >
              {outreachBindMutation.isPending ? 'Saving...' : 'Save & Start Prospecting'}
              <span className="material-symbols-outlined text-base">arrow_forward</span>
            </Button>
          </div>
        </Card>
      )}

      {/* Step 5: Done */}
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
              Your project is set up with lead sources, export destinations, and outreach channels.
              Head to the Leads page to watch leads flow through the pipeline in real time.
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
