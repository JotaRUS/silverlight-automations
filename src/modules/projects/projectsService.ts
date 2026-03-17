import type { Prisma, PrismaClient, Project, ScreeningQuestion } from '@prisma/client';
import { extractApolloFiltersFromSalesNavSearch } from '../sales-nav/salesNavSearchParamExtractor';
import { enqueueWithContext } from '../../queues/producers/enqueueWithContext';
import { getQueues } from '../../queues';
import { buildJobId } from '../../queues/jobId';

export interface ProjectCreateInput {
  name: string;
  description?: string | null;
  targetThreshold: number;
  geographyIsoCodes: string[];
  priority?: number;
  status?: 'ACTIVE' | 'COMPLETED' | 'PAUSED' | 'ARCHIVED';
  overrideCooldown?: boolean;
  regionConfig?: Record<string, unknown>;
  enrichmentRoutingConfig?: Record<string, unknown> | null;
  apolloProviderAccountId?: string | null;
  salesNavWebhookProviderAccountId?: string | null;
  leadmagicProviderAccountId?: string | null;
  prospeoProviderAccountId?: string | null;
  exaProviderAccountId?: string | null;
  rocketreachProviderAccountId?: string | null;
  wizaProviderAccountId?: string | null;
  foragerProviderAccountId?: string | null;
  zeliqProviderAccountId?: string | null;
  contactoutProviderAccountId?: string | null;
  datagmProviderAccountId?: string | null;
  peopledatalabsProviderAccountId?: string | null;
  linkedinProviderAccountId?: string | null;
  emailProviderAccountId?: string | null;
  twilioProviderAccountId?: string | null;
  whatsapp2chatProviderAccountId?: string | null;
  respondioProviderAccountId?: string | null;
  lineProviderAccountId?: string | null;
  wechatProviderAccountId?: string | null;
  viberProviderAccountId?: string | null;
  telegramProviderAccountId?: string | null;
  kakaotalkProviderAccountId?: string | null;
  voicemailDropProviderAccountId?: string | null;
  yayProviderAccountId?: string | null;
  googleSheetsProviderAccountId?: string | null;
  supabaseProviderAccountId?: string | null;
  outreachMessageTemplate?: string | null;
}

export interface ProjectUpdateInput {
  name?: string;
  description?: string | null;
  targetThreshold?: number;
  geographyIsoCodes?: string[];
  priority?: number;
  status?: 'ACTIVE' | 'COMPLETED' | 'PAUSED' | 'ARCHIVED';
  overrideCooldown?: boolean;
  regionConfig?: Record<string, unknown>;
  enrichmentRoutingConfig?: Record<string, unknown> | null;
  apolloProviderAccountId?: string | null;
  salesNavWebhookProviderAccountId?: string | null;
  leadmagicProviderAccountId?: string | null;
  prospeoProviderAccountId?: string | null;
  exaProviderAccountId?: string | null;
  rocketreachProviderAccountId?: string | null;
  wizaProviderAccountId?: string | null;
  foragerProviderAccountId?: string | null;
  zeliqProviderAccountId?: string | null;
  contactoutProviderAccountId?: string | null;
  datagmProviderAccountId?: string | null;
  peopledatalabsProviderAccountId?: string | null;
  linkedinProviderAccountId?: string | null;
  emailProviderAccountId?: string | null;
  twilioProviderAccountId?: string | null;
  whatsapp2chatProviderAccountId?: string | null;
  respondioProviderAccountId?: string | null;
  lineProviderAccountId?: string | null;
  wechatProviderAccountId?: string | null;
  viberProviderAccountId?: string | null;
  telegramProviderAccountId?: string | null;
  kakaotalkProviderAccountId?: string | null;
  voicemailDropProviderAccountId?: string | null;
  yayProviderAccountId?: string | null;
  googleSheetsProviderAccountId?: string | null;
  supabaseProviderAccountId?: string | null;
  outreachMessageTemplate?: string | null;
}

export interface AttachCompaniesInput {
  companies: {
    name: string;
    domain?: string;
    countryIso?: string;
    metadata?: Record<string, unknown>;
  }[];
}

export interface AttachJobTitlesInput {
  jobTitles: {
    title: string;
    relevanceScore?: number;
  }[];
}

export interface SalesNavSearchCreateInput {
  searches: {
    sourceUrl: string;
    normalizedUrl: string;
    metadata?: Record<string, unknown>;
  }[];
}

