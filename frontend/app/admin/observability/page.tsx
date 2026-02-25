'use client';

import { useQuery } from '@tanstack/react-query';

import { Card } from '@/components/ui/card';
import {
  fetchDlq,
  fetchFraudEvents,
  fetchProviderRateLimitEvents,
  fetchStateViolations,
  fetchWebhookEvents
} from '@/services/adminService';

export default function ObservabilityPage(): JSX.Element {
  const dlqQuery = useQuery({
    queryKey: ['observability', 'dlq'],
    queryFn: () => fetchDlq()
  });
  const webhookEventsQuery = useQuery({
    queryKey: ['observability', 'webhooks'],
    queryFn: () => fetchWebhookEvents()
  });
  const providerRateLimitEventsQuery = useQuery({
    queryKey: ['observability', 'provider-limits'],
    queryFn: () => fetchProviderRateLimitEvents()
  });
  const fraudQuery = useQuery({
    queryKey: ['observability', 'fraud'],
    queryFn: () => fetchFraudEvents()
  });
  const stateViolationsQuery = useQuery({
    queryKey: ['observability', 'state-violations'],
    queryFn: () => fetchStateViolations()
  });

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">System Observability</h1>

      <Card>
        <h2 className="mb-2 font-semibold">Dead Letter Queue</h2>
        <pre className="max-h-60 overflow-auto rounded bg-slate-100 p-2 text-xs">
          {JSON.stringify(dlqQuery.data ?? [], null, 2)}
        </pre>
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Webhook Event Log</h2>
        <pre className="max-h-60 overflow-auto rounded bg-slate-100 p-2 text-xs">
          {JSON.stringify(webhookEventsQuery.data ?? [], null, 2)}
        </pre>
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Provider Rate Limit Events</h2>
        <pre className="max-h-60 overflow-auto rounded bg-slate-100 p-2 text-xs">
          {JSON.stringify(providerRateLimitEventsQuery.data ?? [], null, 2)}
        </pre>
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Fraud Events</h2>
        <pre className="max-h-60 overflow-auto rounded bg-slate-100 p-2 text-xs">
          {JSON.stringify(fraudQuery.data ?? {}, null, 2)}
        </pre>
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">State Machine Violations</h2>
        <pre className="max-h-60 overflow-auto rounded bg-slate-100 p-2 text-xs">
          {JSON.stringify(stateViolationsQuery.data ?? [], null, 2)}
        </pre>
      </Card>
    </div>
  );
}
