'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CountryMultiSelect } from '@/components/ui/country-multi-select';
import { Input } from '@/components/ui/input';
import { TagInput } from '@/components/ui/tag-input';
import {
  EXPORT_DESTINATION_TYPES,
  OUTREACH_CHANNEL_TYPES,
  PROVIDER_DISPLAY_NAMES,
  PROVIDER_TYPE_TO_FIELD
} from '@/lib/providerConstants';
import {
  getLinkedInOAuthStatus,
  listProviderAccounts,
  triggerPlaywrightOAuth,
  getLinkedInOAuthAuthorizeUrl,
  updateProviderAccount,
  type LinkedInOAuthStatus
} from '@/services/providerService';
import {
  addProjectCompanies,
  addProjectJobTitles,
  addSalesNavSearches,
  createProject,
  importLeadsCsv,
  listProjectJobTitles,
  scrapeSalesNav,
  triggerJobTitleDiscovery,
  updateProject
} from '@/services/projectService';
import type { ProjectJobTitleRecord } from '@/types/project';
import type { ProviderAccount, ProviderType } from '@/types/provider';

type WizardStep = 'providers' | 'titles' | 'sources' | 'done';

const MANDATORY_PROVIDER_TYPES: ProviderType[] = ['OPENAI', 'APOLLO'];
const ENRICHMENT_TYPES: ProviderType[] = [
  'LEADMAGIC', 'PROSPEO', 'EXA', 'ROCKETREACH', 'WIZA', 'FORAGER',
  'ZELIQ', 'CONTACTOUT', 'DATAGM', 'PEOPLEDATALABS', 'ANYLEADS'
];

interface DiscoveredTitle extends ProjectJobTitleRecord {
  selected: boolean;
}

function parseSalesNavCsv(text: string): Record<string, string>[] {
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
    return row;
  });
}

