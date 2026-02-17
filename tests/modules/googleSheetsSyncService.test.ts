import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { GoogleSheetsSyncService } from '../../src/modules/google-sheets-sync/googleSheetsSyncService';

describe('GoogleSheetsSyncService', () => {
  it('appends new row and persists row map when no map exists', async () => {
    const getRowMap = vi.fn().mockResolvedValue(null);
    const upsertRowMap = vi.fn().mockResolvedValue({});
    const appendRow = vi.fn().mockResolvedValue(7);
    const updateRow = vi.fn().mockResolvedValue(undefined);

    const prisma = {
      googleSheetExport: {
        create: vi.fn().mockResolvedValue({})
      }
    } as unknown as PrismaClient;

    const service = new GoogleSheetsSyncService(prisma, {
      rowMapRepository: {
        getRowMap,
        upsertRowMap
      } as never,
      sheetsClient: {
        appendRow,
        updateRow
      } as never
    });

    await service.syncRow({
      projectId: 'project-1',
      tabName: 'PROJECT_OVERVIEW',
      entityType: 'project',
      entityId: 'project-1',
      entityPayload: {
        projectId: 'project-1',
        projectName: 'Project One'
      }
    });

    expect(appendRow).toHaveBeenCalledTimes(1);
    expect(updateRow).not.toHaveBeenCalled();
    expect(upsertRowMap).toHaveBeenCalledWith({
      entityType: 'project',
      entityId: 'project-1',
      sheetTab: 'PROJECT_OVERVIEW',
      rowNumber: 7
    });
  });

  it('updates existing row when row map exists', async () => {
    const getRowMap = vi.fn().mockResolvedValue({
      rowNumber: 11
    });
    const upsertRowMap = vi.fn().mockResolvedValue({});
    const appendRow = vi.fn().mockResolvedValue(12);
    const updateRow = vi.fn().mockResolvedValue(undefined);

    const prisma = {
      googleSheetExport: {
        create: vi.fn().mockResolvedValue({})
      }
    } as unknown as PrismaClient;

    const service = new GoogleSheetsSyncService(prisma, {
      rowMapRepository: {
        getRowMap,
        upsertRowMap
      } as never,
      sheetsClient: {
        appendRow,
        updateRow
      } as never
    });

    await service.syncRow({
      projectId: 'project-2',
      tabName: 'CALL_ACTIVITY',
      entityType: 'call',
      entityId: 'call-1',
      rowData: ['call-1', 'completed']
    });

    expect(updateRow).toHaveBeenCalledTimes(1);
    expect(appendRow).not.toHaveBeenCalled();
    expect(upsertRowMap).toHaveBeenCalledWith({
      entityType: 'call',
      entityId: 'call-1',
      sheetTab: 'CALL_ACTIVITY',
      rowNumber: 11
    });
  });
});
