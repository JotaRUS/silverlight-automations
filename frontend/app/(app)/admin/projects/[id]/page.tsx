'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CountryMultiSelect } from '@/components/ui/country-multi-select';
import { Input } from '@/components/ui/input';
import { TagInput } from '@/components/ui/tag-input';
import {
  EXPORT_DESTINATION_TYPES,
  FIELD_TO_PROVIDER_TYPE,
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
  deleteProject,
  deleteSalesNavSearch,
  getProject,
  importLeadsCsv,
  kickProject,
  listProjectCompanies,
  listProjectJobTitles,
  listSalesNavSearches,
  scrapeSalesNav,
  updateProject
} from '@/services/projectService';
import type { SalesNavSearchRecord } from '@/services/projectService';
import type { ProviderAccount, ProviderType } from '@/types/provider';
import type { EmailStrategy, ProjectRecord, ProjectStatus } from '@/types/project';

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

const MAX_SEARCHES = 6;

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'PAUSED', label: 'Paused' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'ARCHIVED', label: 'Archived' }
];

export default function ProjectEditPage(): JSX.Element {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const projectId = params.id as string;

  const projectQuery = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId),
    enabled: !!projectId
  });

  const providersQuery = useQuery({
    queryKey: ['providerAccounts', 'active'],
    queryFn: () => listProviderAccounts({ isActive: true })
  });
  const companiesQuery = useQuery({
    queryKey: ['project-companies', projectId],
    queryFn: () => listProjectCompanies(projectId),
    enabled: !!projectId
  });
  const jobTitlesQuery = useQuery({
    queryKey: ['project-job-titles', projectId],
    queryFn: () => listProjectJobTitles(projectId),
    enabled: !!projectId
  });

  const salesNavQuery = useQuery({
    queryKey: ['sales-nav-searches', projectId],
    queryFn: () => listSalesNavSearches(projectId),
    enabled: !!projectId
  });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [targetThreshold, setTargetThreshold] = useState('');
  const [priority, setPriority] = useState('0');
  const [status, setStatus] = useState<ProjectStatus>('ACTIVE');
  const [selectedGeos, setSelectedGeos] = useState<string[]>([]);
  const [companyNames, setCompanyNames] = useState<string[]>([]);
  const [jobTitles, setJobTitles] = useState<string[]>([]);
  const [overrideCooldown, setOverrideCooldown] = useState(false);
  const [emailStrategy, setEmailStrategy] = useState<EmailStrategy>('PROFESSIONAL');
  const [selectedProviders, setSelectedProviders] = useState<Record<string, boolean>>({});
  const [outreachTemplate, setOutreachTemplate] = useState('');
  const templateRef = useRef<HTMLTextAreaElement>(null);
  const [initialized, setInitialized] = useState(false);
  const [filtersInitialized, setFiltersInitialized] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [newSearchUrl, setNewSearchUrl] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<{ rows: Record<string, string>[]; headers: string[] } | null>(null);
  const [importResult, setImportResult] = useState<{ imported: number; duplicatesSkipped: number; errors: string[] } | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const addSearchMutation = useMutation({
    mutationFn: (url: string) =>
      addSalesNavSearches(projectId, [{ sourceUrl: url, normalizedUrl: url }]),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sales-nav-searches', projectId] });
      setNewSearchUrl('');
      toast.success('Search URL added');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to add search')
  });

  const deleteSearchMutation = useMutation({
    mutationFn: (searchId: string) => deleteSalesNavSearch(projectId, searchId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sales-nav-searches', projectId] });
      toast.success('Search removed');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to remove search')
  });

  const importCsvMutation = useMutation({
    mutationFn: (rows: Record<string, string>[]) => importLeadsCsv(projectId, rows),
    onSuccess: (data) => {
      setImportResult(data);
      setCsvFile(null);
      setCsvPreview(null);
      if (csvInputRef.current) csvInputRef.current.value = '';
      void queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      toast.success(`Imported ${data.imported} leads`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Import failed')
  });

  const scrapeAllMutation = useMutation({
    mutationFn: () => scrapeSalesNav(projectId),
    onSuccess: (data) => {
      toast.success(`Queued scraping for ${data.queued} search URL(s)`);
      void queryClient.invalidateQueries({ queryKey: ['sales-nav-searches', projectId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to start scraping')
  });

  const scrapeOneMutation = useMutation({
    mutationFn: (searchId: string) => scrapeSalesNav(projectId, searchId),
    onSuccess: () => {
      toast.success('Scraping started for this search URL');
      void queryClient.invalidateQueries({ queryKey: ['sales-nav-searches', projectId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to start scraping')
  });

  const handleCsvSelect = useCallback(async (file: File) => {
    setCsvFile(file);
    setImportResult(null);
    const text = await file.text();
    const rows = parseSalesNavCsv(text);
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    setCsvPreview({ rows, headers });
  }, []);

  useEffect(() => {
    if (projectQuery.data && !initialized) {
      const p = projectQuery.data;
      setName(p.name);
      setDescription(p.description ?? '');
      setTargetThreshold(String(p.targetThreshold));
      setPriority(String(p.priority));
      setStatus(p.status);
      setSelectedGeos(p.geographyIsoCodes);
      setOverrideCooldown(p.overrideCooldown);
      setEmailStrategy((p.emailStrategy ?? 'PROFESSIONAL') as EmailStrategy);
      setOutreachTemplate((p as unknown as Record<string, unknown>).outreachMessageTemplate as string ?? '');

      const providerSelections: Record<string, boolean> = {};
      for (const [field, providerType] of Object.entries(FIELD_TO_PROVIDER_TYPE)) {
        const accountId = p[field as keyof ProjectRecord] as string | null | undefined;
        if (accountId) {
          providerSelections[accountId] = true;
        }
      }
      setSelectedProviders(providerSelections);
      setInitialized(true);
    }
  }, [projectQuery.data, initialized]);

  useEffect(() => {
    if (!filtersInitialized && companiesQuery.data && jobTitlesQuery.data) {
      setCompanyNames(companiesQuery.data.map((company) => company.name));
      setJobTitles(jobTitlesQuery.data.map((jobTitle) => jobTitle.titleOriginal));
      setFiltersInitialized(true);
    }
  }, [companiesQuery.data, jobTitlesQuery.data, filtersInitialized]);

  const accountsByType = useMemo(() => {
    const map = new Map<ProviderType, ProviderAccount[]>();
    for (const acct of providersQuery.data ?? []) {
      const list = map.get(acct.providerType) ?? [];
      list.push(acct);
      map.set(acct.providerType, list);
    }
    return map;
  }, [providersQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const providerBindings: Record<string, string | null> = {};
      const allAccounts = providersQuery.data ?? [];

      for (const [, field] of Object.entries(PROVIDER_TYPE_TO_FIELD)) {
        providerBindings[field] = null;
      }
      for (const acct of allAccounts) {
        if (selectedProviders[acct.id]) {
          providerBindings[PROVIDER_TYPE_TO_FIELD[acct.providerType]] = acct.id;
        }
      }

      const project = await updateProject(projectId, {
        name,
        description: description || undefined,
        targetThreshold: Number(targetThreshold) || 10,
        geographyIsoCodes: selectedGeos,
        priority: Number(priority) || 0,
        status,
        overrideCooldown,
        emailStrategy,
        outreachMessageTemplate: outreachTemplate || null,
        ...providerBindings
      } as Partial<ProjectRecord>);

      await Promise.all([
        addProjectCompanies(
          projectId,
          companyNames.map((companyName) => ({ name: companyName }))
        ),
        addProjectJobTitles(
          projectId,
          jobTitles.map((title) => ({ title }))
        )
      ]);

      return project;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      void queryClient.invalidateQueries({ queryKey: ['project-companies', projectId] });
      void queryClient.invalidateQueries({ queryKey: ['project-job-titles', projectId] });
      toast.success('Saved!');
      kickProject(projectId).catch(() => {});
      router.push(`/admin/leads?projectId=${projectId}`);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteProject(projectId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project deleted');
      router.push('/admin/projects');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete project');
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
    setOutreachTemplate(before + variable + after);
    requestAnimationFrame(() => {
      textarea.focus();
      const cursorPos = start + variable.length;
      textarea.setSelectionRange(cursorPos, cursorPos);
    });
  }, [outreachTemplate]);

  const selectedCount = Object.values(selectedProviders).filter(Boolean).length;

  if (projectQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (projectQuery.error) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <Card className="border-red-200 bg-red-50 text-sm text-red-700">
          Failed to load project: {projectQuery.error instanceof Error ? projectQuery.error.message : 'Unknown error'}
        </Card>
        <Link href="/admin/projects" className="text-sm text-primary hover:underline">
          Back to Projects
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/projects" className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <span className="material-symbols-outlined text-xl">arrow_back</span>
          </Link>
          <div>
            <h2 className="text-xl font-bold">Edit Project</h2>
            <p className="text-sm text-slate-500">{projectQuery.data?.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2" />
      </div>

      {saveMutation.error && (
        <Card className="border-red-200 bg-red-50 text-sm text-red-700">
          {saveMutation.error instanceof Error ? saveMutation.error.message : 'Failed to save'}
        </Card>
      )}

      {/* Project Details */}
      <Card className="space-y-5">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          <span className="material-symbols-outlined text-base text-slate-500">settings</span>
          Project Details
        </h3>

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
          <div className="grid grid-cols-3 gap-4">
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
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Status</label>
              <select
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary"
                value={status}
                onChange={(e) => setStatus(e.target.value as ProjectStatus)}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
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
            helperText="Stored company names feed future Apollo sourcing for this project."
            values={companyNames}
            onChange={setCompanyNames}
            placeholder="Type a company name and press Enter"
          />
          <TagInput
            label="Job Title Filters"
            helperText="Stored titles are reused by auto-sourcing and manual Apollo search."
            values={jobTitles}
            onChange={setJobTitles}
            placeholder="Type a job title and press Enter"
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Email Strategy</label>
            <select
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary"
              value={emailStrategy}
              onChange={(e) => setEmailStrategy(e.target.value as EmailStrategy)}
            >
              <option value="PROFESSIONAL">Professional (company email via Apollo pattern)</option>
              <option value="PERSONAL">Personal (Gmail/Hotmail via AnyLeads)</option>
              <option value="BOTH">Both (professional first, fallback to personal)</option>
            </select>
            <p className="mt-1 text-xs text-slate-400">Determines how email addresses are sourced during enrichment. Country default applies if not set.</p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={overrideCooldown}
              onChange={(e) => setOverrideCooldown(e.target.checked)}
              className="rounded border-slate-300"
            />
            <span className="text-sm text-slate-700">Override 30-day cooldown for this project</span>
          </label>
        </div>
      </Card>

      {/* Progress (read-only) */}
      {projectQuery.data && (
        <Card className="space-y-3">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-slate-500">monitoring</span>
            Progress
          </h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-2xl font-bold tabular-nums">{projectQuery.data.signedUpCount}</p>
              <p className="text-xs text-slate-500">Signed Up</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-2xl font-bold tabular-nums">{projectQuery.data.targetThreshold}</p>
              <p className="text-xs text-slate-500">Target</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-2xl font-bold tabular-nums">{Number(projectQuery.data.completionPercentage).toFixed(0)}%</p>
              <p className="text-xs text-slate-500">Completion</p>
            </div>
          </div>
        </Card>
      )}

      {/* Lead Sources — provider matrix */}
      <Card className="space-y-5">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          <span className="material-symbols-outlined text-base text-slate-500">hub</span>
          Lead Sources &amp; Providers
        </h3>
        <p className="text-sm text-slate-500">
          Select which configured tools to use for this project. Only accounts with saved API keys are shown.
        </p>

        {providersQuery.isLoading && (
          <div className="flex items-center justify-center py-8 text-slate-400">
            <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
            Loading providers...
          </div>
        )}

        {providersQuery.isSuccess && (providersQuery.data ?? []).length === 0 && (
          <div className="rounded-lg border-2 border-dashed border-slate-200 p-6 text-center">
            <span className="material-symbols-outlined text-3xl text-slate-300">key_off</span>
            <p className="text-sm font-medium text-slate-600 mt-1">No provider accounts configured</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Go to <Link href="/admin/providers" className="text-primary underline">Providers</Link> to add API keys.
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
                    <h4 className="text-sm font-semibold text-slate-700">{cat.label}</h4>
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
                One account per tool type.
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* Export Destinations */}
      <Card className="space-y-5">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          <span className="material-symbols-outlined text-base text-slate-500">cloud_upload</span>
          Export Destinations
        </h3>
        <p className="text-sm text-slate-500">
          Enriched leads are automatically exported to the selected destinations. Only configured Google Sheets or Supabase accounts are shown.
        </p>

        {exportAccounts.length === 0 && (
          <div className="rounded-lg border-2 border-dashed border-slate-200 p-6 text-center">
            <span className="material-symbols-outlined text-3xl text-slate-300">cloud_off</span>
            <p className="text-sm font-medium text-slate-600 mt-1">No export destinations configured</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Go to <Link href="/admin/providers" className="text-primary underline">Providers</Link> to add a Google Sheets or Supabase account.
            </p>
          </div>
        )}

        {exportAccounts.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {exportAccounts.map((acct) => {
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
            })}
          </div>
        )}
      </Card>

      {/* Outreach Configuration */}
      <Card className="space-y-5">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          <span className="material-symbols-outlined text-base text-slate-500">campaign</span>
          Outreach Configuration
        </h3>
        <p className="text-sm text-slate-500">
          Select outreach channels and write a message template. Outreach is sent automatically when leads are enriched.
        </p>

        {outreachAccounts.length === 0 && (
          <div className="rounded-lg border-2 border-dashed border-slate-200 p-6 text-center">
            <span className="material-symbols-outlined text-3xl text-slate-300">campaign</span>
            <p className="text-sm font-medium text-slate-600 mt-1">No healthy outreach channels available</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Go to <Link href="/admin/providers" className="text-primary underline">Providers</Link> to configure outreach channels.
            </p>
          </div>
        )}

        {outreachAccounts.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-slate-700">Outreach Channels</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {outreachAccounts.map((acct) => {
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
            <h4 className="text-sm font-semibold text-slate-700">Message Template</h4>
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
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
            <span className="material-symbols-outlined text-base text-amber-500">info</span>
            <p className="text-xs text-slate-500">
              Outreach will only be sent when all template variables have data for a lead.
            </p>
          </div>
        </div>
      </Card>

      {/* Sales Navigator Searches */}
      <Card className="space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-slate-500">travel_explore</span>
            Sales Navigator Searches
          </h3>
          <div className="flex items-center gap-2">
            {(salesNavQuery.data ?? []).length > 0 && (
              <button
                type="button"
                onClick={() => scrapeAllMutation.mutate()}
                disabled={scrapeAllMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-sm">
                  {scrapeAllMutation.isPending ? 'progress_activity' : 'download'}
                </span>
                {scrapeAllMutation.isPending ? 'Scraping...' : 'Scrape All'}
              </button>
            )}
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              {salesNavQuery.data?.length ?? 0}/{MAX_SEARCHES} recommended
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${Math.min(((salesNavQuery.data?.length ?? 0) / MAX_SEARCHES) * 100, 100)}%` }}
            />
          </div>
          <p className="text-xs text-slate-400">{salesNavQuery.data?.length ?? 0} of {MAX_SEARCHES} search URLs configured</p>
        </div>

        {/* List of active searches */}
        {salesNavQuery.isLoading && (
          <div className="flex items-center justify-center py-4 text-slate-400">
            <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
            Loading searches...
          </div>
        )}

        {salesNavQuery.isSuccess && (salesNavQuery.data ?? []).length === 0 && (
          <div className="rounded-lg border-2 border-dashed border-slate-200 p-6 text-center">
            <span className="material-symbols-outlined text-3xl text-slate-300">link_off</span>
            <p className="text-sm font-medium text-slate-600 mt-1">No Sales Navigator searches added</p>
            <p className="text-xs text-slate-400 mt-0.5">Add LinkedIn Sales Navigator search URLs below to start sourcing.</p>
          </div>
        )}

        {salesNavQuery.isSuccess && (salesNavQuery.data ?? []).length > 0 && (
          <div className="space-y-2">
            {(salesNavQuery.data ?? []).map((search: SalesNavSearchRecord) => (
              <div
                key={search.id}
                className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5"
              >
                <span className="material-symbols-outlined text-base text-slate-400">link</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 truncate" title={search.sourceUrl}>
                    {search.sourceUrl.length > 60 ? search.sourceUrl.slice(0, 60) + '…' : search.sourceUrl}
                  </p>
                  <div className="flex items-center gap-3 text-[11px] text-slate-400">
                    <span>Added {new Date(search.createdAt).toLocaleDateString()}</span>
                    {search._count && <span>{search._count.leads} leads</span>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => scrapeOneMutation.mutate(search.id)}
                  disabled={scrapeOneMutation.isPending}
                  className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
                >
                  {scrapeOneMutation.isPending ? 'Scraping...' : 'Scrape'}
                </button>
                <button
                  type="button"
                  onClick={() => deleteSearchMutation.mutate(search.id)}
                  disabled={deleteSearchMutation.isPending}
                  className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add new search URL */}
        <div className="flex gap-2">
          <Input
            value={newSearchUrl}
            onChange={(e) => setNewSearchUrl(e.target.value)}
            placeholder="Paste Sales Navigator search URL..."
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newSearchUrl.trim()) {
                addSearchMutation.mutate(newSearchUrl.trim());
              }
            }}
          />
          <Button
            onClick={() => addSearchMutation.mutate(newSearchUrl.trim())}
            disabled={!newSearchUrl.trim() || addSearchMutation.isPending}
          >
            {addSearchMutation.isPending ? 'Adding...' : 'Add'}
          </Button>
        </div>
      </Card>

      {/* CSV Import */}
      <Card className="space-y-5">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          <span className="material-symbols-outlined text-base text-slate-500">upload_file</span>
          Import Leads from CSV
        </h3>

        {/* Drop zone */}
        <div
          className="rounded-lg border-2 border-dashed border-slate-300 p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
          onClick={() => csvInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const file = e.dataTransfer.files?.[0];
            if (file && file.name.endsWith('.csv')) void handleCsvSelect(file);
          }}
        >
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleCsvSelect(file);
            }}
          />
          <span className="material-symbols-outlined text-4xl text-slate-300">cloud_upload</span>
          <p className="text-sm font-medium text-slate-600 mt-2">
            {csvFile ? csvFile.name : 'Click or drag a CSV file here'}
          </p>
          <p className="text-xs text-slate-400 mt-1">Supports exported Sales Navigator CSV format</p>
        </div>

        {/* Preview */}
        {csvPreview && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-base text-emerald-500">check_circle</span>
              <div>
                <p className="text-sm font-medium text-slate-800">{csvPreview.rows.length} rows detected</p>
                <p className="text-xs text-slate-400 truncate">
                  Columns: {csvPreview.headers.join(', ')}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => importCsvMutation.mutate(csvPreview.rows)}
                disabled={importCsvMutation.isPending || csvPreview.rows.length === 0}
              >
                {importCsvMutation.isPending ? 'Importing...' : `Import ${csvPreview.rows.length} Leads`}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setCsvFile(null);
                  setCsvPreview(null);
                  setImportResult(null);
                  if (csvInputRef.current) csvInputRef.current.value = '';
                }}
              >
                Clear
              </Button>
            </div>
          </div>
        )}

        {/* Result summary */}
        {importResult && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2">
            <h4 className="text-sm font-semibold text-slate-700">Import Complete</h4>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2">
                <p className="text-lg font-bold text-emerald-700">{importResult.imported}</p>
                <p className="text-[11px] text-emerald-600">Imported</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
                <p className="text-lg font-bold text-amber-700">{importResult.duplicatesSkipped}</p>
                <p className="text-[11px] text-amber-600">Skipped</p>
              </div>
              <div className="rounded-lg border border-red-200 bg-red-50 p-2">
                <p className="text-lg font-bold text-red-700">{importResult.errors.length}</p>
                <p className="text-[11px] text-red-600">Errors</p>
              </div>
            </div>
            {importResult.errors.length > 0 && (
              <div className="mt-2 max-h-32 overflow-y-auto rounded border border-red-100 bg-red-50/50 p-2">
                {importResult.errors.map((err, i) => (
                  <p key={i} className="text-xs text-red-600">{err}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Quick links */}
      <Card className="flex flex-wrap gap-3">
        <Link
          href={`/admin/leads?projectId=${projectId}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <span className="material-symbols-outlined text-base">group</span>
          View Leads
        </Link>
        <Link
          href={`/admin/outreach`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <span className="material-symbols-outlined text-base">campaign</span>
          Outreach
        </Link>
        <Link
          href="/admin/projects"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <span className="material-symbols-outlined text-base">list</span>
          All Projects
        </Link>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={!name || selectedGeos.length === 0 || saveMutation.isPending}
        >
          {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      {/* Danger Zone */}
      <Card className="border-red-200 space-y-3">
        <h3 className="font-semibold text-red-700 flex items-center gap-2">
          <span className="material-symbols-outlined text-base">warning</span>
          Danger Zone
        </h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-800">Delete this project</p>
            <p className="text-xs text-slate-500">This will archive the project and hide it from the project list.</p>
          </div>
          <Button
            variant="danger"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={deleteMutation.isPending}
          >
            <span className="material-symbols-outlined text-base mr-1">delete</span>
            Delete Project
          </Button>
        </div>
      </Card>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-red-100">
                <span className="material-symbols-outlined text-red-600">warning</span>
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Delete project?</h3>
                <p className="text-sm text-slate-500">
                  Are you sure you want to delete <strong>{projectQuery.data?.name}</strong>? This action cannot be easily undone.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleteMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Yes, delete'}
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
