import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = 'admin@silverlight.ai';
  const password = 'admin123!';
  const name = 'Admin';

  const existing = await prisma.caller.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin user already exists (id: ${existing.id}, email: ${email}). Skipping seed.`);
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

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
