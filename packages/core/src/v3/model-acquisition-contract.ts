import { z } from 'zod';
import { modelCapabilityTagsGeneratedSchema } from '../generated/clio-schemas/model-capability-tags.schema.js';
import { modelFactsGeneratedSchema } from '../generated/clio-schemas/model-facts.schema.js';

export const modelAcquisitionSchema = z.object({
  id: z.string(),
  target_id: z.string().optional(),
  storage_root: z.string().optional(),
  repository: z.string(),
  requested_revision: z.string(),
  revision: z.string().nullable(),
  destination: z.string(),
  state: z.enum([
    'queued',
    'running',
    'ready',
    'failed',
    'cancelled',
    'interrupted',
    'stale',
    'removed',
  ]),
  phase: z.string(),
  bytes_done: z.number(),
  bytes_total: z.number().nullable(),
  created_at: z.number(),
  updated_at: z.number(),
  observed_at: z.number().optional(),
  error: z.string().nullable(),
  file_path: z.string().nullable().optional(),
  files: z.array(z.string()).optional(),
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
      hub_tags: z.array(z.string()).optional(),
      library: z.string().nullable().optional(),
      card_url: z.string().optional(),
      capability_tags: modelCapabilityTagsGeneratedSchema.optional(),
      model_facts: modelFactsGeneratedSchema.optional(),
    }),
  ),
});
export const modelSearchPageSchema = modelSearchSchema.extend({
  next_cursor: z.string().nullable(),
  scope: z.string(),
});
export const modelRegistryCardStatusSchema = z
  .enum(['complete', 'truncated', 'missing', 'access_required', 'unavailable', 'unknown'])
  .default('unknown');
export const modelRegistryDetailsSchema = z.object({
  repository: z.string(),
  metadata_repository: z.string(),
  revision: z.string(),
  capability_tags: modelCapabilityTagsGeneratedSchema,
  model_facts: modelFactsGeneratedSchema,
  context_window: z.number().nullable(),
  reasoning: z.object({ mechanism: z.string(), levels: z.array(z.string()) }).nullable(),
  native_tool_calling: z.boolean().nullable(),
  hub_tags: z.array(z.string()),
  card_url: z.string(),
  card_markdown: z.string(),
  // Older servers omit these; unknown completeness must never be upgraded to complete.
  card_repository: z.string().optional(),
  card_revision: z.string().optional(),
  card_status: modelRegistryCardStatusSchema,
  /** Characters included in card_markdown, not the upstream README's unknown full length. */
  card_chars: z.number().int().nonnegative().optional(),
});
export type RegistryModel = z.infer<typeof modelSearchSchema>['models'][number];
export type ModelRegistryDetails = z.infer<typeof modelRegistryDetailsSchema>;
export type ModelAcquisition = z.infer<typeof modelAcquisitionSchema>;
export type ModelDownloadInput = { repository: string; revision: string; destination: string };
