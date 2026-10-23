import { z } from 'zod';
import { McpRepository } from './mcp-repository.js';

const accountUsageWindowSchema = z.object({
  name: z.string(),
  used_percent: z.number(),
  resets_at: z.string().default(''),
  window_minutes: z.number().int().nullable().default(null),
});

const usageBalanceSchema = z.object({
  remaining: z.number().nullable(),
  limit: z.number().nullable().default(null),
  used: z.number().nullable().default(null),
  currency: z.string().default('USD'),
});

const accountUsageSchema = z.object({
  account: z.string(),
  state: z.enum(['metered', 'unmetered']),
  observed_at: z.string(),
  source: z.string(),
  windows: z.array(accountUsageWindowSchema).default([]),
  balance: usageBalanceSchema.nullable().default(null),
  status: z.string().default(''),
  read_failure: z.string().default(''),
  read_failed_at: z.string().default(''),
});

const spendSchema = z.object({
  tokens_input: z.number(),
  tokens_cached: z.number(),
  tokens_output: z.number(),
  tokens: z.number(),
  cost_usd: z.number(),
  turns_without_cost: z.number(),
  turns: z.number(),
});

const fleetAccountSchema = z.object({
  id: z.string(),
  label: z.string(),
  provider_kind: z.string(),
  billing: z.enum(['subscription', 'credit', 'metered', 'free']),
  health: z.string(),
  failure: z.string().default(''),
  endpoint: z.string().default(''),
  usage: accountUsageSchema.nullable(),
  usage_missing_reason: z.string().default(''),
  spend: spendSchema.nullable(),
  delegation_allowed: z.boolean(),
});

const priceSchema = z
  .object({ kind: z.string(), per_1m: z.number().nullable() })
  .nullable()
  .optional();

const fleetEntrySchema = z.object({
  account: z.string(),
  model: z.string(),
  ref: z.string(),
  aliases: z.array(z.string()).default([]),
  tool_calling: z.boolean().nullable(),
  vision: z.boolean().nullable(),
  context_tokens: z.number().nullable(),
  output_tokens: z.number().nullable(),
  effort_levels: z.array(z.string()).default([]),
  price: z.object({ input: priceSchema, output: priceSchema }).partial().default({}),
  price_source: z.string().default(''),
  available: z.boolean(),
  unavailable_reason: z.string().default(''),
  fit: z
    .object({
      meets: z.boolean(),
      unmet: z.array(z.string()),
      unverified: z.array(z.string()),
    })
    .nullable()
    .optional(),
});

const fleetSchema = z.object({
  observed_at: z.string(),
  accounts: z.array(fleetAccountSchema),
  entries: z.array(fleetEntrySchema),
  spend_by_model: z.record(z.string(), spendSchema).default({}),
  /** Older conversations counted under the model they were set to (no per-model rollup). */
  estimated_sessions: z.number().int().default(0),
  requires: z.record(z.string(), z.unknown()).optional(),
  /** With `sessionId`: the account it runs on and what it and its children spent. */
  session: z
    .object({
      id: z.string(),
      model: z.object({ provider_id: z.string(), model_id: z.string() }),
      spend_by_model: z.record(z.string(), spendSchema).default({}),
    })
    .optional(),
});

export type AccountUsageWindow = z.infer<typeof accountUsageWindowSchema>;
export type AccountUsage = z.infer<typeof accountUsageSchema>;
export type FleetSpend = z.infer<typeof spendSchema>;
/** One connected account: its billing, health, usage windows, balance and spend. */
export type FleetAccount = z.infer<typeof fleetAccountSchema>;
/** One model an account serves, with the facts model selection checks. */
export type FleetEntry = z.infer<typeof fleetEntrySchema>;
export type Fleet = z.infer<typeof fleetSchema>;

/** The fleet: connected accounts, their usage and spend, and the models they serve. */
export class FleetRepository extends McpRepository {
  /** `sessionId` marks each entry with whether it meets that conversation agent's needs. */
  public fleet(
    options: { refresh?: boolean; sessionId?: string } = {},
    signal?: AbortSignal,
  ): Promise<Fleet> {
    const query = new URLSearchParams();
    if (options.refresh) query.set('refresh', 'true');
    if (options.sessionId) query.set('session', options.sessionId);
    const suffix = query.size ? `?${query.toString()}` : '';
    return this.transport.request({
      method: 'GET',
      path: `/v1/fleet${suffix}`,
      decode: (value) => fleetSchema.parse(value),
      signal,
    });
  }

  /** Whether Clio may run delegated work on `account` without asking. */
  public setDelegationAllowed(
    account: string,
    allowed: boolean,
    signal?: AbortSignal,
  ): Promise<{ account: string; delegation_allowed: boolean }> {
    return this.transport.request({
      method: 'PATCH',
      path: `/v1/fleet/accounts/${encodeURIComponent(account)}`,
      body: { delegation_allowed: allowed },
      decode: (value) =>
        z.object({ account: z.string(), delegation_allowed: z.boolean() }).parse(value),
      signal,
    });
  }
}
