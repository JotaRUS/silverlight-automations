import type { Logger } from 'pino';

export const EVENT_CATEGORIES = {
  SYSTEM: 'SYSTEM',
  JOB: 'JOB',
  WEBHOOK: 'WEBHOOK',
  ENFORCEMENT: 'ENFORCEMENT',
  FRAUD: 'FRAUD',
  ALLOCATION: 'ALLOCATION'
} as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[keyof typeof EVENT_CATEGORIES];

export interface ProviderCallLogContext {
  category: EventCategory;
  provider: string;
  operation: string;
  correlationId: string;
  latencyMs: number;
  statusCode?: number;
  normalizedOutcome: string;
  errorClass?: string;
}

export function logProviderCall(logger: Logger, payload: ProviderCallLogContext): void {
  logger.info(payload, 'provider-call');
}
