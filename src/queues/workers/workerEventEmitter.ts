import type { Job, Worker } from 'bullmq';

import { logger } from '../../core/logging/logger';
import { prisma } from '../../db/client';
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

const nameCache = new Map<string, { name: string; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function resolveProjectName(id: string): Promise<string | undefined> {
  const cached = nameCache.get(`p:${id}`);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.name;
  try {
    const project = await prisma.project.findUnique({ where: { id }, select: { name: true } });
    if (project) {
      nameCache.set(`p:${id}`, { name: project.name, ts: Date.now() });
      return project.name;
    }
  } catch { /* ignore */ }
  return undefined;
}

async function resolveExpertName(id: string): Promise<string | undefined> {
  const cached = nameCache.get(`e:${id}`);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.name;
  try {
    const expert = await prisma.expert.findUnique({ where: { id }, select: { fullName: true } });
    if (expert) {
      nameCache.set(`e:${id}`, { name: expert.fullName, ts: Date.now() });
      return expert.fullName;
    }
  } catch { /* ignore */ }
  return undefined;
}

async function extractSafeData(job: Job): Promise<Record<string, unknown> | undefined> {
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

  if (typeof safe.projectId === 'string') {
    const name = await resolveProjectName(safe.projectId);
    if (name) safe.projectName = name;
  }
  if (typeof safe.expertId === 'string') {
    const name = await resolveExpertName(safe.expertId);
    if (name) safe.expertName = name;
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
    void (async () => {
      const data = await extractSafeData(job);
      await emitWorkerEvent({
        queueName,
        jobId: job.id ?? 'unknown',
        status: 'active',
        timestamp: new Date().toISOString(),
        data
      });
    })();
  });

  worker.on('completed', (job: Job) => {
    void (async () => {
      const data = await extractSafeData(job);
      await emitWorkerEvent({
        queueName,
        jobId: job.id ?? 'unknown',
        status: 'completed',
        timestamp: new Date().toISOString(),
        durationMs: computeDurationMs(job),
        data
      });
    })();
  });

  worker.on('failed', (job: Job | undefined, error: Error) => {
    if (!job) return;
    void (async () => {
      const data = await extractSafeData(job);
      await emitWorkerEvent({
        queueName,
        jobId: job.id ?? 'unknown',
        status: 'failed',
        timestamp: new Date().toISOString(),
        durationMs: computeDurationMs(job),
        error: error.message.slice(0, 500),
        data
      });
    })();
  });
}
