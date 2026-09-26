import { z } from 'zod';

/**
 * Which CLI binary a provider's SDK transport runs (`client` on a Codex or
 * Claude Code catalog entry and on the components status): the user's
 * installed CLI or the one the SDK bundles, with the version it reports and
 * the service's typed reason for the choice. `source` is `null` only when no
 * CLI exists at all.
 */
export const providerClientFactSchema = z.object({
  source: z.enum(['installed', 'bundled']).nullable(),
  version: z.string().catch(''),
  path: z.string().catch(''),
  reason: z.string().catch(''),
  installed_version: z.string().catch(''),
  bundled_version: z.string().catch(''),
});
export type ProviderClientFact = z.infer<typeof providerClientFactSchema>;

/** The typed stages of an in-place provider component update. */
export const providerComponentUpdateStages = [
  'checking',
  'downloading',
  'installing',
  'verifying',
  'done',
  'failed',
] as const;
export type ProviderComponentUpdateStage = (typeof providerComponentUpdateStages)[number];

const typedErrorSchema = z
  .object({ code: z.string(), message: z.string().catch('') })
  .nullish()
  .transform((value) => value ?? undefined);

/** One update job (`POST`/`GET /v1/providers/{id}/components/update`). */
export const providerComponentUpdateSchema = z.object({
  provider_kind: z.string(),
  stage: z.enum(providerComponentUpdateStages),
  running: z.boolean(),
  from_versions: z.record(z.string(), z.string()).default({}),
  to_versions: z.record(z.string(), z.string()).default({}),
  changed: z.boolean().default(false),
  rolled_back: z.boolean().default(false),
  restart_required: z.boolean().default(false),
  error: typedErrorSchema,
  started_at: z.string().catch(''),
  finished_at: z.string().catch(''),
});
export type ProviderComponentUpdate = z.infer<typeof providerComponentUpdateSchema>;

/**
 * `GET /v1/providers/{id}/components`: the provider's SDK components, the
 * newest release installable on the connected computer, whether an update is
 * available, the CLI in use and the last update job.
 */
export const providerComponentsSchema = z.object({
  provider_id: z.string(),
  provider_kind: z.string(),
  installed: z.boolean(),
  update_available: z.boolean(),
  target_version: z.string().catch(''),
  release_notes_url: z.string().catch(''),
  checked_at: z.string().catch(''),
  components: z
    .array(
      z.object({
        distribution: z.string(),
        installed_version: z.string().catch(''),
        latest_version: z.string().catch(''),
        update_available: z.boolean(),
      }),
    )
    .default([]),
  error: typedErrorSchema,
  client: providerClientFactSchema.nullish().transform((value) => value ?? undefined),
  update: providerComponentUpdateSchema.nullish().transform((value) => value ?? undefined),
});
export type ProviderComponents = z.infer<typeof providerComponentsSchema>;
