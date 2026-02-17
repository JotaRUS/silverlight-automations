import type { Caller, CallerPerformanceMetric, Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';

import type { callerCreateSchema, callerUpdateSchema } from './callersSchemas';

type CallerCreateInput = z.infer<typeof callerCreateSchema>;
type CallerUpdateInput = z.infer<typeof callerUpdateSchema>;

function toJsonValue(value: Record<string, unknown> | undefined): Prisma.InputJsonValue | undefined {
  return value as Prisma.InputJsonValue | undefined;
}

export class CallersService {
  public constructor(private readonly prismaClient: PrismaClient) {}

  public async createCaller(input: CallerCreateInput): Promise<Caller> {
    return this.prismaClient.caller.create({
      data: {
        email: input.email,
        name: input.name,
        timezone: input.timezone,
        languageCodes: input.languageCodes,
        regionIsoCodes: input.regionIsoCodes,
        metadata: toJsonValue(input.metadata)
      }
    });
  }

  public async updateCaller(callerId: string, input: CallerUpdateInput): Promise<Caller> {
    return this.prismaClient.caller.update({
      where: { id: callerId },
      data: {
        email: input.email,
        name: input.name,
        timezone: input.timezone,
        languageCodes: input.languageCodes,
        regionIsoCodes: input.regionIsoCodes,
        metadata: toJsonValue(input.metadata)
      }
    });
  }

  public async getCaller(callerId: string): Promise<Caller | null> {
    return this.prismaClient.caller.findUnique({
      where: { id: callerId }
    });
  }

  public async getLatestPerformance(callerId: string): Promise<CallerPerformanceMetric | null> {
    return this.prismaClient.callerPerformanceMetric.findFirst({
      where: { callerId },
      orderBy: {
        snapshotAt: 'desc'
      }
    });
  }
}
