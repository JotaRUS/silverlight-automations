import type { PrismaClient } from '@prisma/client';

import { AppError } from '../../core/errors/appError';
import { ProviderAccountsService } from '../providers/providerAccountsService';
import {
  normalizeSupabaseCredentials,
  SupabaseDataClient,
  type SupabaseProviderCredentials
} from '../../integrations/supabase/supabaseClient';

export interface SupabaseSyncInput {
  projectId: string;
  leadId: string;
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

    const raw = await this.providerAccountsService.getDecryptedCredentials(
      project.supabaseProviderAccountId,
      'SUPABASE'
    );

    return normalizeSupabaseCredentials(raw as Record<string, unknown>);
  }

  private async buildLeadRow(
    input: SupabaseSyncInput,
    credentials: SupabaseProviderCredentials
  ): Promise<Record<string, unknown>> {
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
    const linkedinContacts = lead.expert.contacts
      .filter((contact) => contact.type === 'LINKEDIN')
      .map((contact) => contact.value);

    const linkedinUrl = lead.linkedinUrl ?? linkedinContacts[0] ?? null;
    const primaryEmail = emails[0] ?? null;
    const primaryPhone = phones[0] ?? null;

    const countryIso = lead.countryIso ?? lead.expert.countryIso;
    const fullName =
      lead.fullName ??
      lead.expert.fullName ??
      ([lead.firstName ?? lead.expert.firstName, lead.lastName ?? lead.expert.lastName]
        .filter(Boolean)
        .join(' ')
        .trim() || null);
    const colFullName = credentials.columnMapping?.fullName;
    const colEmail = credentials.columnMapping?.email ?? 'primary_email';
    const colPhone = credentials.columnMapping?.phone ?? 'primary_phone';
    const colCountry = credentials.columnMapping?.country ?? 'country_iso';
    const colCompany = credentials.columnMapping?.currentCompany ?? 'company_name';
    const colLinkedin = credentials.columnMapping?.linkedinUrl ?? 'linkedin_url';
    const colJobTitle = credentials.columnMapping?.jobTitle ?? 'job_title';

    const row: Record<string, unknown> = {
      [colJobTitle]: lead.jobTitle ?? lead.expert.currentRole,
      [colLinkedin]: linkedinUrl,
      [colCountry]: countryIso,
      [colCompany]: lead.company?.name ?? lead.expert.currentCompany,
      [colEmail]: primaryEmail,
      [colPhone]: primaryPhone
    };
    if (colFullName) {
      row[colFullName] = fullName ?? '';
    }

    return row;
  }

  public async syncLead(input: SupabaseSyncInput): Promise<void> {
    const credentials = await this.resolveCredentials(input.projectId);
    if (!credentials) {
      return;
    }

    const row = await this.buildLeadRow(input, credentials);
    await this.supabaseClient.writeLeadRow(credentials, row);
    await this.prismaClient.lead.update({
      where: { id: input.leadId },
      data: { supabaseExportedAt: new Date() }
    });
  }
}
