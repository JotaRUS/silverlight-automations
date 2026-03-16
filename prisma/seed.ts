import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedAdmin(): Promise<void> {
  const email = 'admin@silverlight.ai';
  const password = 'admin123!';
  const name = 'Admin';

  const existing = await prisma.caller.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin user already exists (id: ${existing.id}, email: ${email}). Skipping admin seed.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const caller = await prisma.caller.create({
    data: {
      email,
      name,
      passwordHash,
      role: 'ADMIN',
      timezone: 'UTC',
      languageCodes: ['en'],
      regionIsoCodes: ['US'],
      allocationStatus: 'ACTIVE',
      fraudStatus: 'NONE'
    }
  });

  console.log(`Seeded admin user:`);
  console.log(`  ID:       ${caller.id}`);
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
  console.log(`  Role:     ADMIN`);
}

function rankScore(tierBase: number, deficit: number, contacts: number, attempts: number): number {
  const deficitPoints = (deficit / 100) * 17;
  const contactBonus = Math.min(contacts, 4) / 4 * 5;
  const attemptPenalty = Math.min(attempts, 6) / 6 * 3;
  const raw = tierBase + deficitPoints + Math.max(0, contactBonus - attemptPenalty);
  return Math.round(Math.min(100, Math.max(0, raw)) * 100) / 100;
}

interface ExpertSeed {
  fullName: string;
  firstName: string;
  lastName: string;
  role: string;
  company: string;
  country: string;
  tz: string;
  langs: string[];
  phone: string;
  email?: string;
}

const DEMO_EXPERTS: ExpertSeed[] = [
  { fullName: 'Maria Lopez', firstName: 'Maria', lastName: 'Lopez', role: 'Head of People', company: 'TechCorp Latam', country: 'UY', tz: 'America/Montevideo', langs: ['es', 'en'], phone: '+59899123456', email: 'maria@techcorp.uy' },
  { fullName: 'Carlos Fernandez', firstName: 'Carlos', lastName: 'Fernandez', role: 'VP Human Resources', company: 'Grupo Sur', country: 'AR', tz: 'America/Argentina/Buenos_Aires', langs: ['es'], phone: '+5491155678901', email: 'carlos@gruposur.ar' },
  { fullName: 'Ana Gutierrez', firstName: 'Ana', lastName: 'Gutierrez', role: 'HR Business Partner', company: 'MegaBank', country: 'UY', tz: 'America/Montevideo', langs: ['es', 'en'], phone: '+59898765432' },
  { fullName: 'Roberto Diaz', firstName: 'Roberto', lastName: 'Diaz', role: 'Talent Acquisition Lead', company: 'Globant', country: 'AR', tz: 'America/Argentina/Buenos_Aires', langs: ['es', 'en'], phone: '+5491176543210', email: 'roberto@globant.com' },
  { fullName: 'Lucia Perez', firstName: 'Lucia', lastName: 'Perez', role: 'People Operations Manager', company: 'dLocal', country: 'UY', tz: 'America/Montevideo', langs: ['es'], phone: '+59894567890' },
  { fullName: 'James Porter', firstName: 'James', lastName: 'Porter', role: 'Engineering Lead', company: 'FinTech UK', country: 'GB', tz: 'Europe/London', langs: ['en'], phone: '+447911123456', email: 'james@fintechuk.co.uk' },
  { fullName: 'Elena Schneider', firstName: 'Elena', lastName: 'Schneider', role: 'Staff Engineer', company: 'AutoTech DE', country: 'DE', tz: 'Europe/Berlin', langs: ['de', 'en'], phone: '+4915112345678' },
  { fullName: 'Oliver Hughes', firstName: 'Oliver', lastName: 'Hughes', role: 'VP Engineering', company: 'Revolut', country: 'GB', tz: 'Europe/London', langs: ['en'], phone: '+447700900111', email: 'oliver@revolut.com' },
  { fullName: 'Hans Mueller', firstName: 'Hans', lastName: 'Mueller', role: 'CTO', company: 'N26', country: 'DE', tz: 'Europe/Berlin', langs: ['de', 'en'], phone: '+4917612345678', email: 'hans@n26.com' },
  { fullName: 'Sophie Martin', firstName: 'Sophie', lastName: 'Martin', role: 'Principal Engineer', company: 'Wise', country: 'GB', tz: 'Europe/London', langs: ['en', 'fr'], phone: '+447800111222' },
  { fullName: 'Pedro Alvarez', firstName: 'Pedro', lastName: 'Alvarez', role: 'CHRO', company: 'Pedidos Ya', country: 'UY', tz: 'America/Montevideo', langs: ['es'], phone: '+59891234567', email: 'pedro@pedidosya.com' },
  { fullName: 'Katarina Schmidt', firstName: 'Katarina', lastName: 'Schmidt', role: 'Eng Manager', company: 'Zalando', country: 'DE', tz: 'Europe/Berlin', langs: ['de', 'en'], phone: '+4915198765432' },
  { fullName: 'Diego Romero', firstName: 'Diego', lastName: 'Romero', role: 'Head of HR', company: 'MercadoLibre', country: 'AR', tz: 'America/Argentina/Buenos_Aires', langs: ['es', 'en', 'pt'], phone: '+5491123456789', email: 'diego@meli.com' },
  { fullName: 'William Clarke', firstName: 'William', lastName: 'Clarke', role: 'Tech Lead', company: 'Deliveroo', country: 'GB', tz: 'Europe/London', langs: ['en'], phone: '+447911999888' },
  { fullName: 'Valentina Morales', firstName: 'Valentina', lastName: 'Morales', role: 'HR Director', company: 'Tata Consultancy', country: 'AR', tz: 'America/Argentina/Buenos_Aires', langs: ['es', 'en'], phone: '+5491198765432' },
];

