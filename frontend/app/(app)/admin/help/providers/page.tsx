import Link from 'next/link';

import { Card } from '@/components/ui/card';

import { providerGuideCategories } from './providerGuides';

export default function ProviderGuidesDirectoryPage(): JSX.Element {
  return (
    <div className="max-w-6xl space-y-6">
      <div className="space-y-2">
        <Link href="/admin/help" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Back to Help Center
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">Provider Setup Directory</h1>
        <p className="text-sm text-slate-500">
          Complete setup guides for every provider integration in this platform. Each guide includes credential
          requirements, official docs, platform-specific configuration, and troubleshooting.
        </p>
      </div>

      {providerGuideCategories.map((group) => (
        <Card key={group.category} className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800">{group.category}</h2>
            <span className="text-xs text-slate-400">{group.docs.length} provider{group.docs.length !== 1 ? 's' : ''}</span>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {group.docs.map((doc) => (
              <div key={doc.slug} className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-800">{doc.name}</p>
                  <code className="rounded bg-white px-1.5 py-0.5 text-[10px] text-slate-500">{doc.providerType}</code>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">{doc.summary}</p>
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Required fields</p>
                  <ul className="space-y-0.5 text-xs text-slate-600">
                    {doc.credentials.filter((c) => c.required).map((field) => (
                      <li key={field.key} className="list-disc list-inside">
                        {field.label}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="pt-1">
                  <Link
                    href={`/admin/help/providers/${doc.slug}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    Open full setup guide
                    <span className="material-symbols-outlined text-sm">open_in_new</span>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
