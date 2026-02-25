import type { PrismaClient } from '@prisma/client';

import type { ProviderType } from './providerTypes';
import { ProviderAccountRouter } from './providerAccountRouter';
import { ProviderAccountsService } from '../../modules/providers/providerAccountsService';

export interface ResolvedProviderCredentials {
  providerAccountId: string;
  providerType: ProviderType;
  credentials: Record<string, unknown>;
}

export class ProviderCredentialResolver {
  private readonly router: ProviderAccountRouter;
  private readonly providerAccountsService: ProviderAccountsService;

  public constructor(prismaClient: PrismaClient) {
    this.router = new ProviderAccountRouter(prismaClient);
    this.providerAccountsService = new ProviderAccountsService(prismaClient);
  }

  public async resolve(options: {
    providerType: ProviderType;
    projectId?: string;
    correlationId?: string;
    fallbackStrategy?: 'round_robin' | 'weighted' | 'single';
  }): Promise<ResolvedProviderCredentials> {
    const selectedAccount = await this.router.selectProviderAccount(options);
    const credentials = await this.providerAccountsService.getDecryptedCredentials(
      selectedAccount.id,
      options.providerType
    );
    return {
      providerAccountId: selectedAccount.id,
      providerType: options.providerType,
      credentials
    };
  }

  public async markFailure(options: {
    providerAccountId: string;
    providerType: ProviderType;
    reason: string;
    statusCode?: number;
    quarantineSeconds?: number;
  }): Promise<void> {
    await this.router.markProviderAccountFailure(options.providerAccountId, {
      reason: options.reason,
      statusCode: options.statusCode,
      providerType: options.providerType,
      quarantineSeconds: options.quarantineSeconds
    });
  }
}

