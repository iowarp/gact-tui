import { z } from 'zod';

/**
 * A saved local or self-hosted model server (`/v1/providers/servers`): a
 * catalog runtime at the address the person gave it (`id === preset_id`), or
 * a custom OpenAI-compatible server (`custom: true`, reached through the
 * `vllm` preset). `check` is the latest live reachability check, when one ran
 * in this service's lifetime.
 */
export const savedServerCheckSchema = z.object({
  reachable: z.boolean(),
  connectivity: z.string(),
  models: z.array(z.string()).default([]),
  error: z.string().default(''),
  checked_at: z.string(),
});

export const savedServerSchema = z.object({
  id: z.string(),
  preset_id: z.string(),
  label: z.string(),
  address: z.string(),
  custom: z.boolean(),
  check: savedServerCheckSchema
    .nullish()
    .transform((value) => value ?? undefined),
});

export const savedServerListSchema = z.object({ servers: z.array(savedServerSchema) });

export type SavedServerCheck = z.infer<typeof savedServerCheckSchema>;
export type SavedServer = z.infer<typeof savedServerSchema>;
