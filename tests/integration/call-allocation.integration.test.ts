import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../src/db/client';
import { CallAllocationService } from '../../src/modules/call-allocation/callAllocationService';
import { cleanDatabase, disconnectDatabase } from './helpers/testDb';

describe('call allocation integration', () => {
  const callAllocationService = new CallAllocationService(prisma);

  beforeEach(async () => {
    await cleanDatabase();
  });

  it('assigns one task at a time and handles retryable outcome', async () => {
    const project = await prisma.project.create({
      data: {
        name: 'Call Project',
        targetThreshold: 20,
        geographyIsoCodes: ['GB'],
        regionConfig: {}
      }
    });

    const caller = await prisma.caller.create({
      data: {
        email: 'caller-allocation@example.com',
        name: 'Caller Allocation',
        timezone: 'Europe/London',
        languageCodes: ['en'],
        regionIsoCodes: ['GB'],
        allocationStatus: 'ACTIVE'
      }
    });

    const expert = await prisma.expert.create({
      data: {
        fullName: 'Call Expert',
        countryIso: 'GB',
        timezone: 'Europe/London',
        languageCodes: ['en']
      }
    });

    const task = await prisma.callTask.create({
      data: {
        projectId: project.id,
        expertId: expert.id,
        status: 'PENDING',
        priorityScore: 10
      }
    });

    const assignedTask = await callAllocationService.fetchOrAssignCurrentTask(caller.id);
    expect(assignedTask?.id).toBe(task.id);
    expect(assignedTask?.callerId).toBe(caller.id);
    expect(assignedTask?.status).toBe('ASSIGNED');

    const secondFetch = await callAllocationService.fetchOrAssignCurrentTask(caller.id);
    expect(secondFetch?.id).toBe(task.id);

    await prisma.callTask.update({
      where: { id: task.id },
      data: { status: 'DIALING' }
    });

    await callAllocationService.submitCallOutcome(caller.id, task.id, 'RETRYABLE_REJECTION');

    const updatedTask = await prisma.callTask.findUniqueOrThrow({
      where: { id: task.id }
    });
    expect(updatedTask.status).toBe('COMPLETED');

    const queuedRetryTasks = await prisma.callTask.findMany({
      where: {
        expertId: expert.id,
        status: 'PENDING'
      }
    });
    expect(queuedRetryTasks.length).toBe(1);
  });
});

afterAll(async () => {
  await disconnectDatabase();
});