export interface ScreeningQuestionCreateInput {
  prompt: string;
  displayOrder: number;
  required?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ScreeningQuestionUpdateInput {
  prompt?: string;
  displayOrder?: number;
  required?: boolean;
  metadata?: Record<string, unknown>;
}

function toJsonValue(value: Record<string, unknown> | undefined): Prisma.InputJsonValue | undefined {
  return value as Prisma.InputJsonValue | undefined;
}

export class ProjectsService {
  public constructor(private readonly prismaClient: PrismaClient) {}

  private normalizeJobTitle(title: string): string {
    return title.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private projectProviderBindings(
    input: Partial<Pick<ProjectUpdateInput, 'apolloProviderAccountId' | 'salesNavWebhookProviderAccountId' | 'leadmagicProviderAccountId' | 'prospeoProviderAccountId' | 'exaProviderAccountId' | 'rocketreachProviderAccountId' | 'wizaProviderAccountId' | 'foragerProviderAccountId' | 'zeliqProviderAccountId' | 'contactoutProviderAccountId' | 'datagmProviderAccountId' | 'peopledatalabsProviderAccountId' | 'linkedinProviderAccountId' | 'emailProviderAccountId' | 'twilioProviderAccountId' | 'whatsapp2chatProviderAccountId' | 'respondioProviderAccountId' | 'lineProviderAccountId' | 'wechatProviderAccountId' | 'viberProviderAccountId' | 'telegramProviderAccountId' | 'kakaotalkProviderAccountId' | 'voicemailDropProviderAccountId' | 'yayProviderAccountId' | 'googleSheetsProviderAccountId' | 'supabaseProviderAccountId'>>
  ): Record<string, string | null | undefined> {
    return {
      apolloProviderAccountId: input.apolloProviderAccountId,
      salesNavWebhookProviderAccountId: input.salesNavWebhookProviderAccountId,
      leadmagicProviderAccountId: input.leadmagicProviderAccountId,
      prospeoProviderAccountId: input.prospeoProviderAccountId,
      exaProviderAccountId: input.exaProviderAccountId,
      rocketreachProviderAccountId: input.rocketreachProviderAccountId,
      wizaProviderAccountId: input.wizaProviderAccountId,
      foragerProviderAccountId: input.foragerProviderAccountId,
      zeliqProviderAccountId: input.zeliqProviderAccountId,
      contactoutProviderAccountId: input.contactoutProviderAccountId,
      datagmProviderAccountId: input.datagmProviderAccountId,
      peopledatalabsProviderAccountId: input.peopledatalabsProviderAccountId,
      linkedinProviderAccountId: input.linkedinProviderAccountId,
      emailProviderAccountId: input.emailProviderAccountId,
      twilioProviderAccountId: input.twilioProviderAccountId,
      whatsapp2chatProviderAccountId: input.whatsapp2chatProviderAccountId,
      respondioProviderAccountId: input.respondioProviderAccountId,
      lineProviderAccountId: input.lineProviderAccountId,
      wechatProviderAccountId: input.wechatProviderAccountId,
      viberProviderAccountId: input.viberProviderAccountId,
      telegramProviderAccountId: input.telegramProviderAccountId,
      kakaotalkProviderAccountId: input.kakaotalkProviderAccountId,
      voicemailDropProviderAccountId: input.voicemailDropProviderAccountId,
      yayProviderAccountId: input.yayProviderAccountId,
      googleSheetsProviderAccountId: input.googleSheetsProviderAccountId,
      supabaseProviderAccountId: input.supabaseProviderAccountId
    };
  }

  public async createProject(input: ProjectCreateInput): Promise<Project> {
    return this.prismaClient.project.create({
      data: {
        name: input.name,
        description: input.description,
        targetThreshold: input.targetThreshold,
        geographyIsoCodes: input.geographyIsoCodes,
        priority: input.priority ?? 0,
        overrideCooldown: input.overrideCooldown ?? false,
        regionConfig: toJsonValue(input.regionConfig) ?? {},
        enrichmentRoutingConfig: toJsonValue(input.enrichmentRoutingConfig ?? undefined),
        outreachMessageTemplate: input.outreachMessageTemplate,
        ...this.projectProviderBindings(input)
      }
    });
  }

  public async updateProject(projectId: string, input: ProjectUpdateInput): Promise<Project> {
    return this.prismaClient.project.update({
      where: { id: projectId },
      data: {
        name: input.name,
        description: input.description,
        targetThreshold: input.targetThreshold,
        geographyIsoCodes: input.geographyIsoCodes,
        priority: input.priority,
        status: input.status,
        overrideCooldown: input.overrideCooldown,
        regionConfig: toJsonValue(input.regionConfig),
        enrichmentRoutingConfig: toJsonValue(input.enrichmentRoutingConfig ?? undefined),
        outreachMessageTemplate: input.outreachMessageTemplate,
        ...this.projectProviderBindings(input)
      }
    });
  }

  public async getProject(projectId: string): Promise<Project | null> {
    return this.prismaClient.project.findUnique({
      where: { id: projectId }
    });
  }

  public async deleteProject(projectId: string): Promise<Project> {
    return this.prismaClient.project.update({
      where: { id: projectId },
      data: { deletedAt: new Date(), status: 'ARCHIVED' }
    });
  }

  public async listProjects(): Promise<Project[]> {
    return this.prismaClient.project.findMany({
      where: {
        deletedAt: null
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });
  }

  public async attachCompanies(projectId: string, input: AttachCompaniesInput): Promise<number> {
    const desiredNames = input.companies.map((company) => company.name.trim()).filter(Boolean);
    const createdCompanies = await this.prismaClient.$transaction(async (transaction) => {
      await transaction.company.updateMany({
        where: {
          projectId,
          deletedAt: null,
          ...(desiredNames.length
            ? { name: { notIn: desiredNames } }
            : {})
        },
        data: {
          deletedAt: new Date()
        }
      });

      const results = await Promise.all(
        input.companies.map((company) =>
          transaction.company.upsert({
            where: {
              projectId_name: {
                projectId,
                name: company.name.trim()
              }
            },
            create: {
              projectId,
              name: company.name.trim(),
              domain: company.domain,
              countryIso: company.countryIso,
              metadata: toJsonValue(company.metadata)
            },
            update: {
              domain: company.domain,
              countryIso: company.countryIso,
              metadata: toJsonValue(company.metadata),
              deletedAt: null
            }
          })
        )
      );

      return results.length;
    });

    return createdCompanies;
  }

  public async listCompanies(projectId: string) {
    return this.prismaClient.company.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { name: 'asc' }
    });
  }