async function seedRankingDemoData(): Promise<void> {
  const existingSnapshots = await prisma.rankingSnapshot.count();
  if (existingSnapshots > 0) {
    console.log(`Ranking snapshots already exist (${existingSnapshots}). Skipping ranking seed.`);
    return;
  }

  const projects = await Promise.all([
    prisma.project.create({
      data: {
        name: 'Senior HR Latam',
        description: 'Recruiting senior HR professionals across Latin America',
        targetThreshold: 20,
        signedUpCount: 3,
        completionPercentage: 15.0,
        status: 'ACTIVE',
        priority: 10,
        geographyIsoCodes: ['UY', 'AR'],
        regionConfig: { UY: { channels: ['EMAIL', 'WHATSAPP'] }, AR: { channels: ['EMAIL', 'WHATSAPP'] } }
      }
    }),
    prisma.project.create({
      data: {
        name: 'Tech Leads EMEA',
        description: 'Engineering leads across Europe, Middle East and Africa',
        targetThreshold: 10,
        signedUpCount: 3,
        completionPercentage: 30.0,
        status: 'ACTIVE',
        priority: 8,
        geographyIsoCodes: ['GB', 'DE'],
        regionConfig: { GB: { channels: ['EMAIL'] }, DE: { channels: ['EMAIL'] } }
      }
    }),
    prisma.project.create({
      data: {
        name: 'FinOps North America',
        description: 'Financial operations experts across US and Canada',
        targetThreshold: 15,
        signedUpCount: 9,
        completionPercentage: 60.0,
        status: 'ACTIVE',
        priority: 6,
        geographyIsoCodes: ['US', 'CA'],
        regionConfig: { US: { channels: ['EMAIL', 'SMS'] }, CA: { channels: ['EMAIL'] } }
      }
    }),
    prisma.project.create({
      data: {
        name: 'Data Science APAC',
        description: 'Data science and ML experts across Asia Pacific',
        targetThreshold: 25,
        signedUpCount: 1,
        completionPercentage: 4.0,
        status: 'ACTIVE',
        priority: 12,
        geographyIsoCodes: ['SG', 'JP', 'AU'],
        regionConfig: { SG: { channels: ['EMAIL', 'WHATSAPP'] }, JP: { channels: ['EMAIL'] }, AU: { channels: ['EMAIL'] } }
      }
    })
  ]);

  const [hrProject, techProject, finopsProject, dsProject] = projects;
  const hrDeficit = (1 - 3 / 20) * 100;
  const techDeficit = (1 - 3 / 10) * 100;
  const finopsDeficit = (1 - 9 / 15) * 100;
  const dsDeficit = (1 - 1 / 25) * 100;

  const experts = await Promise.all(
    DEMO_EXPERTS.map((e) => {
      const contacts: { type: 'PHONE' | 'EMAIL'; value: string; valueNormalized: string; isPrimary: boolean; verificationStatus: 'VERIFIED' }[] = [
        { type: 'PHONE', value: e.phone, valueNormalized: e.phone, isPrimary: true, verificationStatus: 'VERIFIED' }
      ];
      if (e.email) {
        contacts.push({ type: 'EMAIL', value: e.email, valueNormalized: e.email, isPrimary: false, verificationStatus: 'VERIFIED' });
      }
      return prisma.expert.create({
        data: {
          fullName: e.fullName,
          firstName: e.firstName,
          lastName: e.lastName,
          currentRole: e.role,
          currentCompany: e.company,
          countryIso: e.country,
          timezone: e.tz,
          languageCodes: e.langs,
          status: 'ACTIVE',
          contacts: { create: contacts }
        }
      });
    })
  );

  const expertProjectAssignment: [number, typeof hrProject][] = [
    [0, hrProject], [1, hrProject], [2, hrProject], [3, hrProject], [4, hrProject],
    [10, hrProject], [12, hrProject], [14, hrProject],
    [5, techProject], [6, techProject], [7, techProject], [8, techProject],
    [9, techProject], [11, techProject], [13, techProject],
  ];

  for (const [i, project] of expertProjectAssignment) {
    const e = experts[i];
    await prisma.lead.create({
      data: {
        projectId: project.id,
        expertId: e.id,
        fullName: e.fullName,
        firstName: e.firstName,
        lastName: e.lastName,
        jobTitle: e.currentRole,
        countryIso: e.countryIso,
        status: 'CONTACTED'
      }
    });
  }

  interface SnapshotSeed {
    projectId: string;
    expertIdx: number;
    fresh: boolean;
    chase: boolean;
    rejection: boolean;
    deficit: number;
    contacts: number;
    attempts: number;
  }

  const snapshots: SnapshotSeed[] = [
    // Tier 1 — Fresh replies (75-97) varied by deficit, contacts, attempts
    { projectId: dsProject.id, expertIdx: 0, fresh: true, chase: false, rejection: false, deficit: dsDeficit, contacts: 4, attempts: 0 },
    { projectId: hrProject.id, expertIdx: 1, fresh: true, chase: false, rejection: false, deficit: hrDeficit, contacts: 3, attempts: 0 },
    { projectId: hrProject.id, expertIdx: 3, fresh: true, chase: false, rejection: false, deficit: hrDeficit, contacts: 2, attempts: 1 },
    { projectId: techProject.id, expertIdx: 5, fresh: true, chase: false, rejection: false, deficit: techDeficit, contacts: 2, attempts: 0 },
    { projectId: techProject.id, expertIdx: 7, fresh: true, chase: false, rejection: false, deficit: techDeficit, contacts: 1, attempts: 2 },
    { projectId: finopsProject.id, expertIdx: 8, fresh: true, chase: false, rejection: false, deficit: finopsDeficit, contacts: 3, attempts: 1 },
    { projectId: finopsProject.id, expertIdx: 9, fresh: true, chase: false, rejection: false, deficit: finopsDeficit, contacts: 1, attempts: 4 },

    // Tier 2 — Signup chase (50-72) varied
    { projectId: dsProject.id, expertIdx: 2, fresh: false, chase: true, rejection: false, deficit: dsDeficit, contacts: 3, attempts: 1 },
    { projectId: hrProject.id, expertIdx: 4, fresh: false, chase: true, rejection: false, deficit: hrDeficit, contacts: 4, attempts: 0 },
    { projectId: hrProject.id, expertIdx: 10, fresh: false, chase: true, rejection: false, deficit: hrDeficit, contacts: 2, attempts: 3 },
    { projectId: techProject.id, expertIdx: 6, fresh: false, chase: true, rejection: false, deficit: techDeficit, contacts: 1, attempts: 0 },
    { projectId: techProject.id, expertIdx: 11, fresh: false, chase: true, rejection: false, deficit: techDeficit, contacts: 2, attempts: 5 },
    { projectId: finopsProject.id, expertIdx: 13, fresh: false, chase: true, rejection: false, deficit: finopsDeficit, contacts: 4, attempts: 2 },

    // Tier 3 — Callback chase (25-47) varied
    { projectId: dsProject.id, expertIdx: 12, fresh: false, chase: false, rejection: true, deficit: dsDeficit, contacts: 4, attempts: 1 },
    { projectId: hrProject.id, expertIdx: 14, fresh: false, chase: false, rejection: true, deficit: hrDeficit, contacts: 3, attempts: 0 },
    { projectId: hrProject.id, expertIdx: 0, fresh: false, chase: false, rejection: true, deficit: hrDeficit, contacts: 1, attempts: 3 },
    { projectId: techProject.id, expertIdx: 9, fresh: false, chase: false, rejection: true, deficit: techDeficit, contacts: 2, attempts: 2 },
    { projectId: finopsProject.id, expertIdx: 7, fresh: false, chase: false, rejection: true, deficit: finopsDeficit, contacts: 1, attempts: 0 },
    { projectId: finopsProject.id, expertIdx: 5, fresh: false, chase: false, rejection: true, deficit: finopsDeficit, contacts: 0, attempts: 6 },

    // Tier 4 — Base pool (0-22) varied
    { projectId: dsProject.id, expertIdx: 1, fresh: false, chase: false, rejection: false, deficit: dsDeficit, contacts: 4, attempts: 0 },
    { projectId: dsProject.id, expertIdx: 3, fresh: false, chase: false, rejection: false, deficit: dsDeficit, contacts: 2, attempts: 2 },
    { projectId: hrProject.id, expertIdx: 12, fresh: false, chase: false, rejection: false, deficit: hrDeficit, contacts: 3, attempts: 1 },
    { projectId: hrProject.id, expertIdx: 2, fresh: false, chase: false, rejection: false, deficit: hrDeficit, contacts: 1, attempts: 4 },
    { projectId: techProject.id, expertIdx: 13, fresh: false, chase: false, rejection: false, deficit: techDeficit, contacts: 2, attempts: 0 },
    { projectId: techProject.id, expertIdx: 14, fresh: false, chase: false, rejection: false, deficit: techDeficit, contacts: 0, attempts: 3 },
    { projectId: finopsProject.id, expertIdx: 4, fresh: false, chase: false, rejection: false, deficit: finopsDeficit, contacts: 1, attempts: 6 },
    { projectId: finopsProject.id, expertIdx: 10, fresh: false, chase: false, rejection: false, deficit: finopsDeficit, contacts: 0, attempts: 0 },
  ];

  let rank = 1;
  const scores: number[] = [];
  for (const s of snapshots) {
    const tierBase = s.fresh ? 75 : s.chase ? 50 : s.rejection ? 25 : 0;
    const score = rankScore(tierBase, s.deficit, s.contacts, s.attempts);
    scores.push(score);
    await prisma.rankingSnapshot.create({
      data: {
        projectId: s.projectId,
        expertId: experts[s.expertIdx].id,
        score,
        rank: rank++,
        reason: 'weighted_priority_formula',
        metadata: {
          freshReplyBoost: s.fresh,
          signupChaseBoost: s.chase,
          highValueRejectionBoost: s.rejection,
          completionDeficit: s.deficit,
          tierBase,
          verifiedContactCount: s.contacts,
          callAttemptCount: s.attempts
        } as unknown as import('@prisma/client').Prisma.InputJsonValue
      }
    });
  }

  console.log('Seeded ranking demo data:');
  console.log(`  Projects: ${projects.map((p) => p.name).join(', ')}`);
  console.log(`  Experts: ${experts.length}`);
  console.log(`  Ranking snapshots: ${snapshots.length}`);
  console.log(`  Scores: ${scores.sort((a, b) => b - a).join(', ')}`);
}

