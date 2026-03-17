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
  PROVIDER_CATEGORIES,
  PROVIDER_DISPLAY_NAMES,
  PROVIDER_TYPE_TO_FIELD,
  TEMPLATE_VARIABLES
} from '@/lib/providerConstants';
import { listProviderAccounts } from '@/services/providerService';
import {
  addProjectCompanies,
  addProjectJobTitles,
  addSalesNavSearches,
  createProject,
  importLeadsCsv,
  listProjectJobTitles,
  triggerJobTitleDiscovery,
  updateProject
} from '@/services/projectService';
import type { ProjectJobTitleRecord } from '@/types/project';
import type { ProviderAccount, ProviderType } from '@/types/provider';

type WizardStep = 'titles' | 'sources' | 'exports' | 'outreach' | 'done';

const SAMPLE_DATA: Record<string, string> = {
  '{{FirstName}}': 'Jane',
  '{{LastName}}': 'Doe',
  '{{Country}}': 'United States',
  '{{JobTitle}}': 'VP of Engineering',
  '{{CurrentCompany}}': 'Acme Corp'
};

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
  const [step, setStep] = useState<WizardStep>('titles');
  const templateRef = useRef<HTMLTextAreaElement>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [targetThreshold, setTargetThreshold] = useState('10');
  const [priority, setPriority] = useState('0');
  const [selectedGeos, setSelectedGeos] = useState<string[]>(['US']);
  const [companyNames, setCompanyNames] = useState<string[]>([]);

  const [projectId, setProjectId] = useState('');
  const [createError, setCreateError] = useState('');

  const [discoveryRunning, setDiscoveryRunning] = useState(false);
  const [discoveryError, setDiscoveryError] = useState('');
  const [discoveredTitles, setDiscoveredTitles] = useState<DiscoveredTitle[]>([]);
  const [discoveryCompleted, setDiscoveryCompleted] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [salesNavUrls, setSalesNavUrls] = useState<string[]>([]);
  const [newSalesNavUrl, setNewSalesNavUrl] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [importResult, setImportResult] = useState<{ imported: number; duplicatesSkipped: number; errors: string[] } | null>(null);
  const [sourceError, setSourceError] = useState('');

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
      for (const acct of accountsByType.get(t) ?? []) result.push(acct);
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

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const createAndDiscover = useMutation({
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

      if (companyNames.length) {
        await addProjectCompanies(
          project.id,
          companyNames.map((c) => ({ name: c }))
        );
      }

      return project;
    },
    onSuccess: async (project) => {
      setProjectId(project.id);
      setCreateError('');

      if (companyNames.length === 0 || selectedGeos.length === 0) {
        setDiscoveryCompleted(true);
        return;
      }

      setDiscoveryRunning(true);
      setDiscoveryError('');

      try {
        await triggerJobTitleDiscovery(
          project.id,
          companyNames.map((c) => ({ companyName: c })),
          selectedGeos
        );

        let attempts = 0;
        pollingRef.current = setInterval(async () => {
          attempts += 1;
          try {
            const titles = await listProjectJobTitles(project.id);
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
      } catch (err) {
        setDiscoveryRunning(false);
        setDiscoveryError(err instanceof Error ? err.message : 'Failed to start job title discovery');
        setDiscoveryCompleted(true);
      }
    },
    onError: (err) => {
      setCreateError(err instanceof Error ? err.message : 'Failed to create project');
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
          selected.map((t) => ({ title: t.titleOriginal, relevanceScore: t.relevanceScore }))
        );
      }
    },
    onSuccess: () => setStep('sources'),
    onError: (err) => setCreateError(err instanceof Error ? err.message : 'Failed to save titles')
  });

  const addSalesNavUrl = useCallback(() => {
    const url = newSalesNavUrl.trim();
    if (!url) return;
    if (salesNavUrls.includes(url)) return;
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
      const rows = parseSalesNavCsv(text);
      setCsvRows(rows);
    };
    reader.readAsText(file);
  }, []);

  const saveSourcesAndContinue = useMutation({
    mutationFn: async () => {
      const bindings: Record<string, string> = {};
      const allAccounts = providersQuery.data ?? [];
      for (const acct of allAccounts) {
        if (selectedProviders[acct.id]) {
          const field = PROVIDER_TYPE_TO_FIELD[acct.providerType];
          bindings[field] = acct.id;
        }
      }
      if (Object.keys(bindings).length > 0) {
        await updateProject(projectId, bindings as never);
      }

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
    onSuccess: () => {
      setStep('exports');
      setSourceError('');
    },
    onError: (err) => {
      setSourceError(err instanceof Error ? err.message : 'Failed to save sources');
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
      if (!outreachTemplate.trim()) throw new Error('Message template is required');
      const bindings: Record<string, string | null> = { outreachMessageTemplate: outreachTemplate };
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
      if (next[accountId]) { delete next[accountId]; }
      else {
        for (const other of exportAccounts) {
          if (other.providerType === providerType && other.id !== accountId) delete next[other.id];
        }
        next[accountId] = true;
      }
      return next;
    });
  }, [exportAccounts]);

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

  const toggleOutreach = useCallback((accountId: string, providerType: ProviderType) => {
    setSelectedOutreach((prev) => {
      const next = { ...prev };
      if (next[accountId]) { delete next[accountId]; }
      else {
        for (const other of outreachAccounts) {
          if (other.providerType === providerType && other.id !== accountId) delete next[other.id];
        }
        next[accountId] = true;
      }
      return next;
    });
  }, [outreachAccounts]);

  const insertVariable = useCallback((variable: string) => {
    const textarea = templateRef.current;
    if (!textarea) { setOutreachTemplate((prev) => prev + variable); return; }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = outreachTemplate.slice(0, start);
    const after = outreachTemplate.slice(end);
    setOutreachTemplate(before + variable + after);
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
  const selectedTitleCount = discoveredTitles.filter((t) => t.selected).length;

  const isAfterStep = (target: WizardStep): boolean => {
    const order: WizardStep[] = ['titles', 'sources', 'exports', 'outreach', 'done'];
    return order.indexOf(step) > order.indexOf(target);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <StepIndicator num={1} label="Job Titles" active={step === 'titles'} done={step !== 'titles'} />
        <div className="h-px flex-1 bg-slate-200" />
        <StepIndicator num={2} label="Lead Sources" active={step === 'sources'} done={isAfterStep('sources')} />
        <div className="h-px flex-1 bg-slate-200" />
        <StepIndicator num={3} label="Exports" active={step === 'exports'} done={isAfterStep('exports')} />
        <div className="h-px flex-1 bg-slate-200" />
        <StepIndicator num={4} label="Outreach" active={step === 'outreach'} done={isAfterStep('outreach')} />
        <div className="h-px flex-1 bg-slate-200" />
        <StepIndicator num={5} label="Done" active={step === 'done'} done={false} />
      </div>

      {/* Step 1: Job Title Discovery */}
      {step === 'titles' && (
        <Card className="space-y-5">
          <div>
            <h2 className="text-lg font-bold">Job Title Discovery</h2>
            <p className="text-sm text-slate-500">
              Define your project, target countries, and companies. The system will use Apollo + OpenAI to discover real job titles used at those organizations.
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
              label="Target Companies *"
              helperText="Add the companies you want to source experts from. Used for job title discovery via Apollo + OpenAI."
              values={companyNames}
              onChange={setCompanyNames}
              placeholder="Type a company name and press Enter"
            />
          </div>

          {!projectId && !discoveryRunning && !discoveryCompleted && (
            <>
              {createError && <p className="text-sm text-red-600">{createError}</p>}
              <div className="flex justify-end">
                <Button
                  onClick={() => createAndDiscover.mutate()}
                  disabled={!name || selectedGeos.length === 0 || createAndDiscover.isPending}
                >
                  {createAndDiscover.isPending ? 'Creating...' : companyNames.length > 0 ? 'Create & Get Job Titles' : 'Create & Continue'}
                  <span className="material-symbols-outlined text-base">
                    {companyNames.length > 0 ? 'psychology' : 'arrow_forward'}
                  </span>
                </Button>
              </div>
            </>
          )}

          {discoveryRunning && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-center">
              <span className="material-symbols-outlined animate-spin text-blue-600 text-2xl mb-2">progress_activity</span>
              <p className="text-sm font-medium text-blue-800">Discovering job titles via Apollo + OpenAI...</p>
              <p className="text-xs text-blue-600 mt-1">
                Querying real titles from {companyNames.length} {companyNames.length === 1 ? 'company' : 'companies'} across {selectedGeos.length} {selectedGeos.length === 1 ? 'geography' : 'geographies'}. This may take 30-60 seconds.
              </p>
            </div>
          )}

          {discoveryError && <p className="text-sm text-red-600">{discoveryError}</p>}

          {discoveryCompleted && discoveredTitles.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">
                  Discovered Titles ({discoveredTitles.length})
                </h3>
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
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-slate-800">{title.titleOriginal}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                        title.relevanceScore >= 0.7 ? 'bg-emerald-100 text-emerald-700'
                          : title.relevanceScore >= 0.4 ? 'bg-amber-100 text-amber-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}>
                        {(title.relevanceScore * 100).toFixed(0)}%
                      </span>
                      <span className="text-[10px] text-slate-400">{title.source}</span>
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400">
                {selectedTitleCount} of {discoveredTitles.length} titles selected. These will be used for Sales Navigator search targeting.
              </p>
            </div>
          )}

          {discoveryCompleted && discoveredTitles.length === 0 && companyNames.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm text-amber-800">
                No titles were discovered. You can continue and add job titles manually later, or check that the OpenAI and Apollo providers are configured.
              </p>
            </div>
          )}

          {discoveryCompleted && (
            <div className="flex justify-end">
              <Button
                onClick={() => proceedToSources.mutate()}
                disabled={proceedToSources.isPending}
              >
                {proceedToSources.isPending ? 'Saving...' : `Continue with ${selectedTitleCount} Title${selectedTitleCount !== 1 ? 's' : ''}`}
                <span className="material-symbols-outlined text-base">arrow_forward</span>
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Step 2: Lead Sources (Sales Nav URLs + CSV + Providers) */}
      {step === 'sources' && (
        <Card className="space-y-5">
          <div>
            <h2 className="text-lg font-bold">Lead Sources</h2>
            <p className="text-sm text-slate-500">
              Add Sales Navigator search URLs (~6 recommended per project) and optionally import leads from a CSV export. You can also bind enrichment providers.
            </p>
          </div>

          {/* Sales Nav URLs */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">
              <span className="material-symbols-outlined text-base align-text-bottom mr-1">link</span>
              Sales Navigator Searches
              <span className="ml-2 text-xs font-normal text-slate-400">({salesNavUrls.length}/6 recommended)</span>
            </h3>

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
              <Button
                onClick={addSalesNavUrl}
                disabled={!newSalesNavUrl.trim()}
                className="shrink-0"
              >
                Add
              </Button>
            </div>

            {salesNavUrls.length < 6 && (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.min(100, (salesNavUrls.length / 6) * 100)}%` }}
                  />
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
                  <strong>{csvRows.length}</strong> leads parsed. Columns detected: {Object.keys(csvRows[0]).join(', ')}
                </p>
              </div>
            )}

            {importResult && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                Imported {importResult.imported} leads, {importResult.duplicatesSkipped} duplicates skipped.
                {importResult.errors.length > 0 && (
                  <span className="text-red-600 ml-1">{importResult.errors.length} errors.</span>
                )}
              </div>
            )}
          </div>

          {/* Enrichment Providers */}
          <div className="space-y-3 pt-3 border-t border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700">
              <span className="material-symbols-outlined text-base align-text-bottom mr-1">database</span>
              Enrichment & Other Providers
            </h3>

            {providersQuery.isLoading && (
              <div className="flex items-center justify-center py-6 text-slate-400">
                <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
                Loading providers...
              </div>
            )}

            {providersQuery.isSuccess && (
              <div className="space-y-3">
                {PROVIDER_CATEGORIES.map((cat) => {
                  const available = cat.types
                    .filter((t) => !EXPORT_DESTINATION_TYPES.includes(t) && !OUTREACH_CHANNEL_TYPES.includes(t))
                    .filter((t) => (accountsByType.get(t)?.length ?? 0) > 0);
                  if (available.length === 0) return null;

                  return (
                    <div key={cat.key}>
                      <p className="text-xs font-medium text-slate-500 mb-1.5">{cat.label}</p>
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
                                <span className="text-sm text-slate-800 truncate">
                                  {PROVIDER_DISPLAY_NAMES[acct.providerType]} — {acct.accountLabel}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {sourceError && <p className="text-sm text-red-600">{sourceError}</p>}

          <div className="flex justify-between">
            <Button onClick={() => setStep('exports')} className="bg-slate-100 text-slate-700 hover:bg-slate-200">
              Skip for now
            </Button>
            <Button
              onClick={() => saveSourcesAndContinue.mutate()}
              disabled={saveSourcesAndContinue.isPending}
            >
              {saveSourcesAndContinue.isPending ? 'Saving...' : 'Save & Continue'}
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
              Choose where enriched leads should be automatically exported.
            </p>
          </div>

          {exportAccounts.length === 0 && (
            <div className="rounded-lg border-2 border-dashed border-slate-200 p-8 text-center">
              <span className="material-symbols-outlined text-4xl text-slate-300 mb-2">cloud_off</span>
              <p className="text-sm font-medium text-slate-600">No export destinations configured</p>
              <p className="text-xs text-slate-400 mt-1">
                Go to <button type="button" onClick={() => router.push('/admin/providers')} className="text-primary underline">Providers</button> to add a Google Sheets or Supabase account first.
              </p>
            </div>
          )}

          {exportAccounts.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {exportAccounts.map((acct) => {
                const isSelected = !!selectedExports[acct.id];
                return (
                  <button
                    key={acct.id}
                    type="button"
                    onClick={() => toggleExport(acct.id, acct.providerType)}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${
                      isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className={`flex size-5 shrink-0 items-center justify-center rounded border ${
                      isSelected ? 'border-primary bg-primary text-white' : 'border-slate-300'
                    }`}>
                      {isSelected && <span className="material-symbols-outlined text-sm">check</span>}
                    </div>
                    <span className="text-sm text-slate-800 truncate">
                      {PROVIDER_DISPLAY_NAMES[acct.providerType]} — {acct.accountLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {exportError && <p className="text-sm text-red-600">{exportError}</p>}

          <div className="flex justify-between">
            <Button onClick={() => setStep('outreach')} className="bg-slate-100 text-slate-700 hover:bg-slate-200">Skip for now</Button>
            <Button onClick={() => exportBindMutation.mutate()} disabled={Object.values(selectedExports).filter(Boolean).length === 0 || exportBindMutation.isPending}>
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
              Select outreach channels and write a message template.
            </p>
          </div>

          {outreachAccounts.length === 0 && (
            <div className="rounded-lg border-2 border-dashed border-slate-200 p-8 text-center">
              <span className="material-symbols-outlined text-4xl text-slate-300 mb-2">campaign</span>
              <p className="text-sm font-medium text-slate-600">No healthy outreach channels available</p>
              <p className="text-xs text-slate-400 mt-1">
                Go to <button type="button" onClick={() => router.push('/admin/providers')} className="text-primary underline">Providers</button> to configure outreach channels.
              </p>
            </div>
          )}

          {outreachAccounts.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-700">Outreach Channels</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {outreachAccounts.map((acct) => {
                  const isSelected = !!selectedOutreach[acct.id];
                  return (
                    <button
                      key={acct.id}
                      type="button"
                      onClick={() => toggleOutreach(acct.id, acct.providerType)}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${
                        isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className={`flex size-5 shrink-0 items-center justify-center rounded border ${
                        isSelected ? 'border-primary bg-primary text-white' : 'border-slate-300'
                      }`}>
                        {isSelected && <span className="material-symbols-outlined text-sm">check</span>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800 truncate">{PROVIDER_DISPLAY_NAMES[acct.providerType]} — {acct.accountLabel}</p>
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
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
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
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Preview</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{templatePreview}</p>
              </div>
            )}
          </div>

          {outreachError && <p className="text-sm text-red-600">{outreachError}</p>}

          <div className="flex justify-between">
            <Button onClick={() => setStep('done')} className="bg-slate-100 text-slate-700 hover:bg-slate-200">Skip for now</Button>
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
              Your project is set up. Head to the Leads page to watch leads flow through the pipeline.
            </p>
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