  public async attachJobTitles(projectId: string, input: AttachJobTitlesInput): Promise<number> {
    const desiredTitles = input.jobTitles.map((jobTitle) => this.normalizeJobTitle(jobTitle.title));
    await this.prismaClient.jobTitle.deleteMany({
      where: {
        projectId,
        ...(desiredTitles.length
          ? { titleNormalized: { notIn: desiredTitles } }
          : {})
      }
    });

    const createdJobTitles = await this.prismaClient.$transaction(async (transaction) => {
      const results = await Promise.all(
        input.jobTitles.map((jobTitle) =>
          transaction.jobTitle.upsert({
            where: {
              projectId_titleNormalized: {
                projectId,
                titleNormalized: this.normalizeJobTitle(jobTitle.title)
              }
            },
            create: {
              projectId,
              titleOriginal: jobTitle.title.trim(),
              titleNormalized: this.normalizeJobTitle(jobTitle.title),
              relevanceScore: jobTitle.relevanceScore ?? 1,
              aiDecisionLog: toJsonValue({ source: 'manual_input' }) ?? {},
              source: 'manual_input'
            },
            update: {
              titleOriginal: jobTitle.title.trim(),
              relevanceScore: jobTitle.relevanceScore ?? 1,
              aiDecisionLog: toJsonValue({ source: 'manual_input' }) ?? {},
              source: 'manual_input'
            }
          })
        )
      );

      return results.length;
    });

    return createdJobTitles;
  }

  public async listJobTitles(projectId: string) {
    return this.prismaClient.jobTitle.findMany({
      where: { projectId },
      orderBy: [{ relevanceScore: 'desc' }, { titleNormalized: 'asc' }]
    });
  }

  public async addSalesNavSearches(projectId: string, input: SalesNavSearchCreateInput): Promise<number> {
    const entries = input.searches.map((search) => {
      const apolloFilters = extractApolloFiltersFromSalesNavSearch({
        sourceUrl: search.sourceUrl,
        normalizedUrl: search.normalizedUrl,
        metadata: search.metadata
      });
      return {
        projectId,
        sourceUrl: search.sourceUrl,
        normalizedUrl: search.normalizedUrl,
        metadata: toJsonValue({
          ...(search.metadata ?? {}),
          apolloFilters
        }) ?? {}
      };
    });

    const result = await this.prismaClient.salesNavSearch.createMany({
      data: entries,
      skipDuplicates: true
    });

    return result.count;
  }

