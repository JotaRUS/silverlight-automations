import type { Prisma, PrismaClient, ProviderAccount } from '@prisma/client';

import { AppError } from '../../core/errors/appError';
import { decryptProviderCredentials, encryptProviderCredentials } from '../../core/providers/providerCredentialsCrypto';
import { parseProviderCredentials } from '../../core/providers/providerCredentialSchemas';
import type { ProviderType } from '../../core/providers/providerTypes';
import { PROVIDER_TYPE_TO_PROJECT_BINDING_FIELD } from '../../core/providers/providerTypes';
import { runProviderHealthCheck } from '../../integrations/providers/providerHealthChecker';
import { clock } from '../../core/time/clock';

export interface ProviderAccountCreateInput {
  providerType: ProviderType;
  accountLabel: string;
  credentials: Record<string, unknown>;
  isActive?: boolean;
  rateLimitConfig?: Record<string, unknown>;
}

export interface ProviderAccountUpdateInput {
  accountLabel?: string;
  credentials?: Record<string, unknown>;
  isActive?: boolean;
  rateLimitConfig?: Record<string, unknown>;
}

export interface ProviderAccountListFilters {
  providerType?: ProviderType;
  isActive?: boolean;
}

export interface ProviderAccountSanitizedView {
  id: string;
  providerType: ProviderType;
  accountLabel: string;
  isActive: boolean;
  rateLimitConfig: Record<string, unknown> | null;
  createdByAdminId: string;
  createdAt: Date;
  updatedAt: Date;
  lastHealthCheckAt: Date | null;
  lastHealthStatus: string | null;
  lastHealthError: string | null;
  credentialFields: string[];
}

function toJsonValue(value: Record<string, unknown> | undefined): Prisma.InputJsonValue | undefined {
  return value as Prisma.InputJsonValue | undefined;
}

function sanitizeAccount(account: ProviderAccount, credentials: Record<string, unknown>): ProviderAccountSanitizedView {
  return {
    id: account.id,
    providerType: account.providerType as ProviderType,
    accountLabel: account.accountLabel,
    isActive: account.isActive,
    rateLimitConfig: (account.rateLimitConfig as Record<string, unknown> | null) ?? null,
    createdByAdminId: account.createdByAdminId,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    lastHealthCheckAt: account.lastHealthCheckAt,
    lastHealthStatus: account.lastHealthStatus,
    lastHealthError: account.lastHealthError,
    credentialFields: Object.keys(credentials)
  };
}

export class ProviderAccountsService {
  public constructor(private readonly prismaClient: PrismaClient) {}

  private async getOrThrow(providerAccountId: string): Promise<ProviderAccount> {
    const account = await this.prismaClient.providerAccount.findUnique({
      where: {
        id: providerAccountId
      }
    });
    if (!account) {
      throw new AppError('Provider account not found', 404, 'provider_account_not_found', {
        providerAccountId
      });
    }
    return account;
  }

  private parseEncryptedCredentials(account: ProviderAccount): Record<string, unknown> {
    return decryptProviderCredentials(account.credentialsJson as Record<string, unknown>);
  }

  public async list(filters: ProviderAccountListFilters = {}): Promise<ProviderAccountSanitizedView[]> {
    const rows = await this.prismaClient.providerAccount.findMany({
      where: {
        providerType: filters.providerType as ProviderAccount['providerType'] | undefined,
        isActive: filters.isActive
      },
      orderBy: [
        {
          providerType: 'asc'
        },
        {
          accountLabel: 'asc'
        }
      ]
    });

    return rows.map((row) => sanitizeAccount(row, this.parseEncryptedCredentials(row)));
  }

  public async create(input: ProviderAccountCreateInput, createdByAdminId: string): Promise<ProviderAccountSanitizedView> {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(createdByAdminId)) {
      throw new AppError(
        'Invalid admin identity — you must log in with a valid Caller UUID',
        400,
        'invalid_admin_identity',
        { createdByAdminId }
      );
    }

    const creator = await this.prismaClient.caller.findUnique({
      where: {
        id: createdByAdminId
      }
    });
    if (!creator) {
      throw new AppError('Creator identity not found', 400, 'creator_identity_not_found', {
        createdByAdminId
      });
    }

    const parsedCredentials = parseProviderCredentials(input.providerType, input.credentials);
    const encryptedCredentials = encryptProviderCredentials(parsedCredentials);

    const created = await this.prismaClient.providerAccount.create({
      data: {
        providerType: input.providerType as never,
        accountLabel: input.accountLabel,
        credentialsJson: encryptedCredentials as unknown as Prisma.InputJsonValue,
        isActive: input.isActive ?? true,
        rateLimitConfig: toJsonValue(input.rateLimitConfig),
        createdByAdminId
      }
    });

