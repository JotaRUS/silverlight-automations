import { PrismaClient } from '@prisma/client';

import { env } from '../config/env';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: env.DATABASE_URL,
    log: env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error']
  });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
