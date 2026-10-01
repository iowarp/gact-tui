import { z } from 'zod';
import { forwardCompatibleEnum, optionalWireString } from './schema-utils.js';

/** The run-level fields every variant frame repeats. */
const variantRunFields = {
  variants_id: z.string().min(1),
  session_id: z.string(),
  run_id: optionalWireString(),
  agent_id: z.string().default(''),
  origin: forwardCompatibleEnum(['draft_alternatives', 'module_variant']).default('unknown'),
  strategy: forwardCompatibleEnum(['best_of_n', 'refine']).default('unknown'),
  judge: forwardCompatibleEnum(['lm', 'user']).default('unknown'),
  n: z.number().int().nonnegative().default(0),
};

const nullableNumber = z
  .number()
  .nullish()
  .transform((value) => value ?? undefined);

export const variantTryTokensSchema = z.object({
  input: z.number().int().nonnegative().default(0),
  output: z.number().int().nonnegative().default(0),
  total: z.number().int().nonnegative().default(0),
});

/** `variant.try.upserted` (entity `<variants_id>:<try_index>`): a try started, ended, failed, or was scored. */
export const variantTryUpsertSchema = z.object({
  id: z.string(),
  ...variantRunFields,
  try_index: z.number().int().nonnegative(),
  scope: z.string().default(''),
  state: forwardCompatibleEnum(['running', 'completed', 'failed']),
  text: optionalWireString(),
  tokens: variantTryTokensSchema.nullish().transform((value) => value ?? undefined),
  score: nullableNumber,
  error: optionalWireString(),
  forked_from: z
    .number()
    .int()
    .nonnegative()
    .nullish()
    .transform((value) => value ?? undefined),
  advice: optionalWireString(),
});

/** `variant.try.delta` (same entity): the try's live text or thinking. */
export const variantTryDeltaSchema = z.object({
  id: z.string(),
  variants_id: z.string().min(1),
  try_index: z.number().int().nonnegative(),
  kind: forwardCompatibleEnum(['text', 'thinking']).default('text'),
  delta: z.string(),
});

/** `variant.selected` (entity `<variants_id>`): the scores or the user's pick, and the selected try. */
export const variantSelectedSchema = z.object({
  ...variantRunFields,
  selected_index: z.number().int().nonnegative(),
  selected_scope: z.string().default(''),
  text: z.string().default(''),
  scores: z
    .array(z.object({ try_index: z.number().int().nonnegative(), score: nullableNumber }))
    .default([]),
  winning_score: nullableNumber,
  pick: z
    .number()
    .int()
    .nonnegative()
    .nullish()
    .transform((value) => value ?? undefined),
  comment: optionalWireString(),
});

/** `question.upserted` metadata of a pick question (`metadata.variant`). */
export const variantQuestionMetadataSchema = z.object({
  variants_id: z.string().min(1),
  tool_name: z.string().optional(),
  variant: z.object({
    strategy: forwardCompatibleEnum(['best_of_n', 'refine']).default('unknown'),
    judge: forwardCompatibleEnum(['lm', 'user']).default('user'),
    n: z.number().int().nonnegative().default(0),
    rubric: optionalWireString(),
    refinable: z.boolean().default(false),
    candidates: z
      .array(
        z.object({
          id: z.string(),
          try_index: z.number().int().nonnegative(),
          text: z.string().default(''),
        }),
      )
      .default([]),
  }),
});

/**
 * A semantic event row (live `semantic.event` payload, or one durable trace
 * event): only the fields a variant projection reads.
 */
export const variantSemanticEventSchema = z.object({
  event_type: z.string(),
  turn_id: optionalWireString(),
  session_id: optionalWireString(),
  status: z.string().default(''),
  summary: z.string().default(''),
  occurred_at: optionalWireString(),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export const variantTraceSchema = z.object({
  events: z.array(variantSemanticEventSchema).default([]),
});

export type VariantTryUpsert = z.infer<typeof variantTryUpsertSchema>;
export type VariantTryDelta = z.infer<typeof variantTryDeltaSchema>;
export type VariantSelected = z.infer<typeof variantSelectedSchema>;
export type VariantSemanticEvent = z.infer<typeof variantSemanticEventSchema>;
