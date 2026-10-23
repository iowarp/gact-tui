import { z } from 'zod';
import { forwardCompatibleEnum } from './schema-utils.js';

/**
 * A flow run checkpointed under one task (`GET /v1/sessions/{sid}/tasks/{handle}/flow`).
 *
 * Flows are orchestration programs whose calls are ordinary tasks. The `workflow`
 * flow publishes a view of its steps (each with its own task handle once it
 * starts) and of the proposed steps waiting for approval. A run that cannot
 * proceed ends on a typed outcome (a stall with its reason, step and message)
 * instead of a guess.
 */

const strings = z.array(z.string()).default([]);

export const workflowStepStatusValues = [
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
  'repaired',
] as const;

export const workflowStepSchema = z
  .object({
    id: z.string(),
    target: z.string().default(''),
    input: z.unknown().optional(),
    after: strings,
    description: z.string().nullish(),
    status: forwardCompatibleEnum(workflowStepStatusValues).default('pending'),
    handle: z.string().nullish(),
    invocation: z.string().nullish(),
    task_status: z.string().nullish(),
  })
  .passthrough();

export type WorkflowStep = z.infer<typeof workflowStepSchema>;

export const workflowProposalSchema = z
  .object({
    id: z.string(),
    target: z.string().default(''),
    after: strings,
    by: z.string().default(''),
    reason: z.string().default(''),
  })
  .passthrough();

export type WorkflowProposal = z.infer<typeof workflowProposalSchema>;

/** The live workflow a `workflow` flow publishes; other flows publish no view. */
export const workflowViewSchema = z
  .object({
    kind: z.literal('workflow'),
    steps: z.array(workflowStepSchema).default([]),
    added: z.number().int().nonnegative().default(0),
    rounds: z.number().int().nonnegative().default(0),
    awaiting_approval: z.array(workflowProposalSchema).default([]),
    editors: strings,
    max_added_steps: z.number().int().nonnegative().nullish(),
    max_edit_rounds: z.number().int().nonnegative().nullish(),
    approve_edits: z.boolean().default(false),
  })
  .passthrough();

export type WorkflowView = z.infer<typeof workflowViewSchema>;

export const flowCallSchema = z.object({
  invocation: z.string(),
  kind: z.string().default(''),
  target: z.string().default(''),
  handle: z.string().default(''),
  status: z.string().default(''),
  /** Calls started together (one gather) share the first one's invocation; empty alone. */
  together: z.string().default(''),
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
  .object({ event: z.string(), step: z.string().nullish() })
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
      const parsed = workflowViewSchema.safeParse(value);
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
  /** Which models the run used, with token shares, account windows and each call's model. */
  usage: z
    .object({
      models: z
        .array(
          z.object({
            model: z.string(),
            tokens: z.number(),
            share: z.number(),
            cost_usd: z.number(),
          }),
        )
        .default([]),
      windows: z
        .array(
          z.object({
            account: z.string(),
            label: z.string().default(''),
            window: z.string(),
            used_percent: z.number(),
          }),
        )
        .default([]),
      calls: z
        .record(
          z.string(),
          z.object({
            model: z.string().default(''),
            choice: z
              .object({
                asked: z.string().default(''),
                source: z.string().default(''),
                reasons: z.array(z.string()).default([]),
              })
              .passthrough()
              .nullable()
              .default(null),
          }),
        )
        .default({}),
    })
    .optional(),
});

export type FlowRun = z.infer<typeof flowRunSchema>;
export type FlowRunUsage = NonNullable<FlowRun['usage']>;

/** A run is live until it completes or ends on a typed outcome. */
export function flowRunActive(run: Pick<FlowRun, 'status'>): boolean {
  return run.status === 'running';
}
