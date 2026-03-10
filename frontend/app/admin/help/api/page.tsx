import Link from 'next/link';

import { Card } from '@/components/ui/card';

const endpointGroups = [
  {
    title: 'Auth',
    endpoints: ['POST /api/v1/auth/login', 'GET /api/v1/auth/me', 'GET /api/v1/auth/csrf']
  },
  {
    title: 'Projects',
    endpoints: [
      'GET /api/v1/projects',
      'POST /api/v1/projects',
      'PATCH /api/v1/projects/{projectId}',
      'POST /api/v1/projects/{projectId}/apollo-search'
    ]
  },
  {
    title: 'Leads',
    endpoints: ['GET /api/v1/admin/leads', 'PATCH /api/v1/admin/leads/{leadId}']
  },
  {
    title: 'Providers',
    endpoints: [
      'GET /api/v1/providers',
      'POST /api/v1/providers',
      'POST /api/v1/providers/{providerAccountId}/test-connection'
    ]
  },
  {
    title: 'API keys',
    endpoints: [
      'GET /api/v1/api-keys',
      'POST /api/v1/api-keys',
      'POST /api/v1/api-keys/{apiKeyId}/revoke'
    ]
  }
];

export default function ApiDocsPage(): JSX.Element {
  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">API Docs</h1>
        <p className="mt-1 text-sm text-slate-500">
          External integrations can use either browser session auth or a personal API key.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-800">Authentication modes</h2>
          <div className="space-y-2 text-sm text-slate-600">
            <p>
              <strong>Browser session</strong>: sign in through the web app, then use the CSRF token for
              mutating requests.
            </p>
            <p>
              <strong>API key</strong>: create a personal key from <Link href="/admin/api-keys" className="text-primary hover:underline">API Keys</Link> and pass it via
              <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs">Authorization: Bearer ...</code>
              or
              <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs">x-api-key</code>.
            </p>
          </div>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-800">Machine-readable contracts</h2>
          <div className="flex flex-wrap gap-3">
            <a
              href="/api/v1/openapi.json"
              className="inline-flex items-center rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Download OpenAPI JSON
            </a>
            <a
              href="/api/v1/docs/postman-collection"
              className="inline-flex items-center rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Download Postman Collection
            </a>
          </div>
        </Card>
      </div>

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-800">Quick example</h2>
        <pre className="overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
{`curl -H "Authorization: Bearer slk_xxxxx.yyyyy" \\
  http://localhost:3000/api/v1/projects

curl -X PATCH \\
  -H "Authorization: Bearer slk_xxxxx.yyyyy" \\
  -H "Content-Type: application/json" \\
  -d '{"status":"PAUSED"}' \\
  http://localhost:3000/api/v1/projects/{projectId}`}
        </pre>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-800">Endpoint groups</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {endpointGroups.map((group) => (
            <div key={group.title} className="rounded-xl border border-slate-200 p-4">
              <h3 className="font-medium text-slate-800">{group.title}</h3>
              <div className="mt-3 space-y-2">
                {group.endpoints.map((endpoint) => (
                  <div
                    key={endpoint}
                    className="rounded-md bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700"
                  >
                    {endpoint}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
