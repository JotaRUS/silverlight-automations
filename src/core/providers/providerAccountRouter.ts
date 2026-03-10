import { createHash } from 'node:crypto';

import type { Prisma, PrismaClient, ProviderAccount } from '@prisma/client';

import { AppError } from '../errors/appError';
import { namespacedRedisKey } from '../redis/namespace';
import { redisConnection } from '../../queues/redis';
import { emitNotification } from '../../modules/notifications/emitNotification';
import {
  type ProjectProviderBindingField,
  type ProviderType,
  PROVIDER_TYPE_TO_PROJECT_BINDING_FIELD
} from './providerTypes';
import { ProviderAccountQuarantineStore } from './providerAccountQuarantineStore';

interface EnrichmentProviderRoutingEntry {
  providerType: ProviderType;
  providerAccountId: string;
  weight?: number;
  order?: number;
}

interface EnrichmentRoutingConfig {
  enrichment_strategy?: 'weighted' | 'ordered' | 'single';
  providers?: EnrichmentProviderRoutingEntry[];
}

export interface ProviderAccountSelectionOptions {
  providerType: ProviderType;
  projectId?: string;
  correlationId?: string;
  fallbackStrategy?: 'round_robin' | 'weighted' | 'single';
}

const DEFAULT_QUARANTINE_SECONDS = 300;

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function extractBindingAccountId(
  projectRecord: Record<string, unknown>,
  bindingField: ProjectProviderBindingField
): string | null {
  const value = projectRecord[bindingField];
  if (typeof value !== 'string' || !value) {
    return null;
  }
  return value;
}

function parseRoutingConfig(value: unknown): EnrichmentRoutingConfig {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const raw = value as Record<string, unknown>;
  const providers = Array.isArray(raw.providers)
    ? raw.providers.reduce<EnrichmentProviderRoutingEntry[]>((accumulator, entry) => {
        if (!entry || typeof entry !== 'object') {
          return accumulator;
        }
        const candidate = entry as Record<string, unknown>;
        if (typeof candidate.providerType !== 'string' || typeof candidate.providerAccountId !== 'string') {
          return accumulator;
        }
        accumulator.push({
          providerType: candidate.providerType as ProviderType,
          providerAccountId: candidate.providerAccountId,
          weight:
            typeof candidate.weight === 'number' && Number.isFinite(candidate.weight)
              ? candidate.weight
              : undefined,
          order:
            typeof candidate.order === 'number' && Number.isFinite(candidate.order)
              ? candidate.order
              : undefined
        });
        return accumulator;
      }, [])
    : undefined;

  return {
    enrichment_strategy:
      raw.enrichment_strategy === 'weighted' ||
      raw.enrichment_strategy === 'ordered' ||
      raw.enrichment_strategy === 'single'
        ? raw.enrichment_strategy
        : undefined,
    providers
  };
}

function stableHash(value: string): number {
  const digest = createHash('sha256').update(value).digest();
  return digest.readUInt32BE(0);
}

export class ProviderAccountRouter {
  private readonly quarantineStore: ProviderAccountQuarantineStore;

  public constructor(
    private readonly prismaClient: PrismaClient,
    quarantineStore?: ProviderAccountQuarantineStore
  ) {
    this.quarantineStore = quarantineStore ?? new ProviderAccountQuarantineStore();
  }

  private async getProjectBindings(projectId: string): Promise<Record<string, unknown>> {
    const project = await this.prismaClient.project.findUnique({
      where: {
        id: projectId
      }
    });
    if (!project) {
      throw new AppError('Project not found', 404, 'project_not_found', { projectId });
    }
    return project as unknown as Record<string, unknown>;
  }

