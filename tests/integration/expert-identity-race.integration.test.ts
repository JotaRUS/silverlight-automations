import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../src/db/client';
import { ExpertRepository } from '../../src/db/repositories/expertRepository';
import { cleanDatabase, disconnectDatabase } from './helpers/testDb';

describe('expert identity repository integration', () => {
  const expertRepository = new ExpertRepository(prisma);

  beforeEach(async () => {
    await cleanDatabase();
  });

  it('deduplicates concurrent expert creation by identity lock', async () => {
    const createRequests = Array.from({ length: 10 }, (_, index) =>
      expertRepository.findOrCreateByIdentity({
        fullName: `Concurrent Expert ${String(index)}`,
        email: 'concurrent@example.com',
        phone: '+14155550199',
        linkedinUrl: 'https://linkedin.com/in/concurrent-expert',
        countryIso: 'US',
        languageCodes: ['en']
      })
    );

    const experts = await Promise.all(createRequests);
    const uniqueIds = new Set(experts.map((expert) => expert.id));

    expect(uniqueIds.size).toBe(1);

    const persistedExperts = await prisma.expert.findMany();
    expect(persistedExperts.length).toBe(1);

    const contacts = await prisma.expertContact.findMany({
      where: {
        expertId: persistedExperts[0].id
      }
    });
    expect(contacts.length).toBe(3);
  });
});

afterAll(async () => {
  await disconnectDatabase();
});