export default function NewProjectWizardPage(): JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<WizardStep>('providers');

  // Step 1: Provider selection + project basics
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [targetThreshold, setTargetThreshold] = useState('10');
  const [priority, setPriority] = useState('0');
  const [selectedGeos, setSelectedGeos] = useState<string[]>(['US']);

  const [selectedProviders, setSelectedProviders] = useState<Record<string, boolean>>({});
  const [projectId, setProjectId] = useState('');
  const [createError, setCreateError] = useState('');

  // Step 2: Job Title Discovery
  const [companyNames, setCompanyNames] = useState<string[]>([]);
  const [discoveryRunning, setDiscoveryRunning] = useState(false);
  const [discoveryError, setDiscoveryError] = useState('');
  const [discoveredTitles, setDiscoveredTitles] = useState<DiscoveredTitle[]>([]);
  const [discoveryCompleted, setDiscoveryCompleted] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [titleError, setTitleError] = useState('');

  // Step 3: Lead Sources + LinkedIn auth
  const [salesNavUrls, setSalesNavUrls] = useState<string[]>([]);
  const [newSalesNavUrl, setNewSalesNavUrl] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [importResult, setImportResult] = useState<{ imported: number; duplicatesSkipped: number; errors: string[] } | null>(null);
  const [sourceError, setSourceError] = useState('');
  const [linkedInAuthorizing, setLinkedInAuthorizing] = useState(false);
  const [linkedInError, setLinkedInError] = useState('');
  const [showManualCookie, setShowManualCookie] = useState(false);
  const [manualCookie, setManualCookie] = useState('');
  const [savingCookie, setSavingCookie] = useState(false);
  const [scraping, setScraping] = useState(false);

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

  const salesNavAccount = useMemo(() => {
    const accounts = accountsByType.get('SALES_NAV_WEBHOOK') ?? [];
    const allAccounts = providersQuery.data ?? [];
    const selected = accounts.find((a) => selectedProviders[a.id]);
    if (selected) return selected;
    const bound = allAccounts.find(
      (a) => a.providerType === 'SALES_NAV_WEBHOOK' && selectedProviders[a.id]
    );
    return bound ?? accounts[0] ?? null;
  }, [accountsByType, selectedProviders, providersQuery.data]);

  const linkedInOAuthQuery = useQuery({
    queryKey: ['linkedin-oauth-status', salesNavAccount?.id],
    queryFn: () => getLinkedInOAuthStatus(salesNavAccount!.id),
    enabled: !!salesNavAccount?.id && step === 'sources',
    refetchInterval: linkedInAuthorizing ? 3_000 : 30_000
  });

  const oauthStatus: LinkedInOAuthStatus | null = linkedInOAuthQuery.data ?? null;

  useEffect(() => {
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  const selectedMandatory = useMemo(() => {
    const result: Record<string, boolean> = {};
    for (const mType of MANDATORY_PROVIDER_TYPES) {
      const accounts = accountsByType.get(mType) ?? [];
      result[mType] = accounts.some((a) => selectedProviders[a.id]);
    }
    return result;
  }, [accountsByType, selectedProviders]);

  const hasEnrichmentSelected = useMemo(() => {
    for (const eType of ENRICHMENT_TYPES) {
      const accounts = accountsByType.get(eType) ?? [];
      if (accounts.some((a) => selectedProviders[a.id])) return true;
    }
    return false;
  }, [accountsByType, selectedProviders]);

  const allMandatoryMet = selectedMandatory.OPENAI && selectedMandatory.APOLLO && hasEnrichmentSelected;

  useEffect(() => {
    if (!providersQuery.data) return;
    const auto: Record<string, boolean> = {};
    let changed = false;
    for (const mType of MANDATORY_PROVIDER_TYPES) {
      const accounts = accountsByType.get(mType) ?? [];
      if (accounts.length === 1 && !selectedProviders[accounts[0].id]) {
        auto[accounts[0].id] = true;
        changed = true;
      }
    }
    if (changed) {
      setSelectedProviders((prev) => ({ ...prev, ...auto }));
    }
  }, [providersQuery.data, accountsByType, selectedProviders]);

  // --- Step 1: Create project + bind providers ---
  const createAndBindMutation = useMutation({
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

      const bindings: Record<string, string> = {};
      const allAccounts = providersQuery.data ?? [];
      for (const acct of allAccounts) {
        if (selectedProviders[acct.id]) {
          const field = PROVIDER_TYPE_TO_FIELD[acct.providerType];
          bindings[field] = acct.id;
        }
      }
      if (Object.keys(bindings).length > 0) {
        await updateProject(project.id, bindings as never);
      }

      return project;
    },
    onSuccess: (project) => {
      setProjectId(project.id);
      setCreateError('');
      setStep('titles');
    },
    onError: (err) => {
      setCreateError(err instanceof Error ? err.message : 'Failed to create project');
    }
  });

  // --- Step 2: Job title discovery ---
  const triggerDiscovery = useMutation({
    mutationFn: async () => {
      if (companyNames.length === 0) throw new Error('Add at least one company');

      await addProjectCompanies(
        projectId,
        companyNames.map((c) => ({ name: c }))
      );

      await triggerJobTitleDiscovery(
        projectId,
        companyNames.map((c) => ({ companyName: c })),
        selectedGeos
      );
    },
    onSuccess: () => {
      setDiscoveryRunning(true);
      setDiscoveryError('');

      let attempts = 0;
      pollingRef.current = setInterval(async () => {
        attempts += 1;
        try {
          const titles = await listProjectJobTitles(projectId);
          if (titles.length > 0 || attempts >= 30) {
            if (pollingRef.current) clearInterval(pollingRef.current);
            pollingRef.current = null;
            setDiscoveredTitles(
              titles.map((t) => ({ ...t, selected: t.relevanceScore >= 0.5 }))
            );
            setDiscoveryRunning(false);
            setDiscoveryCompleted(true);
          }
        } catch {
          // keep polling
        }
      }, 3000);
    },
    onError: (err) => {
      setDiscoveryRunning(false);
      setDiscoveryError(err instanceof Error ? err.message : 'Failed to start job title discovery');
    }
  });

  const toggleTitle = useCallback((titleId: string) => {
    setDiscoveredTitles((prev) =>
      prev.map((t) => (t.id === titleId ? { ...t, selected: !t.selected } : t))
    );
  }, []);

  const selectAllTitles = useCallback((selected: boolean) => {
    setDiscoveredTitles((prev) => prev.map((t) => ({ ...t, selected })));
  }, []);

  const proceedToSources = useMutation({
    mutationFn: async () => {
      const selected = discoveredTitles.filter((t) => t.selected);
      if (selected.length > 0) {
        await addProjectJobTitles(
          projectId,
          selected.map((t) => {
            const score =
              typeof t.relevanceScore === 'number'
                ? t.relevanceScore
                : Number.parseFloat(String(t.relevanceScore ?? ''));
            const relevanceScore = Number.isFinite(score)
              ? score <= 1
                ? score
                : score / 100
              : undefined;
            const clamped =
              relevanceScore !== undefined ? Math.max(0, Math.min(1, relevanceScore)) : undefined;
            return { title: t.titleOriginal, relevanceScore: clamped };
          })
        );
      }
    },
    onSuccess: () => setStep('sources'),
    onError: (err) => setTitleError(err instanceof Error ? err.message : 'Failed to save titles')
  });

  // --- Step 3: Lead sources + LinkedIn auth + scraping ---
  const addSalesNavUrl = useCallback(() => {
    const url = newSalesNavUrl.trim();
    if (!url || salesNavUrls.includes(url)) return;
    setSalesNavUrls((prev) => [...prev, url]);
    setNewSalesNavUrl('');
  }, [newSalesNavUrl, salesNavUrls]);

  const removeSalesNavUrl = useCallback((url: string) => {
    setSalesNavUrls((prev) => prev.filter((u) => u !== url));
  }, []);

  const handleCsvUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvRows(parseSalesNavCsv(text));
    };
    reader.readAsText(file);
  }, []);

  const handlePlaywrightAuth = async (): Promise<void> => {
    if (!salesNavAccount) return;
    setLinkedInAuthorizing(true);
    setLinkedInError('');
    try {
      await triggerPlaywrightOAuth(salesNavAccount.id);
      void queryClient.invalidateQueries({ queryKey: ['linkedin-oauth-status', salesNavAccount.id] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to authorize';
      if (msg.includes('playwright') || msg.includes('Playwright')) {
        setLinkedInError('Could not open browser window. Use manual cookie paste below as fallback.');
        setLinkedInAuthorizing(false);
        return;
      }
      // Proxy timeout or connection abort — the Playwright browser is still
      // running server-side. Polling will detect the cookie once it's saved.
      if (msg.includes('Request failed') || msg.includes('network') || msg.includes('abort')) {
        void queryClient.invalidateQueries({ queryKey: ['linkedin-oauth-status', salesNavAccount.id] });
        return;
      }
      setLinkedInError(msg);
    } finally {
      setLinkedInAuthorizing(false);
    }
  };

  const handleFallbackAuth = async (): Promise<void> => {
    if (!salesNavAccount) return;
    setLinkedInAuthorizing(true);
    setLinkedInError('');
    try {
      const { authorizationUrl } = await getLinkedInOAuthAuthorizeUrl(salesNavAccount.id);
      window.open(authorizationUrl, 'linkedin-oauth', 'width=600,height=700');
    } catch (err) {
      setLinkedInError(err instanceof Error ? err.message : 'Failed to start authorization');
      setLinkedInAuthorizing(false);
    }
  };

  useEffect(() => {
    const handler = (event: MessageEvent): void => {
      if (event.data?.type !== 'linkedin-oauth-success') return;
      setLinkedInAuthorizing(false);
      void queryClient.invalidateQueries({ queryKey: ['linkedin-oauth-status', salesNavAccount?.id] });
      setTimeout(async () => {
        if (!salesNavAccount) return;
        try {
          const fresh = await getLinkedInOAuthStatus(salesNavAccount.id);
          if (!fresh.linkedInSessionCookie) {
            setShowManualCookie(true);
            setLinkedInError(
              'OAuth tokens saved, but the session cookie could not be captured via browser tab. ' +
              'Paste your li_at cookie below to enable scraping.'
            );
          }
        } catch { /* status will be re-fetched by the query */ }
      }, 1000);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [queryClient, salesNavAccount]);

  const handleSaveManualCookie = async (): Promise<void> => {
    if (!salesNavAccount || !manualCookie.trim()) return;
    setSavingCookie(true);
    setLinkedInError('');
    try {
      await updateProviderAccount(salesNavAccount.id, {
        credentials: {
          linkedInSessionCookie: manualCookie.trim(),
          linkedInSessionCookieCapturedAt: new Date().toISOString()
        }
      });
      setManualCookie('');
      setShowManualCookie(false);
      void queryClient.invalidateQueries({ queryKey: ['linkedin-oauth-status', salesNavAccount.id] });
    } catch (err) {
      setLinkedInError(err instanceof Error ? err.message : 'Failed to save cookie');
    } finally {
      setSavingCookie(false);
    }
  };

  const handleScrapeAll = async (): Promise<void> => {
    setScraping(true);
    setSourceError('');
    try {
      const result = await scrapeSalesNav(projectId);
      setSourceError('');
      alert(`Queued scraping for ${String(result.queued)} search URL(s). Leads will appear on the Leads page shortly.`);
    } catch (err) {
      setSourceError(err instanceof Error ? err.message : 'Failed to start scraping');
    } finally {
      setScraping(false);
    }
  };

  const saveSourcesAndFinish = useMutation({
    mutationFn: async () => {
      if (salesNavUrls.length > 0) {
        await addSalesNavSearches(
          projectId,
          salesNavUrls.map((url) => ({ sourceUrl: url, normalizedUrl: url }))
        );
      }
      if (csvRows.length > 0) {
        const result = await importLeadsCsv(projectId, csvRows);
        setImportResult(result);
      }
    },
    onSuccess: () => { setStep('done'); setSourceError(''); },
    onError: (err) => { setSourceError(err instanceof Error ? err.message : 'Failed to save sources'); }
  });

  // Toggle helpers
  const toggleProvider = useCallback((accountId: string, providerType: ProviderType) => {
    setSelectedProviders((prev) => {
      const next = { ...prev };
      if (next[accountId]) { delete next[accountId]; }
      else {
        const allAccounts = providersQuery.data ?? [];
        for (const other of allAccounts) {
          if (other.providerType === providerType && other.id !== accountId) delete next[other.id];
        }
        next[accountId] = true;
      }
      return next;
    });
  }, [providersQuery.data]);

  const goToLeads = useCallback(() => {
    router.push(`/admin/leads?projectId=${projectId}`);
  }, [router, projectId]);

  const selectedTitleCount = discoveredTitles.filter((t) => t.selected).length;

  const isAfterStep = (target: WizardStep): boolean => {
    const order: WizardStep[] = ['providers', 'titles', 'sources', 'done'];
    return order.indexOf(step) > order.indexOf(target);
  };

  const hasCookie = oauthStatus?.linkedInSessionCookie === true;

  const renderProviderPicker = (
    types: ProviderType[],
    label: string,
    mandatory: boolean,
    sublabel?: string
  ) => {
    const available = types.filter((t) => (accountsByType.get(t)?.length ?? 0) > 0);
    const missing = types.filter((t) => (accountsByType.get(t)?.length ?? 0) === 0);
    const hasSelection = types.some((t) =>
      (accountsByType.get(t) ?? []).some((a) => selectedProviders[a.id])
    );

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-700">{label}</h3>
          {mandatory && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              hasSelection ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
            }`}>
              {hasSelection ? 'Selected' : 'Required'}
            </span>
          )}
        </div>
        {sublabel && <p className="text-xs text-slate-400 -mt-1">{sublabel}</p>}

        {available.length === 0 && (
          <div className="rounded-lg border-2 border-dashed border-red-200 bg-red-50/50 p-3 text-center">
            <p className="text-xs text-red-600">
              No {missing.map((t) => PROVIDER_DISPLAY_NAMES[t]).join(' / ')} accounts configured.{' '}
              <button type="button" onClick={() => router.push('/admin/providers')} className="underline font-medium">
                Go to Providers
              </button>
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {available.flatMap((provType) =>
            (accountsByType.get(provType) ?? []).map((acct) => {
              const isSelected = !!selectedProviders[acct.id];
              return (
                <button
                  key={acct.id}
                  type="button"
                  onClick={() => toggleProvider(acct.id, acct.providerType)}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                    isSelected ? 'border-primary bg-primary text-white' : 'border-slate-300'
                  }`}>
                    {isSelected && <span className="material-symbols-outlined text-xs">check</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {PROVIDER_DISPLAY_NAMES[acct.providerType]} — {acct.accountLabel}
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
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <StepIndicator num={1} label="Providers" active={step === 'providers'} done={isAfterStep('providers')} />
        <div className="h-px flex-1 bg-slate-200" />
        <StepIndicator num={2} label="Job Titles" active={step === 'titles'} done={isAfterStep('titles')} />
        <div className="h-px flex-1 bg-slate-200" />
        <StepIndicator num={3} label="Lead Sources" active={step === 'sources'} done={isAfterStep('sources')} />
        <div className="h-px flex-1 bg-slate-200" />
        <StepIndicator num={4} label="Done" active={step === 'done'} done={false} />
      </div>

      {/* -- Step 1: Providers + Project Basics -- */}
      {step === 'providers' && (
        <Card className="space-y-5">
          <div>
            <h2 className="text-lg font-bold">Create Project & Select Providers</h2>
            <p className="text-sm text-slate-500">
              Set up your project and bind all provider accounts. OpenAI and Apollo are mandatory. Outreach channels and export destinations are optional.
            </p>
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
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-100">
            <h3 className="text-sm font-bold text-slate-800">Provider Accounts</h3>

            {providersQuery.isLoading && (
              <div className="flex items-center justify-center py-8 text-slate-400">
                <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
                Loading providers...
              </div>
            )}

            {providersQuery.isSuccess && (
              <div className="space-y-5">
                {renderProviderPicker(
                  ['OPENAI'],
                  'OpenAI',
                  true,
                  'Required for AI-powered job title expansion and scoring.'
                )}

                {renderProviderPicker(
                  ['APOLLO'],
                  'Apollo',
                  true,
                  'Required for job title discovery and email pattern enrichment.'
                )}

                {renderProviderPicker(
                  ENRICHMENT_TYPES,
                  'Enrichment Providers',
                  true,
                  'At least one enrichment provider is required for lead data enrichment.'
                )}

                {renderProviderPicker(
                  OUTREACH_CHANNEL_TYPES,
                  'Outreach Channels',
                  false,
                  'Optional. Select channels for automated outreach (Email, SMS, WhatsApp, etc.).'
                )}

                {renderProviderPicker(
                  EXPORT_DESTINATION_TYPES,
                  'Export Destinations',
                  false,
                  'Optional. Where enriched leads should be automatically exported.'
                )}
              </div>
            )}
          </div>

          {!allMandatoryMet && providersQuery.isSuccess && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <span className="material-symbols-outlined text-amber-500 text-base mt-0.5">warning</span>
              <p className="text-xs text-amber-800">
                {!selectedMandatory.OPENAI && 'OpenAI account is required. '}
                {!selectedMandatory.APOLLO && 'Apollo account is required. '}
                {!hasEnrichmentSelected && 'At least one enrichment provider is required.'}
              </p>
            </div>
          )}

          {createError && <p className="text-sm text-red-600">{createError}</p>}

          <div className="flex justify-end">
            <Button
              onClick={() => createAndBindMutation.mutate()}
              disabled={!name || selectedGeos.length === 0 || !allMandatoryMet || createAndBindMutation.isPending}
            >
              {createAndBindMutation.isPending ? 'Creating...' : 'Create Project & Continue'}
              <span className="material-symbols-outlined text-base">arrow_forward</span>
            </Button>
          </div>
        </Card>
      )}

      {/* -- Step 2: Job Title Discovery -- */}
      {step === 'titles' && (
        <Card className="space-y-5">
          <div>
            <h2 className="text-lg font-bold">Job Title Discovery</h2>
            <p className="text-sm text-slate-500">
              Add target companies, then click "Get Job Titles" to discover real titles via Apollo + OpenAI. Select the relevant ones for your Sales Navigator searches.
            </p>
          </div>

          <TagInput
            label="Target Companies"
            helperText="Add the companies you want to source experts from."
            values={companyNames}
            onChange={setCompanyNames}
            placeholder="Type a company name and press Enter"
          />

          {!discoveryRunning && !discoveryCompleted && (
            <div className="flex justify-between">
              <Button onClick={() => { setDiscoveryCompleted(true); }} className="bg-slate-100 text-slate-700 hover:bg-slate-200">
                Skip (add titles later)
              </Button>
              <Button
                onClick={() => triggerDiscovery.mutate()}
                disabled={companyNames.length === 0 || triggerDiscovery.isPending}
              >
                {triggerDiscovery.isPending ? 'Starting...' : 'Get Job Titles'}
                <span className="material-symbols-outlined text-base">psychology</span>
              </Button>
            </div>
          )}

          {discoveryRunning && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-center">
              <span className="material-symbols-outlined animate-spin text-blue-600 text-2xl mb-2">progress_activity</span>
              <p className="text-sm font-medium text-blue-800">Discovering job titles via Apollo + OpenAI...</p>
              <p className="text-xs text-blue-600 mt-1">
                Querying titles from {companyNames.length} {companyNames.length === 1 ? 'company' : 'companies'}. This may take 30-60 seconds.
              </p>
            </div>
          )}

          {discoveryError && <p className="text-sm text-red-600">{discoveryError}</p>}

          {discoveryCompleted && discoveredTitles.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">Discovered Titles ({discoveredTitles.length})</h3>
                <div className="flex gap-2">
                  <button type="button" onClick={() => selectAllTitles(true)} className="text-xs text-primary hover:underline">Select all</button>
                  <button type="button" onClick={() => selectAllTitles(false)} className="text-xs text-slate-400 hover:underline">Deselect all</button>
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                {discoveredTitles.map((title) => (
                  <button
                    key={title.id}
                    type="button"
                    onClick={() => toggleTitle(title.id)}
                    className={`flex items-center gap-3 w-full px-3 py-2 text-left transition-colors ${
                      title.selected ? 'bg-primary/5' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                      title.selected ? 'border-primary bg-primary text-white' : 'border-slate-300'
                    }`}>
                      {title.selected && <span className="material-symbols-outlined text-xs">check</span>}
                    </div>
                    <span className="flex-1 text-sm text-slate-800">{title.titleOriginal}</span>
                    <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                      title.relevanceScore >= 0.7 ? 'bg-emerald-100 text-emerald-700'
                        : title.relevanceScore >= 0.4 ? 'bg-amber-100 text-amber-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      {(title.relevanceScore * 100).toFixed(0)}%
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400">{selectedTitleCount} of {discoveredTitles.length} titles selected.</p>
            </div>
          )}

          {discoveryCompleted && discoveredTitles.length === 0 && companyNames.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm text-amber-800">No titles discovered. You can add them manually later from the project page.</p>
            </div>
          )}

          {titleError && <p className="text-sm text-red-600">{titleError}</p>}

          {discoveryCompleted && (
            <div className="flex justify-end">
              <Button onClick={() => proceedToSources.mutate()} disabled={proceedToSources.isPending}>
                {proceedToSources.isPending ? 'Saving...' : 'Continue'}
                <span className="material-symbols-outlined text-base">arrow_forward</span>
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* -- Step 3: Lead Sources with LinkedIn Auth + Scraping -- */}
      {step === 'sources' && (
        <Card className="space-y-5">
          <div>
            <h2 className="text-lg font-bold">Lead Sources</h2>
            <p className="text-sm text-slate-500">
              Connect to LinkedIn Sales Navigator to scrape leads automatically. Add search URLs (~6 recommended), authorize your LinkedIn session, then scrape.
            </p>
          </div>

          {/* LinkedIn Authorization */}
          {salesNavAccount && hasCookie && (
            <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50/50 px-4 py-3">
              <span className="inline-block size-2 rounded-full bg-emerald-500 shrink-0" />
              <p className="flex-1 text-sm text-emerald-800">
                LinkedIn session active
                {oauthStatus?.linkedInSessionCookieCapturedAt && (
                  <span className="text-emerald-600 ml-1 text-xs">
                    (since {new Date(oauthStatus.linkedInSessionCookieCapturedAt).toLocaleDateString()})
                  </span>
                )}
              </p>
              <button
                type="button"
                onClick={() => void handlePlaywrightAuth()}
                disabled={linkedInAuthorizing}
                className="text-xs text-slate-400 hover:text-slate-600 hover:underline disabled:opacity-50"
              >
                {linkedInAuthorizing ? 'Re-authorizing...' : 'Re-authorize'}
              </button>
            </div>
          )}

          {salesNavAccount && !hasCookie && (
            <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/40 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-blue-800">
                  <span className="material-symbols-outlined text-base align-text-bottom mr-1">lock</span>
                  LinkedIn Session
                </h3>
                {oauthStatus && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                    No session cookie
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-600">
                Authorize with LinkedIn to capture a session cookie. This is needed for scraping Sales Navigator search results.
                A browser window will open — if you&apos;ve logged in before, it will remember your session.
              </p>

              {linkedInError && <p className="text-xs text-red-600">{linkedInError}</p>}

              <div className="flex items-center gap-2">
                <Button
                  onClick={() => void handlePlaywrightAuth()}
                  disabled={linkedInAuthorizing}
                >
                  {linkedInAuthorizing ? 'Authorizing (browser will open)...' : 'Authorize with LinkedIn'}
                </Button>
                <button
                  type="button"
                  onClick={() => void handleFallbackAuth()}
                  disabled={linkedInAuthorizing}
                  className="text-xs text-slate-400 hover:text-slate-600 hover:underline disabled:opacity-50"
                >
                  Open in browser tab
                </button>
              </div>

              <div className="border-t border-blue-200 pt-2">
                <button
                  type="button"
                  onClick={() => setShowManualCookie((prev) => !prev)}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
                >
                  <span className="material-symbols-outlined text-sm">
                    {showManualCookie ? 'expand_less' : 'expand_more'}
                  </span>
                  Manual cookie paste (fallback)
                </button>
                {showManualCookie && (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs text-slate-500">
                      Open LinkedIn in your browser, then DevTools &gt; Application &gt; Cookies &gt; linkedin.com.
                      Copy the value of the <code className="font-mono bg-slate-100 px-1 rounded">li_at</code> cookie.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={manualCookie}
                        onChange={(e) => setManualCookie(e.target.value)}
                        placeholder="Paste li_at cookie value..."
                        className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-primary"
                      />
                      <Button
                        onClick={() => void handleSaveManualCookie()}
                        disabled={!manualCookie.trim() || savingCookie}
                      >
                        {savingCookie ? 'Saving...' : 'Save'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {!salesNavAccount && (
            <div className="rounded-lg border-2 border-dashed border-amber-200 bg-amber-50/50 p-4 text-center">
              <span className="material-symbols-outlined text-2xl text-amber-400">warning</span>
              <p className="text-sm text-amber-800 mt-1">
                No Lead Sync API (Sales Navigator) provider is configured.{' '}
                <button type="button" onClick={() => router.push('/admin/providers')} className="underline font-medium">
                  Go to Providers
                </button>{' '}
                to add one first.
              </p>
            </div>
          )}

          {/* Sales Nav URLs */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">
                <span className="material-symbols-outlined text-base align-text-bottom mr-1">link</span>
                Sales Navigator Searches
                <span className="ml-2 text-xs font-normal text-slate-400">({salesNavUrls.length}/6 recommended)</span>
              </h3>
              {salesNavUrls.length > 0 && hasCookie && (
                <button
                  type="button"
                  onClick={() => void handleScrapeAll()}
                  disabled={scraping}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-sm">
                    {scraping ? 'progress_activity' : 'download'}
                  </span>
                  {scraping ? 'Scraping...' : 'Scrape All'}
                </button>
              )}
            </div>

            {salesNavUrls.length > 0 && (
              <div className="space-y-1.5">
                {salesNavUrls.map((url, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 bg-slate-50">
                    <span className="material-symbols-outlined text-sm text-slate-400">search</span>
                    <span className="flex-1 text-xs text-slate-600 truncate">{url}</span>
                    <button type="button" onClick={() => removeSalesNavUrl(url)} className="text-slate-400 hover:text-red-500">
                      <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Input
                value={newSalesNavUrl}
                onChange={(e) => setNewSalesNavUrl(e.target.value)}
                placeholder="Paste a Sales Navigator search URL..."
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSalesNavUrl(); } }}
                className="flex-1"
              />
              <Button onClick={addSalesNavUrl} disabled={!newSalesNavUrl.trim()} className="shrink-0">Add</Button>
            </div>

            {salesNavUrls.length < 6 && (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, (salesNavUrls.length / 6) * 100)}%` }} />
                </div>
                <span className="text-[11px] text-slate-400">{salesNavUrls.length}/6</span>
              </div>
            )}
          </div>

          {/* CSV Import */}
          <div className="space-y-3 pt-3 border-t border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700">
              <span className="material-symbols-outlined text-base align-text-bottom mr-1">upload_file</span>
              Import Leads from CSV
              <span className="ml-1 text-xs font-normal text-slate-400">(optional)</span>
            </h3>
            <label className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 p-4 cursor-pointer hover:border-slate-300 hover:bg-slate-50 transition-colors">
              <span className="material-symbols-outlined text-slate-400">cloud_upload</span>
              <span className="text-sm text-slate-600">
                {csvFile ? `${csvFile.name} (${csvRows.length} rows)` : 'Click to upload a Sales Navigator CSV export'}
              </span>
              <input type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" />
            </label>
            {csvRows.length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-600">
                  <strong>{csvRows.length}</strong> leads parsed. Columns: {Object.keys(csvRows[0]).join(', ')}
                </p>
              </div>
            )}
            {importResult && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                Imported {importResult.imported}, {importResult.duplicatesSkipped} skipped.
              </div>
            )}
          </div>

          {sourceError && <p className="text-sm text-red-600">{sourceError}</p>}

          <div className="flex justify-between">
            <Button onClick={() => setStep('done')} className="bg-slate-100 text-slate-700 hover:bg-slate-200">Skip</Button>
            <Button onClick={() => saveSourcesAndFinish.mutate()} disabled={saveSourcesAndFinish.isPending}>
              {saveSourcesAndFinish.isPending ? 'Saving...' : 'Save & Finish'}
              <span className="material-symbols-outlined text-base">arrow_forward</span>
            </Button>
          </div>
        </Card>
      )}

      {/* -- Step 4: Done -- */}
      {step === 'done' && (
        <Card className="space-y-5 text-center py-8">
          <div className="flex justify-center">
            <div className="size-16 rounded-full bg-emerald-100 flex items-center justify-center">
              <span className="material-symbols-outlined text-3xl text-emerald-600">check_circle</span>
            </div>
          </div>
          <div>
            <h2 className="text-lg font-bold">Project Created!</h2>
            <p className="text-sm text-slate-500 mt-1">Your project is set up. Head to the Leads page to watch leads flow through the pipeline.</p>
          </div>
          <div className="flex justify-center gap-3">
            <Button onClick={() => router.push('/admin/projects')} className="bg-slate-100 text-slate-700 hover:bg-slate-200">Back to Projects</Button>
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
