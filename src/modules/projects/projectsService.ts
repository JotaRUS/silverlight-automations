import type { Prisma, PrismaClient, Project, ScreeningQuestion } from '@prisma/client';

export interface ProjectCreateInput {
  name: string;
  description?: string;
  targetThreshold: number;
  geographyIsoCodes: string[];
  priority?: number;
  overrideCooldown?: boolean;
  regionConfig?: Record<string, unknown>;
  enrichmentRoutingConfig?: Record<string, unknown> | null;
  apolloProviderAccountId?: string;
  salesNavWebhookProviderAccountId?: string;
  leadmagicProviderAccountId?: string;
  prospeoProviderAccountId?: string;
  exaProviderAccountId?: string;
  rocketreachProviderAccountId?: string;
  wizaProviderAccountId?: string;
  foragerProviderAccountId?: string;
  zeliqProviderAccountId?: string;
  contactoutProviderAccountId?: string;
  datagmProviderAccountId?: string;
  peopledatalabsProviderAccountId?: string;
  linkedinProviderAccountId?: string;
  emailProviderAccountId?: string;
  twilioProviderAccountId?: string;
  whatsapp2chatProviderAccountId?: string;
  respondioProviderAccountId?: string;
  lineProviderAccountId?: string;
  wechatProviderAccountId?: string;
  viberProviderAccountId?: string;
  telegramProviderAccountId?: string;
  kakaotalkProviderAccountId?: string;
  voicemailDropProviderAccountId?: string;
  yayProviderAccountId?: string;
  googleSheetsProviderAccountId?: string;
}

export interface ProjectUpdateInput {
  name?: string;
  description?: string;
  targetThreshold?: number;
  geographyIsoCodes?: string[];
  priority?: number;
  overrideCooldown?: boolean;
  regionConfig?: Record<string, unknown>;
  enrichmentRoutingConfig?: Record<string, unknown> | null;
  apolloProviderAccountId?: string;
  salesNavWebhookProviderAccountId?: string;
  leadmagicProviderAccountId?: string;
  prospeoProviderAccountId?: string;
  exaProviderAccountId?: string;
  rocketreachProviderAccountId?: string;
  wizaProviderAccountId?: string;
  foragerProviderAccountId?: string;
  zeliqProviderAccountId?: string;
  contactoutProviderAccountId?: string;
  datagmProviderAccountId?: string;
  peopledatalabsProviderAccountId?: string;
  linkedinProviderAccountId?: string;
  emailProviderAccountId?: string;
  twilioProviderAccountId?: string;
  whatsapp2chatProviderAccountId?: string;
  respondioProviderAccountId?: string;
  lineProviderAccountId?: string;
  wechatProviderAccountId?: string;
  viberProviderAccountId?: string;
  telegramProviderAccountId?: string;
  kakaotalkProviderAccountId?: string;
  voicemailDropProviderAccountId?: string;
  yayProviderAccountId?: string;
  googleSheetsProviderAccountId?: string;
}

export interface AttachCompaniesInput {
  companies: {
    name: string;
    domain?: string;
    countryIso?: string;
    metadata?: Record<string, unknown>;
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

  private projectProviderBindings(
    input: Pick<ProjectCreateInput, 'apolloProviderAccountId' | 'salesNavWebhookProviderAccountId' | 'leadmagicProviderAccountId' | 'prospeoProviderAccountId' | 'exaProviderAccountId' | 'rocketreachProviderAccountId' | 'wizaProviderAccountId' | 'foragerProviderAccountId' | 'zeliqProviderAccountId' | 'contactoutProviderAccountId' | 'datagmProviderAccountId' | 'peopledatalabsProviderAccountId' | 'linkedinProviderAccountId' | 'emailProviderAccountId' | 'twilioProviderAccountId' | 'whatsapp2chatProviderAccountId' | 'respondioProviderAccountId' | 'lineProviderAccountId' | 'wechatProviderAccountId' | 'viberProviderAccountId' | 'telegramProviderAccountId' | 'kakaotalkProviderAccountId' | 'voicemailDropProviderAccountId' | 'yayProviderAccountId' | 'googleSheetsProviderAccountId'>
  ): Pick<ProjectCreateInput, 'apolloProviderAccountId' | 'salesNavWebhookProviderAccountId' | 'leadmagicProviderAccountId' | 'prospeoProviderAccountId' | 'exaProviderAccountId' | 'rocketreachProviderAccountId' | 'wizaProviderAccountId' | 'foragerProviderAccountId' | 'zeliqProviderAccountId' | 'contactoutProviderAccountId' | 'datagmProviderAccountId' | 'peopledatalabsProviderAccountId' | 'linkedinProviderAccountId' | 'emailProviderAccountId' | 'twilioProviderAccountId' | 'whatsapp2chatProviderAccountId' | 'respondioProviderAccountId' | 'lineProviderAccountId' | 'wechatProviderAccountId' | 'viberProviderAccountId' | 'telegramProviderAccountId' | 'kakaotalkProviderAccountId' | 'voicemailDropProviderAccountId' | 'yayProviderAccountId' | 'googleSheetsProviderAccountId'> {
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
      googleSheetsProviderAccountId: input.googleSheetsProviderAccountId
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
        overrideCooldown: input.overrideCooldown,
        regionConfig: toJsonValue(input.regionConfig),
        enrichmentRoutingConfig: toJsonValue(input.enrichmentRoutingConfig ?? undefined),
        ...this.projectProviderBindings(input)
      }
    });
  }

  public async getProject(projectId: string): Promise<Project | null> {
    return this.prismaClient.project.findUnique({
      where: { id: projectId }
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
    const createdCompanies = await this.prismaClient.$transaction(async (transaction) => {
      const results = await Promise.all(
        input.companies.map((company) =>
          transaction.company.upsert({
            where: {
              projectId_name: {
                projectId,
                name: company.name
              }
            },
            create: {
              projectId,
              name: company.name,
              domain: company.domain,
              countryIso: company.countryIso,
              metadata: toJsonValue(company.metadata)
            },
            update: {
              domain: company.domain,
              countryIso: company.countryIso,
              metadata: toJsonValue(company.metadata)
            }
          })
        )
      );

      return results.length;
    });

    return createdCompanies;
  }

  public async addSalesNavSearches(projectId: string, input: SalesNavSearchCreateInput): Promise<number> {
    const entries = input.searches.map((search) => ({
      projectId,
      sourceUrl: search.sourceUrl,
      normalizedUrl: search.normalizedUrl,
      metadata: toJsonValue(search.metadata) ?? {}
    }));

    const result = await this.prismaClient.salesNavSearch.createMany({
      data: entries,
      skipDuplicates: true
    });

    return result.count;
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

  public async listScreeningQuestions(projectId: string): Promise<ScreeningQuestion[]> {
    return this.prismaClient.screeningQuestion.findMany({
      where: { projectId },
      orderBy: { displayOrder: 'asc' }
    });
  }
}
