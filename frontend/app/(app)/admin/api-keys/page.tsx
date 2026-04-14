'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  createApiKey,
  listApiKeys,
  revokeApiKey
} from '@/services/apiKeyService';
import type { ApiKeyScope } from '@/types/apiKey';

const ALL_SCOPES: Array<{ value: ApiKeyScope; label: string; description: string }> = [
  {
    value: 'read:projects',
    label: 'Read projects',
    description: 'List and view projects.'
  },
  {
    value: 'read:leads',
    label: 'Read leads',
    description: 'Read the admin leads dataset.'
  },
  {
    value: 'write:projects',
    label: 'Write projects',
    description: 'Create, update, and kick project workflows.'
  },
  {
    value: 'write:leads',
    label: 'Write leads',
    description: 'Update lead records through the admin API.'
  },
  {
    value: 'admin:providers',
    label: 'Admin providers',
    description: 'Manage provider accounts and test connections.'
  }
];

function formatDate(value: string | null): string {
  if (!value) {
    return 'Never';
  }
  return new Date(value).toLocaleString();
}

export default function ApiKeysPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<ApiKeyScope[]>([
    'read:projects',
    'read:leads',
    'write:projects',
    'write:leads'
  ]);
  const [revealedKey, setRevealedKey] = useState('');

  const apiKeysQuery = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => listApiKeys()
  });

  const createMutation = useMutation({
    mutationFn: async () =>
      createApiKey({
        name,
        scopes: selectedScopes,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null
      }),
    onSuccess: (result) => {
      setRevealedKey(result.apiKey);
      setName('');
      setExpiresAt('');
      void queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    }
  });

  const revokeMutation = useMutation({
    mutationFn: (apiKeyId: string) => revokeApiKey(apiKeyId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    }
  });

  const activeKeys = useMemo(
    () => (apiKeysQuery.data ?? []).filter((apiKey) => !apiKey.revokedAt),
    [apiKeysQuery.data]
  );

  const toggleScope = (scope: ApiKeyScope): void => {
    setSelectedScopes((current) =>
      current.includes(scope)
        ? current.filter((value) => value !== scope)
        : [...current, scope]
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">API Keys</h2>
        <p className="text-sm text-slate-500">
          Create personal platform keys for external tools without relying on browser cookies.
        </p>
      </div>

      <Card className="space-y-5">
        <div>
          <h3 className="text-base font-semibold text-slate-800">Create API key</h3>
          <p className="text-sm text-slate-500">
            The secret is shown once. Copy it immediately after creation.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Key name</label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="External CRM sync"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Optional expiry</label>
            <Input
              type="datetime-local"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">Scopes</label>
            <div className="grid gap-2 sm:grid-cols-2">
              {ALL_SCOPES.map((scope) => {
                const checked = selectedScopes.includes(scope.value);
                return (
                  <label
                    key={scope.value}
                    className={`rounded-xl border p-3 text-sm transition ${
                      checked
                        ? 'border-primary bg-primary/5'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleScope(scope.value)}
                        className="mt-1"
                      />
                      <div>
                        <p className="font-medium text-slate-800">{scope.label}</p>
                        <p className="text-xs text-slate-500">{scope.description}</p>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        {createMutation.error ? (
          <p className="text-sm text-red-600">
            {createMutation.error instanceof Error ? createMutation.error.message : 'Failed to create API key'}
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!name.trim() || selectedScopes.length === 0 || createMutation.isPending}
          >
            {createMutation.isPending ? 'Creating...' : 'Create API key'}
          </Button>
        </div>
      </Card>

      {revealedKey ? (
        <Card className="space-y-3 border-emerald-200 bg-emerald-50">
          <div>
            <h3 className="text-base font-semibold text-emerald-800">Copy your new key now</h3>
            <p className="text-sm text-emerald-700">This is the only time the full secret will be shown.</p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-white p-3 font-mono text-sm break-all">
            {revealedKey}
          </div>
        </Card>
      ) : null}

      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-800">Existing keys</h3>
            <p className="text-sm text-slate-500">{activeKeys.length} active key(s).</p>
          </div>
        </div>

        {apiKeysQuery.isLoading ? (
          <div className="py-10 text-center text-sm text-slate-400">Loading API keys...</div>
        ) : null}

        {apiKeysQuery.data?.map((apiKey) => (
          <div key={apiKey.id} className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-slate-800">{apiKey.name}</p>
                  {apiKey.revokedAt ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                      Revoked
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                      Active
                    </span>
                  )}
                </div>
                <p className="font-mono text-xs text-slate-500">{apiKey.keyPrefix}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {apiKey.scopes.map((scope) => (
                    <span
                      key={scope}
                      className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600"
                    >
                      {scope}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-slate-500">
                  Created {formatDate(apiKey.createdAt)}. Last used {formatDate(apiKey.lastUsedAt)}.
                </p>
                {apiKey.expiresAt ? (
                  <p className="text-xs text-slate-500">Expires {formatDate(apiKey.expiresAt)}.</p>
                ) : null}
              </div>

              {!apiKey.revokedAt ? (
                <Button
                  variant="secondary"
                  onClick={() => revokeMutation.mutate(apiKey.id)}
                  disabled={revokeMutation.isPending}
                >
                  Revoke
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </Card>

      <Card className="space-y-3">
        <h3 className="text-base font-semibold text-slate-800">Usage example</h3>
        <pre className="overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
{`curl -H "Authorization: Bearer slk_xxxxx.yyyyy" \\
  http://localhost:3000/api/v1/projects`}
        </pre>
      </Card>
    </div>
  );
}