  public async listSalesNavSearches(projectId: string): Promise<unknown[]> {
    return this.prismaClient.salesNavSearch.findMany({
      where: { projectId, isActive: true, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { leads: true } } }
    });
  }

  public async deleteSalesNavSearch(projectId: string, searchId: string): Promise<void> {
    await this.prismaClient.salesNavSearch.updateMany({
      where: { id: searchId, projectId },
      data: { isActive: false, deletedAt: new Date() }
    });
  }

  public async importLeads(
    projectId: string,
    rows: Record<string, string>[],
    salesNavSearchId?: string
  ): Promise<{ imported: number; duplicatesSkipped: number; errors: string[] }> {
    let imported = 0;
    const errors: string[] = [];

    const columnMap: Record<string, string> = {
      'First Name': 'firstName',
      'Last Name': 'lastName',
      'first_name': 'firstName',
      'last_name': 'lastName',
      'firstName': 'firstName',
      'lastName': 'lastName',
      'Title': 'jobTitle',
      'Job Title': 'jobTitle',
      'title': 'jobTitle',
      'Company': 'companyName',
      'Company Name': 'companyName',
      'company': 'companyName',
      'companyName': 'companyName',
      'LinkedIn URL': 'linkedinUrl',
      'LinkedIn': 'linkedinUrl',
      'Profile URL': 'linkedinUrl',
      'linkedinUrl': 'linkedinUrl',
      'Location': 'country',
      'Country': 'country',
      'country': 'country',
      'Email': 'email',
      'email': 'email',
      'Phone': 'phone',
      'phone': 'phone'
    };

    for (const [idx, row] of rows.entries()) {
      try {
        const mapped: Record<string, string> = {};
        for (const [csvCol, value] of Object.entries(row)) {
          const field = columnMap[csvCol];
          if (field && value) mapped[field] = value;
        }

        const firstName = mapped.firstName || '';
        const lastName = mapped.lastName || '';
        const fullName = `${firstName} ${lastName}`.trim();
        if (!fullName) {
          errors.push(`Row ${String(idx + 1)}: missing name`);
          continue;
        }

        await enqueueWithContext(
          getQueues().leadIngestionQueue,
          'lead-ingestion.ingest',
          {
            projectId,
            salesNavSearchId,
            lead: {
              firstName,
              lastName,
              fullName,
              jobTitle: mapped.jobTitle || null,
              companyName: mapped.companyName || null,
              linkedinUrl: mapped.linkedinUrl || null,
              countryIso: mapped.country || null,
              emails: mapped.email ? [mapped.email] : [],
              phones: mapped.phone ? [mapped.phone] : [],
              metadata: { source: 'csv-import' }
            }
          },
          { jobId: buildJobId('csv-import', projectId, `${String(idx)}-${String(Date.now())}`) }
        );
        imported += 1;
      } catch (err) {
        errors.push(`Row ${String(idx + 1)}: ${err instanceof Error ? err.message : 'unknown error'}`);
      }
    }

    return { imported, duplicatesSkipped: rows.length - imported - errors.length, errors };
  }

  public async createScreeningQuestion(
    projectId: string,
    input: ScreeningQuestionCreateInput
  ): Promise<ScreeningQuestion> {
    return this.prismaClient.screeningQuestion.create({
      data: {
        projectId,
        prompt: input.prompt,
        displayOrder: input.displayOrder,
        required: input.required ?? true,
        metadata: toJsonValue(input.metadata)
      }
    });
  }

  public async updateScreeningQuestion(
    questionId: string,
    input: ScreeningQuestionUpdateInput
  ): Promise<ScreeningQuestion> {
    return this.prismaClient.screeningQuestion.update({
      where: { id: questionId },
      data: {
        prompt: input.prompt,
        displayOrder: input.displayOrder,
        required: input.required,
        metadata: toJsonValue(input.metadata)
      }
    });
  }

  public async deleteScreeningQuestion(questionId: string): Promise<void> {
    await this.prismaClient.screeningQuestion.delete({ where: { id: questionId } });
  }

  public async listScreeningQuestions(projectId: string): Promise<ScreeningQuestion[]> {
    return this.prismaClient.screeningQuestion.findMany({
      where: { projectId },
      orderBy: { displayOrder: 'asc' }
    });
  }
}
