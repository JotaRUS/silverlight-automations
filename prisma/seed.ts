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

async function main(): Promise<void> {
  await seedAdmin();
  await seedRankingDemoData();
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
