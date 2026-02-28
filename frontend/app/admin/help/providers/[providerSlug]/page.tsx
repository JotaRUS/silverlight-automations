import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Card } from '@/components/ui/card';

import { providerGuideDocBySlug, providerGuideDocs } from '../providerGuides';

interface ProviderGuidePageProps {
  params: {
    providerSlug: string;
  };
}

export function generateStaticParams(): Array<{ providerSlug: string }> {
  return providerGuideDocs.map((doc) => ({ providerSlug: doc.slug }));
}

export default function ProviderGuidePage({ params }: ProviderGuidePageProps): JSX.Element {
  const doc = providerGuideDocBySlug[params.providerSlug];
  if (!doc) {
    notFound();
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link href="/admin/help" className="text-primary hover:underline">Help Center</Link>
          <span className="text-slate-300">/</span>
          <Link href="/admin/help/providers" className="text-primary hover:underline">Providers</Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-500">{doc.name}</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">{doc.name} Setup Guide</h1>
        <p className="text-sm text-slate-500 leading-relaxed">{doc.summary}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600">
            {doc.category}
          </span>
          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600">
            {doc.providerType}
          </span>
          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-500">
            Verified {doc.lastReviewed}
          </span>
        </div>
      </div>

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-800">Credentials required</h2>
        <div className="space-y-2">
          {doc.credentials.map((field) => (
            <div key={field.key} className="rounded-lg border border-slate-200 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-slate-800">{field.label}</p>
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{field.key}</code>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                  field.required
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}>
                  {field.required ? 'required' : 'optional'}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">{field.description}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-800">Prerequisites</h2>
        <ul className="list-disc list-inside space-y-1 text-sm text-slate-600">
          {doc.prerequisites.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-800">How to obtain credentials</h2>
        <ol className="list-decimal list-inside space-y-1.5 text-sm text-slate-600">
          {doc.credentialSteps.map((step, index) => (
            <li key={`${index}-${step}`}>{step}</li>
          ))}
        </ol>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-800">Configure in this platform</h2>
        <ol className="list-decimal list-inside space-y-1.5 text-sm text-slate-600">
          {doc.platformConfiguration.map((step, index) => (
            <li key={`${index}-${step}`}>{step}</li>
          ))}
        </ol>
      </Card>

      {doc.webhookConfiguration && (
        <Card className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-800">Webhook / callback configuration</h2>
          <div className="space-y-2 text-sm text-slate-600">
            <p>
              <span className="font-medium text-slate-700">Endpoint:</span>{' '}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{doc.webhookConfiguration.endpointTemplate}</code>
            </p>
            <p>
              <span className="font-medium text-slate-700">Method:</span>{' '}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{doc.webhookConfiguration.method}</code>
            </p>
            <div>
              <p className="font-medium text-slate-700">Expected headers / auth</p>
              <ul className="mt-1 list-disc list-inside space-y-1">
                {doc.webhookConfiguration.expectedHeaders.map((header) => (
                  <li key={header}><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{header}</code></li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-medium text-slate-700">Notes</p>
              <ul className="mt-1 list-disc list-inside space-y-1">
                {doc.webhookConfiguration.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-800">Validation checklist</h2>
        <ul className="list-disc list-inside space-y-1 text-sm text-slate-600">
          {doc.validationChecklist.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-800">Common pitfalls</h2>
        <div className="space-y-2">
          {doc.commonPitfalls.map((item) => (
            <div key={item.issue} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-semibold text-amber-900">{item.issue}</p>
              <p className="mt-1 text-sm text-amber-800">{item.resolution}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-800">Official references</h2>
        <ul className="space-y-1.5 text-sm">
          {doc.officialLinks.map((link) => (
            <li key={link.url}>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
