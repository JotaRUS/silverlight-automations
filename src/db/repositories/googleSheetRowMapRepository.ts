import type { GoogleSheetRowMap, PrismaClient } from '@prisma/client';

export interface UpsertGoogleSheetRowMapInput {
  entityType: string;
  entityId: string;
  sheetTab: string;
  rowNumber: number;
}

export class GoogleSheetRowMapRepository {
  public constructor(private readonly prismaClient: PrismaClient) {}

  public async upsertRowMap(input: UpsertGoogleSheetRowMapInput): Promise<GoogleSheetRowMap> {
    return this.prismaClient.googleSheetRowMap.upsert({
      where: {
        entityType_entityId_sheetTab: {
          entityType: input.entityType,
          entityId: input.entityId,
          sheetTab: input.sheetTab
        }
      },
      create: {
        entityType: input.entityType,
        entityId: input.entityId,
        sheetTab: input.sheetTab,
        rowNumber: input.rowNumber
      },
      update: {
        rowNumber: input.rowNumber
      }
    });
  }

  public async getRowMap(entityType: string, entityId: string, sheetTab: string): Promise<GoogleSheetRowMap | null> {
    return this.prismaClient.googleSheetRowMap.findUnique({
      where: {
        entityType_entityId_sheetTab: {
          entityType,
          entityId,
          sheetTab
        }
      }
    });
  }
}
