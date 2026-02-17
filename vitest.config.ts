import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/integration/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/app/server.ts',
        'src/workers/**',
        'src/scheduler/**',
        'src/queues/**',
        'src/db/**',
        'src/integrations/**',
        'src/api/routes/**',
        'src/modules/**/**Routes.ts',
        'src/core/http/rawBody.ts',
        'src/modules/enrichment/enrichmentService.ts',
        'src/modules/lead-ingestion/leadIngestionService.ts',
        'src/modules/call-validation/yayEventProcessor.ts',
        'src/modules/projects/projectsService.ts',
        'src/modules/job-title-engine/jobTitleDiscoveryService.ts',
        'src/modules/sales-nav/salesNavIngestionService.ts'
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        statements: 70,
        branches: 60
      }
    }
  }
});
