import type { PrismaClient } from '@prisma/client';

import { getRequestContext } from '../../core/http/requestContext';
import { GoogleSheetRowMapRepository } from '../../db/repositories/googleSheetRowMapRepository';
import { GoogleSheetsClient } from '../../integrations/google-sheets/googleSheetsClient';

export interface GoogleSheetsSyncInput {
  projectId?: string;
  tabName: string;
  entityType: string;
  entityId: string;
  rowData: string[];
}

export class GoogleSheetsSyncService {
  private readonly rowMapRepository: GoogleSheetRowMapRepository;
  private readonly sheetsClient: GoogleSheetsClient;

  public constructor(private readonly prismaClient: PrismaClient) {
    this.rowMapRepository = new GoogleSheetRowMapRepository(prismaClient);
    this.sheetsClient = new GoogleSheetsClient();
  }

  public async syncRow(input: GoogleSheetsSyncInput): Promise<void> {
    const correlationId = getRequestContext()?.correlationId ?? 'system';
    await this.sheetsClient.appendRow(
      {
        tabName: input.tabName,
        rowValues: input.rowData
      },
      correlationId
    );

    const existing = await this.rowMapRepository.getRowMap(
      input.entityType,
      input.entityId,
      input.tabName
    );
    const rowNumber = existing ? existing.rowNumber : 1;
    await this.rowMapRepository.upsertRowMap({
      entityType: input.entityType,
      entityId: input.entityId,
      sheetTab: input.tabName,
      rowNumber: rowNumber + 1
    });

    await this.prismaClient.googleSheetExport.create({
      data: {
        projectId: input.projectId,
        tabName: input.tabName,
        operation: 'APPEND',
        entityType: input.entityType,
        entityId: input.entityId,
        status: 'SUCCESS',
        payload: {
          rowData: input.rowData
        }
      }
    });
  }
}
