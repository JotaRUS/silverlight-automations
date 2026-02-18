import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../src/db/client';
import { CooldownService } from '../../src/modules/cooldown/cooldownService';
import { cleanDatabase, disconnectDatabase } from './helpers/testDb';

describe('cooldown integration', () => {
  const cooldownService = new CooldownService(prisma);

  beforeEach(async () => {
    await cleanDatabase();
  });

  it('allows first contact and blocks subsequent contact in cooldown window', async () => {
    const project = await prisma.project.create({
      data: {
        name: 'Project A',
        targetThreshold: 10,
        geographyIsoCodes: ['GB'],
        regionConfig: {}
      }
    });
    const expert = await prisma.expert.create({
      data: {
        fullName: 'Expert One',
        languageCodes: ['en']
      }
    });

    const firstResult = await cooldownService.checkAndLog({
      projectId: project.id,
      expertId: expert.id,
      channel: 'EMAIL',
      overrideCooldown: false
    });
    expect(firstResult.allowed).toBe(true);

    const secondResult = await cooldownService.checkAndLog({
      projectId: project.id,
      expertId: expert.id,
      channel: 'EMAIL',
      overrideCooldown: false
    });
    expect(secondResult.allowed).toBe(false);
  });

  it('respects override flag', async () => {
    const project = await prisma.project.create({
      data: {
        name: 'Project B',
        targetThreshold: 10,
        geographyIsoCodes: ['US'],
        regionConfig: {},
        overrideCooldown: true
      }
    });
    const expert = await prisma.expert.create({
      data: {
        fullName: 'Expert Two',
        languageCodes: ['en']
      }
    });

    await cooldownService.checkAndLog({
      projectId: project.id,
      expertId: expert.id,
      channel: 'SMS',
      overrideCooldown: false
    });

    const overridden = await cooldownService.checkAndLog({
      projectId: project.id,
      expertId: expert.id,
      channel: 'SMS',
      overrideCooldown: true
    });
    expect(overridden.allowed).toBe(true);
  });
});

afterAll(async () => {
  await disconnectDatabase();
});
