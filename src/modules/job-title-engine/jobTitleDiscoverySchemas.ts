import { z } from 'zod';

export const jobTitleDiscoveryRequestSchema = z.object({
  projectId: z.string().uuid(),
  companies: z
    .array(
      z.object({
        companyId: z.string().uuid().optional(),
        companyName: z.string().min(1)
      })
    )
    .min(1),
  geographyIsoCodes: z.array(z.string().length(2)).min(1)
});

export type JobTitleDiscoveryRequest = z.infer<typeof jobTitleDiscoveryRequestSchema>;
