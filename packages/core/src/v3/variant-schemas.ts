import { z } from 'zod';
import { forwardCompatibleEnum, optionalWireString } from './schema-utils.js';
import type { VariantStepPart } from './variant-domain.js';

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

/** A pick question's metadata (its interaction's `payload.metadata`): `metadata.variant`. */
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

/** A live `semantic.event` payload: only the fields a try's activity reads. */
export const variantSemanticEventSchema = z.object({
  event_type: z.string(),
  status: z.string().default(''),
  summary: z.string().default(''),
  occurred_at: optionalWireString(),
  payload: z.record(z.string(), z.unknown()).default({}),
});

const textPartSchema = z.object({ type: z.enum(['text', 'thinking']), text: z.string() });
const toolCallPartSchema = z.object({
  type: z.literal('tool_call'),
  id: z.string(),
  name: z.string(),
  input: z.record(z.string(), z.unknown()).default({}),
});
const mediaPartSchema = z.object({
  type: z.enum(['image', 'document']),
  media_type: z.string().default(''),
});
const unknownPartSchema = z
  .object({ type: z.string() })
  .passthrough()
  .transform((value) => ({ type: 'unknown' as const, original_type: value.type }));

/** A recorded step part; a kind this version cannot read is kept as typed `unknown`. */
export const variantStepPartSchema: z.ZodType<VariantStepPart, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.union([
    textPartSchema,
    toolCallPartSchema,
    z.object({
      type: z.literal('tool_result'),
      id: z.string(),
      name: z.string().default(''),
      is_error: z.boolean().default(false),
      content: z.array(variantStepPartSchema).default([]),
    }),
    mediaPartSchema,
    unknownPartSchema,
  ]),
);

const optionalIndex = z
  .number()
  .int()
  .nonnegative()
  .nullish()
  .transform((value) => value ?? undefined);

/** A record's optional text: the server writes `""` (or null) for "none". */
const optionalText = z
  .string()
  .nullish()
  .transform((value) => value || undefined);

/** One try of a served run record (`clio.variant_run.v1`). */
export const variantTryRecordSchema = z.object({
  try_index: z.number().int().nonnegative(),
  scope: z.string().default(''),
  state: forwardCompatibleEnum(['running', 'completed', 'failed']),
  text: z
    .string()
    .nullish()
    .transform((value) => value ?? ''),
  score: nullableNumber,
  tokens: variantTryTokensSchema.nullish().transform((value) => value ?? undefined),
  advice: optionalText,
  forked_from: optionalIndex,
  error: optionalText,
  turn_id: optionalText,
  anchor_message_id: optionalText,
  steps: z
    .array(z.object({ role: z.string(), parts: z.array(variantStepPartSchema).default([]) }))
    .default([]),
});

/** A run as `GET /v1/sessions/{id}/variant-runs` serves it from clio-core. */
export const variantRunRecordSchema = z.object({
  schema: z.literal('clio.variant_run.v1'),
  variants_id: z.string().min(1),
  session_id: z.string(),
  agent_id: z.string().default(''),
  origin: forwardCompatibleEnum(['draft_alternatives', 'module_variant']),
  strategy: forwardCompatibleEnum(['best_of_n', 'refine']),
  judge: forwardCompatibleEnum(['lm', 'user']),
  n: z.number().int().nonnegative(),
  rubric: optionalText,
  status: forwardCompatibleEnum(['running', 'awaiting_pick', 'answered', 'selected', 'failed']),
  turn_id: optionalText,
  anchor_message_id: optionalText,
  pick: optionalIndex,
  comment: optionalText,
  selected_index: optionalIndex,
  tries: z.array(variantTryRecordSchema).default([]),
});

export const variantRunListSchema = z.object({
  session_id: z.string(),
  runs: z.array(variantRunRecordSchema),
});

export type VariantTryUpsert = z.infer<typeof variantTryUpsertSchema>;
export type VariantTryDelta = z.infer<typeof variantTryDeltaSchema>;
export type VariantSelected = z.infer<typeof variantSelectedSchema>;
export type VariantSemanticEvent = z.infer<typeof variantSemanticEventSchema>;
export type VariantRunRecord = z.infer<typeof variantRunRecordSchema>;
