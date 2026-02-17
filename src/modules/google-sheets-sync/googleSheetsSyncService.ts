import type { PrismaClient } from '@prisma/client';

import { getRequestContext } from '../../core/http/requestContext';
import { GoogleSheetRowMapRepository } from '../../db/repositories/googleSheetRowMapRepository';
import { GoogleSheetsClient } from '../../integrations/google-sheets/googleSheetsClient';
import { mapEntityPayloadToGoogleSheetRow } from './googleSheetsTabMapping';

export interface GoogleSheetsSyncInput {
  projectId?: string;
  tabName: string;
  entityType: string;
  entityId: string;
  rowData?: string[];
  entityPayload?: Record<string, unknown>;
}

export class GoogleSheetsSyncService {
  private readonly rowMapRepository: GoogleSheetRowMapRepository;
  private readonly sheetsClient: GoogleSheetsClient;

  public constructor(
    private readonly prismaClient: PrismaClient,
    dependencies?: {
      rowMapRepository?: GoogleSheetRowMapRepository;
      sheetsClient?: GoogleSheetsClient;
    }
  ) {
    this.rowMapRepository =
      dependencies?.rowMapRepository ?? new GoogleSheetRowMapRepository(prismaClient);
    this.sheetsClient = dependencies?.sheetsClient ?? new GoogleSheetsClient();
  }

  private resolveRowData(input: GoogleSheetsSyncInput): string[] {
    if (input.rowData?.length) {
      return input.rowData;
    }

    return mapEntityPayloadToGoogleSheetRow(input.tabName, input.entityPayload ?? {});
  }

  public async syncRow(input: GoogleSheetsSyncInput): Promise<void> {
    const correlationId = getRequestContext()?.correlationId ?? 'system';
    const rowData = this.resolveRowData(input);
    const existing = await this.rowMapRepository.getRowMap(
      input.entityType,
      input.entityId,
      input.tabName
    );
    let operation: 'APPEND' | 'UPDATE' = 'APPEND';
    let rowNumber = existing?.rowNumber ?? null;

    if (existing) {
      operation = 'UPDATE';
      await this.sheetsClient.updateRow(
        {
          tabName: input.tabName,
          rowNumber: existing.rowNumber,
          rowValues: rowData
        },
        correlationId
      );
    } else {
      const appendedRow = await this.sheetsClient.appendRow(
        {
          tabName: input.tabName,
          rowValues: rowData
        },
        correlationId
      );
      rowNumber = appendedRow ?? 1;
    }

    await this.rowMapRepository.upsertRowMap({
      entityType: input.entityType,
      entityId: input.entityId,
      sheetTab: input.tabName,
      rowNumber: rowNumber ?? 1
    });

    await this.prismaClient.googleSheetExport.create({
      data: {
        projectId: input.projectId,
        tabName: input.tabName,
        operation,
        entityType: input.entityType,
        entityId: input.entityId,
        status: 'SUCCESS',
        payload: {
          rowData,
          rowNumber
        }
      }
    });
  }
}
