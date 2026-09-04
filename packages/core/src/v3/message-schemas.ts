import { z } from 'zod';
import { messageBlockGeneratedSchema } from '../generated/clio-schemas/message-block.schema.js';
import type { MessageBlock } from './domain.js';
import { contextReferenceKindSchema } from './composer-schemas.js';
import { forwardCompatibleEnum } from './schema-utils.js';

function omitGeneratedNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(omitGeneratedNulls);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, child]) => child !== null)
      .map(([key, child]) => [key, omitGeneratedNulls(child)]),
  );
}

function toMessageBlock(value: unknown): MessageBlock {
  return omitGeneratedNulls(value) as MessageBlock;
}

/**
 * Drops the additive top-level fields the pinned schema does not list, so a
 * known block from a newer backend still decodes as itself: SPEC 3.2 and 8.2
 * require clients to tolerate new optional fields, never to reject the part.
 *
 * Taken per schema rather than closed over one, because a strict object that
 * is not a member of the generated union needs exactly the same tolerance and
 * cannot borrow the union's: a discriminator the union does not carry fails
 * with `invalid_union_discriminator`, which names no additive keys at all.
 */
function omitAdditiveFields(schema: z.ZodTypeAny): (value: unknown) => unknown {
  return (value) => {
    if (typeof value !== 'object' || value === null) return value;
    const parsed = schema.safeParse(value);
    if (parsed.success) return value;
    const additive = new Set(
      parsed.error.issues.flatMap((issue) =>
        issue.code === z.ZodIssueCode.unrecognized_keys && issue.path.length === 0
          ? issue.keys
          : [],
      ),
    );
    if (additive.size === 0) return value;
    return Object.fromEntries(Object.entries(value).filter(([key]) => !additive.has(key)));
  };
}

/** Wraps a strict object so unknown top-level keys are dropped, not rejected. */
function additivelyTolerant<T extends z.AnyZodObject>(schema: T): z.ZodEffects<T, z.infer<T>> {
  return z.preprocess(omitAdditiveFields(schema), schema) as unknown as z.ZodEffects<T, z.infer<T>>;
}

const knownMessageBlockSchema = messageBlockGeneratedSchema.transform(toMessageBlock);
const additiveKnownMessageBlockSchema = z
  .preprocess(omitAdditiveFields(messageBlockGeneratedSchema), messageBlockGeneratedSchema)
  .transform(toMessageBlock);
// TODO(schema 0.2.4): `ResourceMessageBlock` belongs in clio-schemas beside the
// other block kinds, so `messageBlockGeneratedSchema` carries it and these two
// hand-written schemas can be deleted. The generated contract is the end state;
// this pair is the bridge until the block ships there.
const resourceDeliverySchema = additivelyTolerant(
  z
    .object({
      representation: z.enum([
        'native',
        'bounded_tools',
        'structured_document',
        'sandbox',
        'retrieval',
        'metadata_only',
      ]),
      evidence_source: z.string().optional(),
      reason: z.string().optional(),
    })
    .strict(),
);
const resourceMessageBlockSchema = additivelyTolerant(
  z
    .object({
      id: z.string(),
      type: z.literal('resource'),
      resource_id: z.string(),
      resource_revision: z.string(),
      workspace_id: z.string(),
      name: z.string(),
      media_type: z.string(),
      delivery: resourceDeliverySchema.optional(),
      agent_id: z.string().optional(),
      sequence: z.number().int().positive().optional(),
      stream_source: z.string().optional(),
      channel: z.string().optional(),
    })
    .strict(),
);
const contextReferenceMessageBlockSchema = additivelyTolerant(
  z
    .object({
      id: z.string(),
      type: z.literal('context_reference'),
      ref_kind: contextReferenceKindSchema,
      ref_id: z.string(),
      label: z.string(),
      revision: z.string(),
      media_type: z.string(),
      navigation: z.record(z.string(), z.unknown()).default({}),
      agent_id: z.string().optional(),
      sequence: z.number().int().positive().optional(),
      stream_source: z.string().optional(),
      channel: z.string().optional(),
    })
    .strict(),
);
const unknownMessageBlockSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    agent_id: z.string().optional(),
    sequence: z.number().int().positive().optional(),
    stream_source: z.string().optional(),
    channel: z.string().optional(),
  })
  .passthrough()
  .transform((value) => ({
    id: value.id,
    type: 'unknown' as const,
    original_type: value.type,
    raw: value,
    ...(value.agent_id ? { agent_id: value.agent_id } : {}),
    ...(value.channel ? { channel: value.channel } : {}),
    ...(value.sequence ? { sequence: value.sequence } : {}),
    ...(value.stream_source ? { stream_source: value.stream_source } : {}),
  }));

/**
 * Decodes a block strictly, then tolerantly, then degrades it: a block this
 * version cannot read is contained as a typed `unknown` block carrying its
 * original type and payload, never raised into a failure of its message.
 */
export const messageBlockSchema = z.union([
  resourceMessageBlockSchema,
  contextReferenceMessageBlockSchema,
  knownMessageBlockSchema,
  additiveKnownMessageBlockSchema,
  unknownMessageBlockSchema,
]);

export const messageUsageSchema = z.object({
  input: z.number().int().nonnegative(),
  output: z.number().int().nonnegative(),
  cache_read: z.number().int().nonnegative(),
  cache_write: z.number().int().nonnegative(),
});

export const messageCompletionSchema = z.object({
  message_id: z.string(),
  completed_at: z.string().optional(),
  stop_reason: z.string().optional(),
  tokens: messageUsageSchema.optional(),
  cost_usd: z
    .number()
    .nonnegative()
    .nullish()
    .transform((value) => value ?? undefined),
  error_info: z.record(z.string(), z.unknown()).optional(),
});

export const messageSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  run_id: z.string().optional(),
  role: forwardCompatibleEnum(['user', 'assistant', 'system']),
  created_at: z.string(),
  completed_at: z.string().optional(),
  blocks: z.array(messageBlockSchema),
  usage: messageUsageSchema.optional(),
  cost_usd: z.number().nonnegative().optional(),
  stop_reason: z.string().optional(),
  error_info: z.record(z.string(), z.unknown()).optional(),
});
