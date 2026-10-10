import { z } from 'zod';

export const modelAcquisitionSchema = z.object({
  id: z.string(),
  target_id: z.string().optional(),
  storage_root: z.string().optional(),
  repository: z.string(),
  requested_revision: z.string(),
  revision: z.string().nullable(),
  destination: z.string(),
  state: z.enum(['queued', 'running', 'ready', 'failed', 'cancelled', 'interrupted', 'stale']),
  phase: z.string(),
  bytes_done: z.number(),
  bytes_total: z.number().nullable(),
  created_at: z.number(),
  updated_at: z.number(),
  observed_at: z.number().optional(),
  error: z.string().nullable(),
  // hf_cache: found in a shared Hugging Face cache; no CLIO receipt, files not hashed.
  origin: z.enum(['receipt', 'hf_cache']).optional(),
});
export const modelInventorySchema = z.object({
  target_id: z.string(),
  models: z.array(modelAcquisitionSchema),
  errors: z.array(z.object({ storage_root: z.string(), error: z.string() })),
  unavailable_reason: z.string().nullable(),
});
export const modelSearchSchema = z.object({
  models: z.array(
    z.object({
      repository: z.string(),
      revision: z.string().nullable(),
      task: z.string().nullable(),
      gated: z.union([z.boolean(), z.string()]),
      downloads: z.number().nullable(),
      size_bytes: z.number().nullable(),
    }),
  ),
});
export type ModelAcquisition = z.infer<typeof modelAcquisitionSchema>;
export type ModelDownloadInput = { repository: string; revision: string; destination: string };
