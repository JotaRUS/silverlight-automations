import type { Job, Worker } from 'bullmq';

import { logger } from '../../core/logging/logger';
import { publishRealtimeEvent } from '../../core/realtime/realtimePubSub';

export interface WorkerJobEvent {
  queueName: string;
  jobId: string;
  status: 'active' | 'completed' | 'failed';
  timestamp: string;
  durationMs?: number;
  error?: string;
  data?: Record<string, unknown>;
}

const SAFE_DATA_KEYS = ['leadId', 'projectId', 'expertId'];

function extractSafeData(job: Job): Record<string, unknown> | undefined {
  const raw = job.data as Record<string, unknown> | undefined;
  if (!raw) return undefined;

  const inner = (typeof raw.data === 'object' && raw.data !== null ? raw.data : raw) as Record<
    string,
    unknown
  >;
  const safe: Record<string, unknown> = {};
  for (const key of SAFE_DATA_KEYS) {
    if (inner[key] !== undefined) safe[key] = inner[key];
  }
  return Object.keys(safe).length > 0 ? safe : undefined;
}

function computeDurationMs(job: Job): number | undefined {
  const started = job.processedOn ?? job.timestamp;
  if (typeof started !== 'number') return undefined;
  return Date.now() - started;
}

async function emitWorkerEvent(event: WorkerJobEvent): Promise<void> {
  try {
    await publishRealtimeEvent({
      namespace: 'admin',
      event: 'worker.job.update',
      data: event as unknown as Record<string, unknown>
    });
  } catch (err) {
    logger.warn({ err, event: event.status, queue: event.queueName }, 'worker-event-emit-failed');
  }
}

export function registerWorkerEventEmitter(worker: Worker, queueName: string): void {
  worker.on('active', (job: Job) => {
    void emitWorkerEvent({
      queueName,
      jobId: job.id ?? 'unknown',
      status: 'active',
      timestamp: new Date().toISOString(),
      data: extractSafeData(job)
    });
  });

  worker.on('completed', (job: Job) => {
    void emitWorkerEvent({
      queueName,
      jobId: job.id ?? 'unknown',
      status: 'completed',
      timestamp: new Date().toISOString(),
      durationMs: computeDurationMs(job),
      data: extractSafeData(job)
    });
  });

  worker.on('failed', (job: Job | undefined, error: Error) => {
    if (!job) return;
    void emitWorkerEvent({
      queueName,
      jobId: job.id ?? 'unknown',
      status: 'failed',
      timestamp: new Date().toISOString(),
      durationMs: computeDurationMs(job),
      error: error.message.slice(0, 500),
      data: extractSafeData(job)
    });
  });
}
