'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { addSalesNavSearches, createProject } from '@/services/projectService';

type WizardStep = 'basics' | 'salesnav' | 'done';

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

export default function NewProjectWizardPage(): JSX.Element {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>('basics');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [targetThreshold, setTargetThreshold] = useState('10');
  const [priority, setPriority] = useState('0');
  const [selectedGeos, setSelectedGeos] = useState<string[]>(['US']);

  const [projectId, setProjectId] = useState('');
  const [searchUrls, setSearchUrls] = useState('');
  const [urlError, setUrlError] = useState('');
  const [createError, setCreateError] = useState('');

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
      setStep('salesnav');
      setCreateError('');
    },
    onError: (err) => {
      setCreateError(err instanceof Error ? err.message : 'Failed to create project');
    }
  });

  const searchMutation = useMutation({
    mutationFn: async () => {
      const lines = searchUrls
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      if (lines.length < 6) {
        throw new Error('At least 6 SalesNav search URLs are required');
      }

      for (const line of lines) {
        try {
          new URL(line);
        } catch {
          throw new Error(`Invalid URL: ${line}`);
        }
      }

      const searches = lines.map((url) => ({
        sourceUrl: url,
        normalizedUrl: url.split('?')[0],
        metadata: {}
      }));

      return addSalesNavSearches(projectId, searches);
    },
    onSuccess: () => {
      setStep('done');
      setUrlError('');
    },
    onError: (err) => {
      setUrlError(err instanceof Error ? err.message : 'Failed to add searches');
    }
  });

  const toggleGeo = useCallback((code: string) => {
    setSelectedGeos((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  }, []);

  const goToLeads = useCallback(() => {
    router.push(`/admin/leads?projectId=${projectId}`);
  }, [router, projectId]);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        <StepIndicator num={1} label="Project Details" active={step === 'basics'} done={step !== 'basics'} />
        <div className="h-px flex-1 bg-slate-200" />
        <StepIndicator num={2} label="SalesNav Searches" active={step === 'salesnav'} done={step === 'done'} />
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
              <span className="material-symbols-outlined text-lg ml-1">arrow_forward</span>
            </Button>
          </div>
        </Card>
      )}

      {/* Step 2: SalesNav URLs */}
      {step === 'salesnav' && (
        <Card className="space-y-5">
          <div>
            <h2 className="text-lg font-bold">Add SalesNav Search URLs</h2>
            <p className="text-sm text-slate-500">
              Paste LinkedIn SalesNav search URLs — one per line. The external scraper will pick these up
              and start pushing leads into the pipeline automatically.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Search URLs (minimum 6)</label>
            <textarea
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary min-h-[200px] resize-y font-mono text-xs"
              value={searchUrls}
              onChange={(e) => setSearchUrls(e.target.value)}
              placeholder={`https://www.linkedin.com/sales/search/people?query=...\nhttps://www.linkedin.com/sales/search/people?query=...\nhttps://www.linkedin.com/sales/search/people?query=...\nhttps://www.linkedin.com/sales/search/people?query=...\nhttps://www.linkedin.com/sales/search/people?query=...\nhttps://www.linkedin.com/sales/search/people?query=...`}
            />
            <p className="mt-1 text-xs text-slate-400">
              {searchUrls.split('\n').filter((l) => l.trim()).length} URL{searchUrls.split('\n').filter((l) => l.trim()).length !== 1 ? 's' : ''} entered
            </p>
          </div>

          {urlError && <p className="text-sm text-red-600">{urlError}</p>}

          <div className="flex justify-between">
            <Button onClick={() => setStep('done')} className="bg-slate-100 text-slate-700 hover:bg-slate-200">
              Skip for now
            </Button>
            <Button
              onClick={() => searchMutation.mutate()}
              disabled={searchMutation.isPending}
            >
              {searchMutation.isPending ? 'Saving...' : 'Save & Continue'}
              <span className="material-symbols-outlined text-lg ml-1">arrow_forward</span>
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
              Your project is set up. Head to the Leads page to watch leads flow in as the SalesNav
              scraper processes your search URLs.
            </p>
          </div>
          <div className="flex justify-center gap-3">
            <Button onClick={() => router.push('/admin/projects')} className="bg-slate-100 text-slate-700 hover:bg-slate-200">
              Back to Projects
            </Button>
            <Button onClick={goToLeads}>
              <span className="material-symbols-outlined text-lg mr-1">visibility</span>
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
