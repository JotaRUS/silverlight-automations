import { createClient } from '@supabase/supabase-js';

import { AppError } from '../../core/errors/appError';

export interface SupabaseProviderCredentials {
  projectUrl: string;
  serviceRoleKey: string;
  schema?: string;
  tableName: string;
  upsertKey?: string;
}

interface SupabaseWriteResult {
  mode: 'insert' | 'upsert';
}

interface SupabaseHealthResult {
  schema: string;
  tableName: string;
  rowCount: number | null;
}

function normalizeCredentials(
  credentials: Record<string, unknown> | SupabaseProviderCredentials
): SupabaseProviderCredentials {
  return {
    projectUrl: typeof credentials.projectUrl === 'string' ? credentials.projectUrl : '',
    serviceRoleKey: typeof credentials.serviceRoleKey === 'string' ? credentials.serviceRoleKey : '',
    schema: typeof credentials.schema === 'string' && credentials.schema.trim().length > 0
      ? credentials.schema.trim()
      : 'public',
    tableName: typeof credentials.tableName === 'string' ? credentials.tableName : '',
    upsertKey:
      typeof credentials.upsertKey === 'string' && credentials.upsertKey.trim().length > 0
        ? credentials.upsertKey.trim()
        : undefined
  };
}

export class SupabaseDataClient {
  private buildClient(credentials: SupabaseProviderCredentials) {
    return createClient(credentials.projectUrl, credentials.serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      db: {
        schema: credentials.schema ?? 'public'
      }
    });
  }

  private ensureConfigured(credentials: SupabaseProviderCredentials): void {
    if (!credentials.projectUrl || !credentials.serviceRoleKey || !credentials.tableName) {
      throw new AppError(
        'Supabase credentials are incomplete',
        400,
        'provider_credentials_invalid',
        {
          providerType: 'SUPABASE',
          requiredFields: ['projectUrl', 'serviceRoleKey', 'tableName']
        }
      );
    }
  }

  public async verifyTableAccess(
    rawCredentials: Record<string, unknown> | SupabaseProviderCredentials
  ): Promise<SupabaseHealthResult> {
    const credentials = normalizeCredentials(rawCredentials);
    this.ensureConfigured(credentials);

    const client = this.buildClient(credentials);
    const { count, error } = await client
      .from(credentials.tableName)
      .select('*', { count: 'exact', head: true })
      .limit(1);

    if (error) {
      throw new AppError('Supabase health check failed', 502, 'provider_request_failed', {
        provider: 'supabase',
        operation: 'health-check',
        statusCode: 502,
        responseBody: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        }
      });
    }

    return {
      schema: credentials.schema ?? 'public',
      tableName: credentials.tableName,
      rowCount: typeof count === 'number' ? count : null
    };
  }

  public async writeLeadRow(
    rawCredentials: Record<string, unknown> | SupabaseProviderCredentials,
    row: Record<string, unknown>
  ): Promise<SupabaseWriteResult> {
    const credentials = normalizeCredentials(rawCredentials);
    this.ensureConfigured(credentials);

    const client = this.buildClient(credentials);
    const filteredRow = { ...row };
    const maxAttempts = Object.keys(row).length;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const operation = credentials.upsertKey
        ? client.from(credentials.tableName).upsert([filteredRow], {
            onConflict: credentials.upsertKey,
            ignoreDuplicates: false
          })
        : client.from(credentials.tableName).insert([filteredRow]);

      const { error } = await operation;

      if (!error) {
        return { mode: credentials.upsertKey ? 'upsert' : 'insert' };
      }

      if (error.code === 'PGRST204') {
        const match = error.message.match(/Could not find the '([^']+)' column/);
        if (match?.[1] && match[1] in filteredRow) {
          delete filteredRow[match[1]];
          continue;
        }
      }

      throw new AppError('Supabase write failed', 502, 'provider_request_failed', {
        provider: 'supabase',
        operation: credentials.upsertKey ? 'upsert-row' : 'insert-row',
        statusCode: 502,
        responseBody: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        }
      });
    }

    throw new AppError('Supabase write failed — too many unknown columns', 502, 'provider_request_failed', {
      provider: 'supabase',
      operation: credentials.upsertKey ? 'upsert-row' : 'insert-row',
      statusCode: 502,
      responseBody: {
        remainingColumns: Object.keys(filteredRow)
      }
    });
  }
}
