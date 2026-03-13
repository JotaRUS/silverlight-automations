#!/usr/bin/env npx tsx
/**
 * One-off script: queue Supabase sync jobs for all enriched leads
 * in projects that have a Supabase provider bound.
 *
 * Run: npx tsx scripts/queue-supabase-export-all.ts
 * Requires: API + worker processes running (or run worker after)
 */
import 'dotenv/config';

import { PrismaClient } from '@prisma/client';

import { getQueues } from '../src/queues';
import { buildJobId } from '../src/queues/jobId';
import { closeQueues } from '../src/queues';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const leads = await prisma.lead.findMany({
    where: {
      status: 'ENRICHED',
      deletedAt: null,
      project: {
        supabaseProviderAccountId: { not: null }
      }
    },
    select: {
      id: true,
      projectId: true,
      project: { select: { name: true } }
    }
  });

  if (leads.length === 0) {
    console.log('No enriched leads in projects with Supabase bound. Nothing to queue.');
    return;
  }

  const queues = getQueues();
  const batchTs = Date.now();
  const correlationId = `bulk-export-${batchTs}`;

  for (const lead of leads) {
    await queues.supabaseSyncQueue.add(
      'supabase-sync.enriched-lead',
      {
        correlationId,
        data: { projectId: lead.projectId, leadId: lead.id }
      },
      { jobId: buildJobId('supabase-sync', lead.projectId, lead.id, batchTs) }
    );
  }

  console.log(`Queued ${leads.length} Supabase sync job(s) for enriched leads.`);
  console.log('Ensure the worker process is running to process them (npm run dev:worker).');

  await closeQueues();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
