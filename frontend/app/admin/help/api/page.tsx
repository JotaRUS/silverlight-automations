import Link from 'next/link';

import { Card } from '@/components/ui/card';

export default function ApiHelpPage(): JSX.Element {
  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">API Overview</h1>
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

      <Card className="flex items-center gap-4 p-5">
        <span className="material-symbols-outlined text-3xl text-primary">menu_book</span>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-slate-800">Full API Documentation</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Complete reference with every endpoint, request/response samples, error codes, troubleshooting, and a downloadable Postman collection.
          </p>
        </div>
        <Link
          href="/admin/api-docs"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-primary/90"
        >
          See API Docs
          <span className="material-symbols-outlined text-base">arrow_forward</span>
        </Link>
      </Card>
    </div>
  );
}
