import { z } from 'zod';

/**
 * The plugins and connectors the agent may offer (`GET /v1/plugins/offer-list`,
 * clio-agent OL-D1): every candidate for a new conversation with the person's default
 * agent, in the order the agent reads them, with whether it is in the default list
 * (`default_listed`, the first `cap`) and in the list the agent is told about (`listed`).
 * `key` names an entry in `include` / `exclude`; it is an identifier, never copy.
 */
export const offerListEntrySchema = z.object({
  key: z.string(),
  kind: z.enum(['connector', 'plugin']),
  id: z.string(),
  name: z.string(),
  summary: z
    .string()
    .nullish()
    .transform((value) => value ?? ''),
  marketplace: z.string().optional(),
  enabled: z.boolean().optional(),
  logo_url: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
  logo_dark_url: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
  default_listed: z.boolean(),
  listed: z.boolean(),
});
export type OfferListEntry = z.infer<typeof offerListEntrySchema>;

export const offerListSchema = z.object({
  cap: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  listed_count: z.number().int().nonnegative(),
  customized: z.boolean(),
  include: z.array(z.string()).default([]),
  exclude: z.array(z.string()).default([]),
  entries: z.array(offerListEntrySchema),
});
export type OfferList = z.infer<typeof offerListSchema>;

/** The person's ticks over the default list. */
export interface OfferListChoice {
  include: string[];
  exclude: string[];
}

/** The overlay that makes `listed` the effective list over the default one. */
export function offerListChoice(entries: readonly OfferListEntry[], listed: ReadonlySet<string>) {
  return {
    include: entries.filter((e) => !e.default_listed && listed.has(e.key)).map((e) => e.key),
    exclude: entries.filter((e) => e.default_listed && !listed.has(e.key)).map((e) => e.key),
  } satisfies OfferListChoice;
}