    return sanitizeAccount(created, parsedCredentials);
  }

  public async update(
    providerAccountId: string,
    input: ProviderAccountUpdateInput
  ): Promise<ProviderAccountSanitizedView> {
    const existing = await this.getOrThrow(providerAccountId);
    const currentCredentials = this.parseEncryptedCredentials(existing);
    const parsedCredentials =
      input.credentials !== undefined
        ? parseProviderCredentials(existing.providerType as ProviderType, input.credentials)
        : currentCredentials;

    const updated = await this.prismaClient.providerAccount.update({
      where: {
        id: providerAccountId
      },
      data: {
        accountLabel: input.accountLabel,
        credentialsJson:
          input.credentials !== undefined
            ? (encryptProviderCredentials(parsedCredentials) as unknown as Prisma.InputJsonValue)
            : undefined,
        isActive: input.isActive,
        rateLimitConfig: toJsonValue(input.rateLimitConfig)
      }
    });

    return sanitizeAccount(updated, parsedCredentials);
  }

  public async get(providerAccountId: string): Promise<ProviderAccountSanitizedView> {
    const account = await this.getOrThrow(providerAccountId);
    return sanitizeAccount(account, this.parseEncryptedCredentials(account));
  }

  public async getDecryptedCredentials(
    providerAccountId: string,
    providerType?: ProviderType
  ): Promise<Record<string, unknown>> {
    const account = await this.getOrThrow(providerAccountId);
    if (providerType && account.providerType !== providerType) {
      throw new AppError('Provider account type mismatch', 409, 'provider_account_type_mismatch', {
        expectedProviderType: providerType,
        actualProviderType: account.providerType
      });
    }
    return this.parseEncryptedCredentials(account);
  }

  public async getActiveAccountOrThrow(
    providerAccountId: string,
    providerType?: ProviderType
  ): Promise<ProviderAccount> {
    const account = await this.getOrThrow(providerAccountId);
    if (!account.isActive) {
      throw new AppError('Provider account inactive', 409, 'provider_account_inactive', {
        providerAccountId
      });
    }
    if (providerType && account.providerType !== providerType) {
      throw new AppError('Provider account type mismatch', 409, 'provider_account_type_mismatch', {
        expectedProviderType: providerType,
        actualProviderType: account.providerType
      });
    }
    return account;
  }

  public async runHealthCheck(
    providerAccountId: string,
    correlationId: string
  ): Promise<ProviderAccountSanitizedView> {
    const account = await this.getOrThrow(providerAccountId);
    const credentials = this.parseEncryptedCredentials(account);
    const parsedCredentials = parseProviderCredentials(account.providerType as ProviderType, credentials);

    try {
      const checkResult = await runProviderHealthCheck({
        providerType: account.providerType as ProviderType,
        credentials: parsedCredentials,
        correlationId
      });

      const updated = await this.prismaClient.providerAccount.update({
        where: {
          id: account.id
        },
        data: {
          lastHealthCheckAt: clock.now(),
          lastHealthStatus: checkResult.healthy ? 'healthy' : 'unhealthy',
          lastHealthError: null
        }
      });
      return sanitizeAccount(updated, parsedCredentials);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'unknown';
      const updated = await this.prismaClient.providerAccount.update({
        where: {
          id: account.id
        },
        data: {
          lastHealthCheckAt: clock.now(),
          lastHealthStatus: 'unhealthy',
          lastHealthError: errorMessage
        }
      });
      throw new AppError('Provider health check failed', 422, 'provider_health_check_failed', {
        providerAccountId: account.id,
        providerType: account.providerType,
        reason: errorMessage,
        account: sanitizeAccount(updated, parsedCredentials)
      });
    }
  }

  public async bindToProject(providerAccountId: string, projectId: string): Promise<void> {
    const account = await this.getOrThrow(providerAccountId);
    const project = await this.prismaClient.project.findUnique({
      where: {
        id: projectId
      }
    });
    if (!project) {
      throw new AppError('Project not found', 404, 'project_not_found', { projectId });
    }

    const bindingField = PROVIDER_TYPE_TO_PROJECT_BINDING_FIELD[account.providerType as ProviderType];
    const projectUpdateData: Prisma.ProjectUpdateInput = {
      [bindingField]: providerAccountId
    } as unknown as Prisma.ProjectUpdateInput;
    await this.prismaClient.project.update({
      where: {
        id: projectId
      },
      data: projectUpdateData
    });
  }
}

