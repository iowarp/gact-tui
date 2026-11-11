import { z } from 'zod';

/** A provider support install's lifecycle (`queued` waits for another provider's install). */
export const providerInstallStates = ['queued', 'installing', 'done', 'failed'] as const;
export type ProviderInstallState = (typeof providerInstallStates)[number];

/**
 * One provider support install job (`POST /v1/providers/{id}/install?wait=false`,
 * `GET /v1/providers/{id}/install`). It runs on the connected agent and
 * outlives the request and the view that started it.
 */
export const providerInstallJobSchema = z.object({
  provider_id: z.string(),
  provider_kind: z.string().catch(''),
  state: z.enum(providerInstallStates),
  running: z.boolean(),
  installed: z.boolean().catch(false),
  instructions: z.string().catch(''),
  error: z
    .object({
      code: z.string(),
      message: z.string().catch(''),
      diagnostic: z.string().catch(''),
    })
    .nullish()
    .transform((value) => value ?? undefined),
  started_at: z.string().catch(''),
  finished_at: z.string().catch(''),
});
export type ProviderInstallJob = z.infer<typeof providerInstallJobSchema>;

/** `GET /v1/providers/support/installs`: every provider's latest install job. */
export const providerInstallJobListSchema = z.object({
  running: z.boolean(),
  installs: z.array(providerInstallJobSchema),
});
export type ProviderInstallJobList = z.infer<typeof providerInstallJobListSchema>;

/**
 * The answer of an agent that predates install jobs (a blocking 200
 * `{provider_id, installed, instructions}`), read as the finished job it is.
 */
export function providerInstallJobFromResponse(value: unknown): ProviderInstallJob {
  const job = providerInstallJobSchema.safeParse(value);
  if (job.success) return job.data;
  const legacy = z
    .object({ provider_id: z.string(), installed: z.boolean(), instructions: z.string() })
    .parse(value);
  return {
    ...legacy,
    provider_kind: '',
    state: 'done',
    running: false,
    error: undefined,
    started_at: '',
    finished_at: '',
  };
}
