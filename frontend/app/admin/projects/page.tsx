'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { createProject, listProjects, updateProject } from '@/services/projectService';
import { listProviderAccounts } from '@/services/providerService';
import type { ProjectRecord } from '@/types/project';

export default function ProjectManagementPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [projectName, setProjectName] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedProviderAccountId, setSelectedProviderAccountId] = useState('');

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: () => listProjects()
  });
  const providerAccountsQuery = useQuery({
    queryKey: ['provider-accounts'],
    queryFn: () => listProviderAccounts({ isActive: true })
  });

  const selectedProject = useMemo(() => {
    return projectsQuery.data?.find((project) => project.id === selectedProjectId) ?? null;
  }, [projectsQuery.data, selectedProjectId]);

  const createMutation = useMutation({
    mutationFn: async () =>
      createProject({
        name: projectName,
        targetThreshold: 10,
        geographyIsoCodes: ['US'],
        priority: 0,
        overrideCooldown: false,
        regionConfig: {}
      }),
    onSuccess: async (project) => {
      setProjectName('');
      setSelectedProjectId(project.id);
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
    }
  });

  const bindMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProjectId || !selectedProviderAccountId) {
        throw new Error('Select project and provider account');
      }

      const providerAccount = providerAccountsQuery.data?.find(
        (account) => account.id === selectedProviderAccountId
      );
      if (!providerAccount) {
        throw new Error('Provider account not found');
      }

      const fieldNameByProviderType: Record<string, keyof ProjectRecord> = {
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
      const fieldName = fieldNameByProviderType[providerAccount.providerType];
      await updateProject(selectedProjectId, {
        [fieldName]: selectedProviderAccountId
      } as Partial<ProjectRecord>);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
    }
  });

  return (
    <div className="space-y-6">
      <Card className="space-y-3">
        <h1 className="text-lg font-semibold">Project Management</h1>
        <div className="flex gap-2">
          <Input
            placeholder="New project name"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
          />
          <Button onClick={() => createMutation.mutate()} disabled={!projectName || createMutation.isPending}>
            {createMutation.isPending ? 'Creating...' : 'Create'}
          </Button>
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-base font-semibold">Provider Bindings</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={selectedProjectId}
            onChange={(event) => setSelectedProjectId(event.target.value)}
          >
            <option value="">Select project</option>
            {projectsQuery.data?.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={selectedProviderAccountId}
            onChange={(event) => setSelectedProviderAccountId(event.target.value)}
          >
            <option value="">Select provider account</option>
            {providerAccountsQuery.data?.map((account) => (
              <option key={account.id} value={account.id}>
                {account.providerType} :: {account.accountLabel}
              </option>
            ))}
          </select>
        </div>
        <Button onClick={() => bindMutation.mutate()} disabled={bindMutation.isPending}>
          {bindMutation.isPending ? 'Binding...' : 'Bind account to project'}
        </Button>
      </Card>

      {selectedProject ? (
        <Card className="space-y-2">
          <h3 className="text-base font-semibold">Current Project Config</h3>
          <pre className="overflow-auto rounded bg-slate-100 p-3 text-xs">
            {JSON.stringify(selectedProject, null, 2)}
          </pre>
        </Card>
      ) : null}
    </div>
  );
}
