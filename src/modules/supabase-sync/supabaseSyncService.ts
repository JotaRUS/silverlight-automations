import type { PrismaClient } from '@prisma/client';

import { AppError } from '../../core/errors/appError';
import { ProviderAccountsService } from '../providers/providerAccountsService';
import {
  SupabaseDataClient,
  type SupabaseProviderCredentials
} from '../../integrations/supabase/supabaseClient';

export interface SupabaseSyncInput {
  projectId: string;
  leadId: string;
}

function metadataString(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function metadataStringArray(metadata: unknown, key: string): string[] {
  if (!metadata || typeof metadata !== 'object') {
    return [];
  }
  const value = (metadata as Record<string, unknown>)[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export class SupabaseSyncService {
  private readonly providerAccountsService: ProviderAccountsService;
  private readonly supabaseClient: SupabaseDataClient;

  public constructor(
    private readonly prismaClient: PrismaClient,
    dependencies?: {
      providerAccountsService?: ProviderAccountsService;
      supabaseClient?: SupabaseDataClient;
    }
  ) {
    this.providerAccountsService =
      dependencies?.providerAccountsService ?? new ProviderAccountsService(prismaClient);
    this.supabaseClient = dependencies?.supabaseClient ?? new SupabaseDataClient();
  }

  private async resolveCredentials(projectId: string): Promise<SupabaseProviderCredentials | null> {
    const project = await this.prismaClient.project.findUnique({
      where: { id: projectId },
      select: {
        supabaseProviderAccountId: true
      }
    });

    if (!project?.supabaseProviderAccountId) {
      return null;
    }

    const credentials = await this.providerAccountsService.getDecryptedCredentials(
      project.supabaseProviderAccountId,
      'SUPABASE'
    );

    return credentials as unknown as SupabaseProviderCredentials;
  }

  private async buildLeadRow(input: SupabaseSyncInput): Promise<Record<string, unknown>> {
    const lead = await this.prismaClient.lead.findUnique({
      where: { id: input.leadId },
      include: {
        project: {
          select: {
            id: true,
            name: true
          }
        },
        company: {
          select: {
            name: true
          }
        },
        expert: {
          include: {
            contacts: {
              where: { deletedAt: null },
              orderBy: [
                { isPrimary: 'desc' },
                { verificationStatus: 'asc' },
                { createdAt: 'asc' }
              ]
            }
          }
        },
        enrichmentAttempts: {
          orderBy: { attemptedAt: 'desc' }
        }
      }
    });

    if (!lead || !lead.expert || lead.deletedAt) {
      throw new AppError('Lead not found for Supabase sync', 404, 'lead_not_found', {
        leadId: input.leadId
      });
    }

    const emails = uniqStrings(
      lead.expert.contacts
        .filter((contact) => contact.type === 'EMAIL')
        .map((contact) => contact.valueNormalized || contact.value)
    );
    const phones = uniqStrings(
      lead.expert.contacts
        .filter((contact) => contact.type === 'PHONE')
        .map((contact) => contact.valueNormalized || contact.value)
    );

    const providerSummary = Array.from(
      new Map(
        lead.enrichmentAttempts.map((attempt) => [
          attempt.provider,
          {
            provider: attempt.provider,
            status: attempt.status,
            attemptedAt: attempt.attemptedAt.toISOString()
          }
        ])
      ).values()
    );

    const city = metadataString(lead.metadata, 'city') ?? metadataString(lead.expert.metadata, 'city');
    const state =
      metadataString(lead.metadata, 'state') ?? metadataString(lead.expert.metadata, 'state');
    const tags = metadataStringArray(lead.metadata, 'tags');

    return {
      project_id: lead.project.id,
      project_name: lead.project.name,
      lead_id: lead.id,
      lead_status: lead.status,
      lead_created_at: lead.createdAt.toISOString(),
      lead_updated_at: lead.updatedAt.toISOString(),
      enrichment_confidence:
        lead.enrichmentConfidence !== null && lead.enrichmentConfidence !== undefined
          ? Number(lead.enrichmentConfidence)
          : null,
      expert_id: lead.expert.id,
      full_name: lead.fullName ?? lead.expert.fullName,
      first_name: lead.firstName ?? lead.expert.firstName,
      last_name: lead.lastName ?? lead.expert.lastName,
      job_title: lead.jobTitle ?? lead.expert.currentRole,
      linkedin_url: lead.linkedinUrl,
      country_iso: lead.countryIso ?? lead.expert.countryIso,
      region_iso: lead.regionIso ?? lead.expert.regionIso,
      city,
      state,
      company_name: lead.company?.name ?? lead.expert.currentCompany,
      emails,
      phones,
      primary_email: emails[0] ?? null,
      primary_phone: phones[0] ?? null,
      apollo_id: metadataString(lead.metadata, 'apolloId'),
      tags,
      enrichment_providers: providerSummary.map((item) => item.provider),
      enrichment_provider_summary: providerSummary,
      synced_at: new Date().toISOString()
    };
  }

  public async syncLead(input: SupabaseSyncInput): Promise<void> {
    const credentials = await this.resolveCredentials(input.projectId);
    if (!credentials) {
      return;
    }

    const row = await this.buildLeadRow(input);
    await this.supabaseClient.writeLeadRow(credentials, row);
    await this.prismaClient.lead.update({
      where: { id: input.leadId },
      data: { supabaseExportedAt: new Date() }
    });
  }
}