  private async resolveCandidateAccounts(
    providerType: ProviderType,
    projectId?: string
  ): Promise<ProviderAccount[]> {
    const activeAccounts = await this.prismaClient.providerAccount.findMany({
      where: {
        providerType: providerType as never,
        isActive: true,
        NOT: { lastHealthStatus: 'out_of_credits' }
      },
      orderBy: [
        {
          createdAt: 'asc'
        },
        {
          id: 'asc'
        }
      ]
    });

    if (!projectId) {
      return activeAccounts;
    }

    const projectBindings = await this.getProjectBindings(projectId);
    const boundField = PROVIDER_TYPE_TO_PROJECT_BINDING_FIELD[providerType];
    const explicitBoundAccountId = extractBindingAccountId(projectBindings, boundField);
    if (explicitBoundAccountId) {
      const explicit = activeAccounts.find((account) => account.id === explicitBoundAccountId);
      if (!explicit) {
        throw new AppError('Project bound provider account is inactive or missing', 409, 'provider_account_unavailable', {
          providerType,
          projectId,
          providerAccountId: explicitBoundAccountId
        });
      }
      return [explicit];
    }

    if (providerType === 'LEADMAGIC' ||
      providerType === 'PROSPEO' ||
      providerType === 'EXA' ||
      providerType === 'ROCKETREACH' ||
      providerType === 'WIZA' ||
      providerType === 'FORAGER' ||
      providerType === 'ZELIQ' ||
      providerType === 'CONTACTOUT' ||
      providerType === 'DATAGM' ||
      providerType === 'PEOPLEDATALABS' ||
      providerType === 'ANYLEADS') {
      const routingConfig = parseRoutingConfig(projectBindings.enrichmentRoutingConfig);
      const configuredEntries = (routingConfig.providers ?? []).filter(
        (entry) => entry.providerType === providerType
      );

      if (configuredEntries.length > 0) {
        const configuredIds = new Set(configuredEntries.map((entry) => entry.providerAccountId));
        const filtered = activeAccounts.filter((account) => configuredIds.has(account.id));
        if (filtered.length > 0) {
          return filtered;
        }
      }
    }

    return activeAccounts;
  }

  private async selectRoundRobin(
    providerType: ProviderType,
    candidates: ProviderAccount[],
    projectId?: string
  ): Promise<ProviderAccount> {
    const projectKeyPart = projectId ?? 'global';
    const key = namespacedRedisKey(`provider-rotation:${projectKeyPart}:${providerType}`);
    const counter = await redisConnection.incr(key);
    const index = Math.abs(counter - 1) % candidates.length;
    return candidates[index] ?? candidates[0];
  }

  private selectWeighted(
    providerType: ProviderType,
    candidates: ProviderAccount[],
    projectRoutingConfig: EnrichmentRoutingConfig,
    seed: string
  ): ProviderAccount {
    const configWeights = new Map(
      (projectRoutingConfig.providers ?? [])
        .filter((entry) => entry.providerType === providerType)
        .map((entry) => [entry.providerAccountId, Math.max(1, Math.floor(entry.weight ?? 1))])
    );
    const weightedCandidates = candidates.map((candidate) => ({
      account: candidate,
      weight: configWeights.get(candidate.id) ?? 1
    }));
    const totalWeight = weightedCandidates.reduce((sum, item) => sum + item.weight, 0);
    let cursor = stableHash(seed) % totalWeight;
    for (const item of weightedCandidates) {
      if (cursor < item.weight) {
        return item.account;
      }
      cursor -= item.weight;
    }

    return weightedCandidates[0]?.account ?? candidates[0];
  }

