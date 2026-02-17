import { describe, expect, it } from 'vitest';

import {
  GOOGLE_SHEETS_TABS,
  mapEntityPayloadToGoogleSheetRow
} from '../../src/modules/google-sheets-sync/googleSheetsTabMapping';

describe('mapEntityPayloadToGoogleSheetRow', () => {
  it('maps project overview payload into deterministic ordered row', () => {
    const row = mapEntityPayloadToGoogleSheetRow(GOOGLE_SHEETS_TABS.PROJECT_OVERVIEW, {
      projectId: 'project-1',
      projectName: 'AI Sourcing',
      status: 'ACTIVE',
      targetThreshold: 25,
      signedUpCount: 5,
      completionPercentage: 20,
      priority: 9,
      updatedAt: '2026-02-17T00:00:00.000Z'
    });

    expect(row).toEqual([
      'project-1',
      'AI Sourcing',
      'ACTIVE',
      '25',
      '5',
      '20',
      '9',
      '2026-02-17T00:00:00.000Z'
    ]);
  });

  it('falls back to payload values for unknown tabs', () => {
    const row = mapEntityPayloadToGoogleSheetRow('CUSTOM_TAB', {
      alpha: 'a',
      beta: 2
    });

    expect(row).toEqual(['a', '2']);
  });
});
