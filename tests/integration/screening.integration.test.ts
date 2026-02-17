import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../src/db/client';
import { ScreeningService } from '../../src/modules/screening/screeningService';
import { cleanDatabase, disconnectDatabase } from './helpers/testDb';

describe('screening integration', () => {
  const screeningService = new ScreeningService(prisma);

  beforeEach(async () => {
    await cleanDatabase();
  });

  it('records screening responses and updates project completion metrics', async () => {
    const project = await prisma.project.create({
      data: {
        name: 'Screening Project',
        targetThreshold: 1,
        geographyIsoCodes: ['US'],
        regionConfig: {}
      }
    });
    const expert = await prisma.expert.create({
      data: {
        fullName: 'Screening Expert',
        languageCodes: ['en'],
        preferredChannel: 'EMAIL'
      }
    });
    const question = await prisma.screeningQuestion.create({
      data: {
        projectId: project.id,
        prompt: 'How many years of experience do you have?',
        displayOrder: 1,
        required: true
      }
    });
    await prisma.screeningResponse.create({
      data: {
        projectId: project.id,
        questionId: question.id,
        expertId: expert.id,
        channel: 'EMAIL',
        status: 'PENDING'
      }
    });

    await screeningService.recordResponse({
      projectId: project.id,
      expertId: expert.id,
      questionId: question.id,
      responseText: '12 years'
    });

    const response = await prisma.screeningResponse.findFirstOrThrow({
      where: {
        projectId: project.id,
        expertId: expert.id,
        questionId: question.id
      }
    });
    expect(response.status).toBe('COMPLETE');

    const updatedProject = await prisma.project.findUniqueOrThrow({
      where: { id: project.id }
    });
    expect(updatedProject.signedUpCount).toBe(1);
    expect(updatedProject.status).toBe('COMPLETED');
  });
});

afterAll(async () => {
  await disconnectDatabase();
});
