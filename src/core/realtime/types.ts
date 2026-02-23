export type RealtimeNamespace = 'admin' | 'caller';

export interface RealtimeEventEnvelope<TData = Record<string, unknown>> {
  namespace: RealtimeNamespace;
  event: string;
  data: TData;
}

