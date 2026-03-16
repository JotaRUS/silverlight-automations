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

async function seedRankingDemoData(): Promise<void> {
  const existingSnapshots = await prisma.rankingSnapshot.count();
  if (existingSnapshots > 0) {
    console.log(`Ranking snapshots already exist (${existingSnapshots}). Skipping ranking seed.`);
    return;
  }

  const hrProject = await prisma.project.create({
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
  });

  const techProject = await prisma.project.create({
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
  });

  const experts = await Promise.all([
    prisma.expert.create({
      data: {
        fullName: 'Maria Lopez',
        firstName: 'Maria',
        lastName: 'Lopez',
        currentRole: 'Head of People',
        currentCompany: 'TechCorp Latam',
        countryIso: 'UY',
        timezone: 'America/Montevideo',
        languageCodes: ['es', 'en'],
        status: 'ACTIVE',
        contacts: {
          create: [
            { type: 'PHONE', value: '+59899123456', valueNormalized: '+59899123456', isPrimary: true, verificationStatus: 'VERIFIED' },
            { type: 'EMAIL', value: 'maria@techcorp.uy', valueNormalized: 'maria@techcorp.uy', isPrimary: false, verificationStatus: 'VERIFIED' }
          ]
        }
      }
    }),
    prisma.expert.create({
      data: {
        fullName: 'Carlos Fernandez',
        firstName: 'Carlos',
        lastName: 'Fernandez',
        currentRole: 'VP Human Resources',
        currentCompany: 'Grupo Sur',
        countryIso: 'AR',
        timezone: 'America/Argentina/Buenos_Aires',
        languageCodes: ['es'],
        status: 'ACTIVE',
        contacts: {
          create: [
            { type: 'PHONE', value: '+5491155678901', valueNormalized: '+5491155678901', isPrimary: true, verificationStatus: 'VERIFIED' },
            { type: 'EMAIL', value: 'carlos@gruposur.ar', valueNormalized: 'carlos@gruposur.ar', isPrimary: false, verificationStatus: 'VERIFIED' }
          ]
        }
      }
    }),
    prisma.expert.create({
      data: {
        fullName: 'Ana Gutierrez',
        firstName: 'Ana',
        lastName: 'Gutierrez',
        currentRole: 'HR Business Partner',
        currentCompany: 'MegaBank',
        countryIso: 'UY',
        timezone: 'America/Montevideo',
        languageCodes: ['es', 'en'],
        status: 'ACTIVE',
        contacts: {
          create: [
            { type: 'PHONE', value: '+59898765432', valueNormalized: '+59898765432', isPrimary: true, verificationStatus: 'VERIFIED' }
          ]
        }
      }
    }),
    prisma.expert.create({
      data: {
        fullName: 'James Porter',
        firstName: 'James',
        lastName: 'Porter',
        currentRole: 'Engineering Lead',
        currentCompany: 'FinTech UK',
        countryIso: 'GB',
        timezone: 'Europe/London',
        languageCodes: ['en'],
        status: 'ACTIVE',
        contacts: {
          create: [
            { type: 'PHONE', value: '+447911123456', valueNormalized: '+447911123456', isPrimary: true, verificationStatus: 'VERIFIED' },
            { type: 'EMAIL', value: 'james@fintechuk.co.uk', valueNormalized: 'james@fintechuk.co.uk', isPrimary: false, verificationStatus: 'VERIFIED' }
          ]
        }
      }
    }),
    prisma.expert.create({
      data: {
        fullName: 'Elena Schneider',
        firstName: 'Elena',
        lastName: 'Schneider',
        currentRole: 'Staff Engineer',
        currentCompany: 'AutoTech DE',
        countryIso: 'DE',
        timezone: 'Europe/Berlin',
        languageCodes: ['de', 'en'],
        status: 'ACTIVE',
        contacts: {
          create: [
            { type: 'PHONE', value: '+4915112345678', valueNormalized: '+4915112345678', isPrimary: true, verificationStatus: 'VERIFIED' }
          ]
        }
      }
    })
  ]);

  for (const [i, expert] of experts.entries()) {
    const project = i < 3 ? hrProject : techProject;
    await prisma.lead.create({
      data: {
        projectId: project.id,
        expertId: expert.id,
        fullName: expert.fullName,
        firstName: expert.firstName,
        lastName: expert.lastName,
        jobTitle: expert.currentRole,
        countryIso: expert.countryIso,
        status: 'CONTACTED'
      }
    });
  }

  const hrDeficit = (1 - 3 / 20) * 100;
  const techDeficit = (1 - 3 / 10) * 100;

  const rankingData = [
    {
      projectId: hrProject.id,
      expertId: experts[0].id,
      score: Math.round((75 + (hrDeficit / 100) * 25) * 100) / 100,
      rank: 1,
      reason: 'weighted_priority_formula',
      metadata: { freshReplyBoost: true, signupChaseBoost: false, highValueRejectionBoost: false, completionDeficit: hrDeficit, tierBase: 75 }
    },
    {
      projectId: hrProject.id,
      expertId: experts[1].id,
      score: Math.round((50 + (hrDeficit / 100) * 25) * 100) / 100,
      rank: 2,
      reason: 'weighted_priority_formula',
      metadata: { freshReplyBoost: false, signupChaseBoost: true, highValueRejectionBoost: false, completionDeficit: hrDeficit, tierBase: 50 }
    },
    {
      projectId: hrProject.id,
      expertId: experts[2].id,
      score: Math.round((25 + (hrDeficit / 100) * 25) * 100) / 100,
      rank: 3,
      reason: 'weighted_priority_formula',
      metadata: { freshReplyBoost: false, signupChaseBoost: false, highValueRejectionBoost: true, completionDeficit: hrDeficit, tierBase: 25 }
    },
    {
      projectId: techProject.id,
      expertId: experts[3].id,
      score: Math.round(((techDeficit / 100) * 25) * 100) / 100,
      rank: 4,
      reason: 'weighted_priority_formula',
      metadata: { freshReplyBoost: false, signupChaseBoost: false, highValueRejectionBoost: false, completionDeficit: techDeficit, tierBase: 0 }
    },
    {
      projectId: techProject.id,
      expertId: experts[4].id,
      score: Math.round(((techDeficit / 100) * 25) * 100) / 100,
      rank: 5,
      reason: 'weighted_priority_formula',
      metadata: { freshReplyBoost: false, signupChaseBoost: false, highValueRejectionBoost: false, completionDeficit: techDeficit, tierBase: 0 }
    }
  ];

  for (const row of rankingData) {
    await prisma.rankingSnapshot.create({
      data: {
        projectId: row.projectId,
        expertId: row.expertId,
        score: row.score,
        rank: row.rank,
        reason: row.reason,
        metadata: row.metadata as unknown as import('@prisma/client').Prisma.InputJsonValue
      }
    });
  }

  console.log('Seeded ranking demo data:');
  console.log(`  Projects: ${hrProject.name}, ${techProject.name}`);
  console.log(`  Experts: ${experts.map((e) => e.fullName).join(', ')}`);
  console.log(`  Ranking snapshots: ${rankingData.length}`);
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
