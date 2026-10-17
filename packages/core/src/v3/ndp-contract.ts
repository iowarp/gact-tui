import { z } from 'zod';

export const ndpDatasetSchema = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string(),
  description: z.string(),
  endpoint_id: z.string(),
  endpoint_name: z.string(),
  access: z.enum(['viewer', 'request_access']).nullable(),
  resources: z.array(
    z.object({
      id: z.string(),
      path: z.string(),
      name: z.string(),
      format: z.string(),
      size: z.number().nonnegative(),
      revision: z.string(),
    }),
  ),
});
export const ndpSearchSchema = z.object({
  datasets: z.array(ndpDatasetSchema),
  warnings: z.array(z.string()),
});
export type NDPDataset = z.infer<typeof ndpDatasetSchema>;