async function seedObservabilityDemoData(): Promise<void> {
  const now = Date.now();
  const ago = (h: number) => new Date(now - h * 3600000);

  const categories: Array<'SYSTEM' | 'JOB' | 'WEBHOOK' | 'ENFORCEMENT' | 'FRAUD' | 'ALLOCATION'> = [
    'SYSTEM', 'JOB', 'WEBHOOK', 'ENFORCEMENT', 'FRAUD', 'ALLOCATION'
  ];

  const systemEventData: Array<{ category: typeof categories[number]; entityType: string; entityId?: string; message: string; payload?: Record<string, unknown>; hoursAgo: number }> = [
    { category: 'SYSTEM', entityType: 'scheduler', message: 'Scheduled maintenance cycle completed', payload: { duration: 1230, tasksProcessed: 14 }, hoursAgo: 0.5 },
    { category: 'SYSTEM', entityType: 'database', message: 'Connection pool recovered after timeout', payload: { pool: 'primary', reconnectMs: 450 }, hoursAgo: 3 },
    { category: 'JOB', entityType: 'enrichment', entityId: 'enrich-batch-42', message: 'Enrichment batch completed for 25 leads', payload: { batchSize: 25, matched: 18, enrichedFields: ['phone', 'email'] }, hoursAgo: 1 },
    { category: 'JOB', entityType: 'outreach', entityId: 'outreach-7f3a', message: 'Outreach campaign sent 12 messages', payload: { channel: 'linkedin', sent: 12, failed: 1 }, hoursAgo: 2 },
    { category: 'JOB', entityType: 'ranking', entityId: 'rank-cycle-99', message: 'Ranking computation completed for 3 projects', payload: { projects: 3, snapshotsCreated: 26 }, hoursAgo: 4 },
    { category: 'WEBHOOK', entityType: 'yay_inbound', entityId: 'wh-evt-a1b2', message: 'Yay webhook processed: expert callback confirmed', payload: { expertId: 'expert-001', event: 'call_completed' }, hoursAgo: 1.5 },
    { category: 'WEBHOOK', entityType: 'sales_nav', entityId: 'wh-evt-c3d4', message: 'Sales Nav webhook: new lead ingested', payload: { leadName: 'Jane Doe', source: 'sales_navigator' }, hoursAgo: 5 },
    { category: 'ENFORCEMENT', entityType: 'caller', entityId: 'caller-001', message: 'Caller exceeded maximum idle time — task reassigned', payload: { idleMinutes: 12, taskId: 'task-xyz' }, hoursAgo: 6 },
    { category: 'ENFORCEMENT', entityType: 'call_task', entityId: 'task-abc', message: 'Call task auto-cancelled after execution window expired', payload: { windowMinutes: 15, expertId: 'expert-002' }, hoursAgo: 8 },
    { category: 'FRAUD', entityType: 'call_log', entityId: 'call-fraud-1', message: 'Suspicious call duration detected — flagged for review', payload: { callerId: 'caller-bad', duration: 3, threshold: 10 }, hoursAgo: 2 },
    { category: 'FRAUD', entityType: 'call_log', entityId: 'call-fraud-2', message: 'Caller marked 5 calls as completed in under 2 minutes', payload: { callerId: 'caller-bad2', count: 5, windowSeconds: 120 }, hoursAgo: 10 },
    { category: 'ALLOCATION', entityType: 'call_task', entityId: 'alloc-task-1', message: 'High-priority task allocated to next available caller', payload: { expertId: 'expert-003', score: 95 }, hoursAgo: 0.3 },
    { category: 'ALLOCATION', entityType: 'call_task', entityId: 'alloc-task-2', message: 'No available callers — task queued for retry', payload: { retryInSeconds: 60 }, hoursAgo: 7 },
    { category: 'SYSTEM', entityType: 'health', message: 'Redis connection restored after brief disconnection', payload: { downtime: '8s' }, hoursAgo: 12 },
    { category: 'JOB', entityType: 'google_sheets_sync', entityId: 'gs-sync-14', message: 'Google Sheets sync exported 42 rows', payload: { sheet: 'Expert Pipeline', rows: 42 }, hoursAgo: 0.8 }
  ];

  for (const ev of systemEventData) {
    await prisma.systemEvent.create({
      data: {
        category: ev.category,
        entityType: ev.entityType,
        entityId: ev.entityId ?? null,
        message: ev.message,
        payload: ev.payload ? (ev.payload as unknown as import('@prisma/client').Prisma.InputJsonValue) : undefined,
        createdAt: ago(ev.hoursAgo)
      }
    });
  }

  const dlqData = [
    { queueName: 'enrichment', jobId: 'enrich-fail-1', errorMessage: 'Apollo API rate limit exceeded — 429 Too Many Requests', stackTrace: 'Error: 429\n    at ApolloClient.fetch (/app/src/integrations/apollo.ts:45:11)', hoursAgo: 1 },
    { queueName: 'outreach', jobId: 'outreach-fail-2', errorMessage: 'LinkedIn session expired — authentication required', stackTrace: 'Error: SessionExpired\n    at LinkedInProvider.send (/app/src/integrations/linkedin.ts:72:8)', hoursAgo: 3 },
    { queueName: 'call-allocation', jobId: 'alloc-fail-3', errorMessage: 'Expert has no valid phone contacts — cannot create call task', stackTrace: null, hoursAgo: 5 },
    { queueName: 'supabase-sync', jobId: 'sync-fail-4', errorMessage: 'Supabase upsert conflict on unique constraint leads_pkey', stackTrace: 'Error: PostgresError\n    at SupabaseClient.upsert (/app/src/modules/supabase-sync/supabaseSyncService.ts:118:5)', hoursAgo: 8 }
  ];

  for (const d of dlqData) {
    await prisma.deadLetterJob.create({
      data: {
        queueName: d.queueName,
        jobId: d.jobId,
        payload: { jobId: d.jobId, queue: d.queueName } as unknown as import('@prisma/client').Prisma.InputJsonValue,
        errorMessage: d.errorMessage,
        stackTrace: d.stackTrace,
        failedAt: ago(d.hoursAgo),
        correlationId: `corr-${d.jobId}`
      }
    });
  }

  const webhookData = [
    { eventId: 'yay-evt-001', hash: 'a1b2c3d4e5f6', status: 'processed', hoursAgo: 0.5 },
    { eventId: 'yay-evt-002', hash: 'b2c3d4e5f6a1', status: 'processed', hoursAgo: 2 },
    { eventId: 'snav-evt-003', hash: 'c3d4e5f6a1b2', status: 'processed', hoursAgo: 4 },
    { eventId: 'snav-evt-004', hash: 'd4e5f6a1b2c3', status: 'duplicate', hoursAgo: 4.1 },
    { eventId: 'yay-evt-005', hash: 'e5f6a1b2c3d4', status: 'processed', hoursAgo: 6 },
    { eventId: 'snav-evt-006', hash: 'f6a1b2c3d4e5', status: 'failed', hoursAgo: 9 }
  ];

  for (const w of webhookData) {
    await prisma.processedWebhookEvent.create({
      data: {
        eventId: w.eventId,
        hash: w.hash,
        status: w.status,
        processedAt: ago(w.hoursAgo)
      }
    });
  }

  console.log('Seeded observability demo data:');
  console.log(`  SystemEvents: ${systemEventData.length}`);
  console.log(`  DLQ entries: ${dlqData.length}`);
  console.log(`  Webhook events: ${webhookData.length}`);
}

async function main(): Promise<void> {
  await seedAdmin();
  await seedRankingDemoData();
  await seedObservabilityDemoData();
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