  private sortByConfiguredOrder(
    providerType: ProviderType,
    candidates: ProviderAccount[],
    projectRoutingConfig: EnrichmentRoutingConfig
  ): ProviderAccount[] {
    const orders = new Map(
      (projectRoutingConfig.providers ?? [])
        .filter((entry) => entry.providerType === providerType)
        .map((entry) => [entry.providerAccountId, entry.order ?? Number.MAX_SAFE_INTEGER])
    );
    return [...candidates].sort((left, right) => {
      const leftOrder = orders.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = orders.get(right.id) ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder === rightOrder) {
        return left.createdAt.getTime() - right.createdAt.getTime();
      }
      return leftOrder - rightOrder;
    });
  }

  public async selectProviderAccount(
    options: ProviderAccountSelectionOptions
  ): Promise<ProviderAccount> {
    const candidates = await this.resolveCandidateAccounts(options.providerType, options.projectId);
    const availableCandidates: ProviderAccount[] = [];
    for (const candidate of candidates) {
      if (!(await this.quarantineStore.isQuarantined(candidate.id))) {
        availableCandidates.push(candidate);
      }
    }

    if (availableCandidates.length === 0) {
      throw new AppError('No active provider accounts available', 409, 'provider_account_unavailable', {
        providerType: options.providerType,
        projectId: options.projectId
      });
    }

    const projectRoutingConfig = options.projectId
      ? parseRoutingConfig((await this.getProjectBindings(options.projectId)).enrichmentRoutingConfig)
      : {};
    const strategy =
      projectRoutingConfig.enrichment_strategy ??
      options.fallbackStrategy ??
      'round_robin';

    if (strategy === 'single') {
      const sorted = this.sortByConfiguredOrder(options.providerType, availableCandidates, projectRoutingConfig);
      return sorted[0];
    }

    if (strategy === 'ordered') {
      const sorted = this.sortByConfiguredOrder(options.providerType, availableCandidates, projectRoutingConfig);
      return sorted[0];
    }

    if (strategy === 'weighted') {
      const seed = options.correlationId ?? `${options.providerType}:${options.projectId ?? 'global'}`;
      return this.selectWeighted(options.providerType, availableCandidates, projectRoutingConfig, seed);
    }

    return this.selectRoundRobin(options.providerType, availableCandidates, options.projectId);
  }

  public async markProviderAccountFailure(
    providerAccountId: string,
    options: {
      reason: string;
      statusCode?: number;
      providerType: ProviderType;
      quarantineSeconds?: number;
      responseBody?: unknown;
    }
  ): Promise<void> {
    const providerAccount = await this.prismaClient.providerAccount.findUnique({
      where: { id: providerAccountId }
    });
    if (!providerAccount) {
      return;
    }

    const label = providerAccount.accountLabel;

    if (this.isOutOfCreditsFailure(options.statusCode, options.responseBody)) {
      await this.prismaClient.providerAccount.update({
        where: { id: providerAccountId },
        data: {
          lastHealthStatus: 'out_of_credits',
          lastHealthError: `Account has run out of credits or the subscription has expired (HTTP ${options.statusCode ?? 'unknown'}). Run "Test Connection" after topping up to re-enable.`,
          lastHealthCheckAt: new Date()
        }
      });
      await this.prismaClient.systemEvent.create({
        data: {
          category: 'ENFORCEMENT',
          entityType: 'provider_account',
          entityId: providerAccountId,
          message: 'provider-account-out-of-credits',
          payload: toJsonValue({
            providerType: options.providerType,
            reason: options.reason,
            statusCode: options.statusCode
          })
        }
      });
      emitNotification({
        type: 'provider.failure',
        severity: 'ERROR',
        title: `${options.providerType} out of credits`,
        message: `${label}: Account is out of credits or subscription expired. Disabled until a successful "Test Connection".`,
        metadata: {
          providerAccountId,
          providerType: options.providerType,
          statusCode: options.statusCode
        }
      });
      return;
    }

    const isRateLimitFailure = options.statusCode === 429 || options.reason.toLowerCase().includes('rate');
    const isTimeoutFailure = options.reason.toLowerCase().includes('timeout');
    const isNetworkFailure = options.reason.toLowerCase().includes('network');
    if (!isRateLimitFailure && !isTimeoutFailure && !isNetworkFailure) {
      return;
    }

    const rateLimitConfig = (providerAccount.rateLimitConfig ?? {}) as Record<string, unknown>;
    const configuredSeconds =
      typeof rateLimitConfig.quarantineSeconds === 'number' && Number.isFinite(rateLimitConfig.quarantineSeconds)
        ? Math.max(1, Math.floor(rateLimitConfig.quarantineSeconds))
        : undefined;
    const quarantineSeconds = options.quarantineSeconds ?? configuredSeconds ?? DEFAULT_QUARANTINE_SECONDS;
    await this.quarantineStore.quarantine(providerAccountId, quarantineSeconds);
    await this.prismaClient.systemEvent.create({
      data: {
        category: 'ENFORCEMENT',
        entityType: 'provider_account',
        entityId: providerAccountId,
        message: 'provider-account-quarantined',
        payload: toJsonValue({
          providerType: options.providerType,
          reason: options.reason,
          quarantineSeconds
        })
      }
    });

    const severity = options.statusCode === 429 ? 'WARNING' as const : 'ERROR' as const;
    emitNotification({
      type: 'provider.failure',
      severity,
      title: `${options.providerType} provider error`,
      message: `${label}: ${options.reason} — quarantined for ${quarantineSeconds}s`,
      metadata: {
        providerAccountId,
        providerType: options.providerType,
        statusCode: options.statusCode,
        quarantineSeconds
      }
    });
  }

  private isOutOfCreditsFailure(statusCode?: number, responseBody?: unknown): boolean {
    if (statusCode === 402) return true;
    if (statusCode === 403 || statusCode === 429) {
      if (responseBody && typeof responseBody === 'object') {
        const bodyStr = JSON.stringify(responseBody).toLowerCase();
        return bodyStr.includes('credit') ||
          bodyStr.includes('quota') ||
          bodyStr.includes('subscription') ||
          bodyStr.includes('billing') ||
          bodyStr.includes('payment') ||
          bodyStr.includes('plan limit');
      }
    }
    return false;
  }
}

