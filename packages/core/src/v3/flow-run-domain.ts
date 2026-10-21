import { z } from 'zod';
import { forwardCompatibleEnum } from './schema-utils.js';

/**
 * A flow run checkpointed under one task (`GET /v1/sessions/{sid}/tasks/{handle}/flow`).
 *
 * Flows are orchestration programs whose calls are ordinary tasks. The `plan`
 * flow publishes a view of its nodes (each with its own task handle once it
 * starts) and of the proposed nodes waiting for approval. A run that cannot
 * proceed ends on a typed outcome (a stall with its reason, step and message)
 * instead of a guess.
 */

const strings = z.array(z.string()).default([]);

export const planNodeStatusValues = [
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
  'repaired',
] as const;

export const planNodeSchema = z
  .object({
    id: z.string(),
    target: z.string().default(''),
    input: z.unknown().optional(),
    after: strings,
    description: z.string().nullish(),
    status: forwardCompatibleEnum(planNodeStatusValues).default('pending'),
    handle: z.string().nullish(),
    invocation: z.string().nullish(),
    task_status: z.string().nullish(),
  })
  .passthrough();

export type PlanNode = z.infer<typeof planNodeSchema>;

export const planProposalSchema = z
  .object({
    id: z.string(),
    target: z.string().default(''),
    after: strings,
    by: z.string().default(''),
    reason: z.string().default(''),
  })
  .passthrough();

export type PlanProposal = z.infer<typeof planProposalSchema>;

/** The live plan a `plan` flow publishes; other flows publish no view. */
export const planViewSchema = z
  .object({
    kind: z.literal('plan'),
    nodes: z.array(planNodeSchema).default([]),
    added: z.number().int().nonnegative().default(0),
    rounds: z.number().int().nonnegative().default(0),
    awaiting_approval: z.array(planProposalSchema).default([]),
    editors: strings,
    max_added: z.number().int().nonnegative().nullish(),
    max_rounds: z.number().int().nonnegative().nullish(),
    approve_edits: z.boolean().default(false),
  })
  .passthrough();

export type PlanView = z.infer<typeof planViewSchema>;

export const flowCallSchema = z.object({
  invocation: z.string(),
  kind: z.string().default(''),
  target: z.string().default(''),
  handle: z.string().default(''),
  status: z.string().default(''),
});

export type FlowCall = z.infer<typeof flowCallSchema>;

/** A typed outcome: why a run ended without a result (for example `flow_stall`). */
export const flowOutcomeSchema = z
  .object({
    reason: z.string().default(''),
    message: z.string().default(''),
    stall: z.string().nullish(),
    step: z.string().nullish(),
    predicate: z.string().nullish(),
    observed: z.unknown().optional(),
    handle: z.string().nullish(),
  })
  .passthrough();

export type FlowOutcome = z.infer<typeof flowOutcomeSchema>;

export const flowEventSchema = z
  .object({ event: z.string(), node: z.string().nullish() })
  .passthrough();

export type FlowEvent = z.infer<typeof flowEventSchema>;

export const flowRunSchema = z.object({
  run_id: z.string().default(''),
  flow: z.string(),
  status: z.string().default('running'),
  depth: z.number().int().nonnegative().default(0),
  root_handle: z.string().default(''),
  entries: z.number().int().nonnegative().default(0),
  view: z
    .unknown()
    .transform((value) => {
      const parsed = planViewSchema.safeParse(value);
      return parsed.success ? parsed.data : null;
    })
    .nullable(),
  calls: z.array(flowCallSchema).default([]),
  questions: z
    .array(z.object({ handle: z.string(), question: z.string().default('') }))
    .default([]),
  events: z.array(flowEventSchema).default([]),
  outcome: z
    .unknown()
    .transform((value) => {
      if (value === null || value === undefined) return null;
      const parsed = flowOutcomeSchema.safeParse(value);
      return parsed.success ? parsed.data : { reason: 'unknown', message: String(value) };
    })
    .nullable(),
  result: z.unknown().optional(),
});

export type FlowRun = z.infer<typeof flowRunSchema>;

/** A run is live until it completes or ends on a typed outcome. */
export function flowRunActive(run: Pick<FlowRun, 'status'>): boolean {
  return run.status === 'running';
}
