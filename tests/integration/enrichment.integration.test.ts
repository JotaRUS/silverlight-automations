import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../src/db/client';
import { EnrichmentService } from '../../src/modules/enrichment/enrichmentService';
import type { EnrichmentProviderClient, EnrichmentRequest, EnrichmentResult } from '../../src/integrations/enrichment/types';
import { cleanDatabase, disconnectDatabase } from './helpers/testDb';

class FailingProvider implements EnrichmentProviderClient {
  public readonly providerName = 'LEADMAGIC';

  public async enrich(request: EnrichmentRequest): Promise<EnrichmentResult> {
    void request;
    await Promise.resolve();
    throw new Error('provider down');
  }
}

class SuccessfulProvider implements EnrichmentProviderClient {
  public readonly providerName = 'PROSPEO';

  public async enrich(request: EnrichmentRequest): Promise<EnrichmentResult> {
    void request;
    await Promise.resolve();
    return {
      provider: this.providerName,
      emails: ['EXPERT@EXAMPLE.COM'],
      phones: ['(415) 555-0100'],
      confidenceScore: 0.91,
      rawPayload: {
        ok: true
      }
    };
  }
}

describe('enrichment integration', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it('runs fallback providers and persists attempts plus expert contacts', async () => {
    const project = await prisma.project.create({
      data: {
        name: 'Project Enrichment',
        targetThreshold: 10,
        geographyIsoCodes: ['US'],
        regionConfig: {}
      }
    });

    const expert = await prisma.expert.create({
      data: {
        fullName: 'Expert Enrich',
        languageCodes: ['en']
      }
    });

    const lead = await prisma.lead.create({
      data: {
        projectId: project.id,
        fullName: 'Expert Enrich',
        status: 'NEW',
        expertId: expert.id
      }
    });

    const enrichmentService = new EnrichmentService(prisma, [
      new FailingProvider(),
      new SuccessfulProvider()
    ]);

    await enrichmentService.enrich(
      {
        leadId: lead.id,
        projectId: project.id,
        fullName: lead.fullName ?? undefined,
        countryIso: 'US',
        emails: [],
        phones: []
      },
      'test-correlation'
    );

    const attempts = await prisma.enrichmentAttempt.findMany({
      where: {
        leadId: lead.id
      }
    });
    expect(attempts.length).toBe(2);
    expect(attempts.some((attempt) => attempt.status === 'FAILED')).toBe(true);
    expect(attempts.some((attempt) => attempt.status === 'SUCCESS')).toBe(true);

    const updatedLead = await prisma.lead.findUniqueOrThrow({
      where: { id: lead.id }
    });
    expect(updatedLead.status).toBe('ENRICHED');

    const contacts = await prisma.expertContact.findMany({
      where: {
        expertId: expert.id
      }
    });
    expect(contacts.some((contact) => contact.type === 'EMAIL' && contact.valueNormalized === 'expert@example.com')).toBe(
      true
    );
    expect(contacts.some((contact) => contact.type === 'PHONE' && contact.valueNormalized === '+4155550100')).toBe(
      true
    );
  });
});

afterAll(async () => {
  await disconnectDatabase();
});
