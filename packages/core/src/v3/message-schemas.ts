import { z } from 'zod';
import { messageBlockGeneratedSchema } from '../generated/clio-schemas/message-block.schema.js';
import type { MessageBlock } from './domain.js';
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
 * Drops the additive top-level fields the pinned block schema does not list, so a
 * known block from a newer backend still decodes as itself: SPEC 3.2 and 8.2
 * require clients to tolerate new optional fields, never to reject the part.
 */
function omitAdditiveFields(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;
  const parsed = messageBlockGeneratedSchema.safeParse(value);
  if (parsed.success) return value;
  const additive = new Set(
    parsed.error.issues.flatMap((issue) =>
      issue.code === z.ZodIssueCode.unrecognized_keys && issue.path.length === 0 ? issue.keys : [],
    ),
  );
  if (additive.size === 0) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !additive.has(key)));
}

const knownMessageBlockSchema = messageBlockGeneratedSchema.transform(toMessageBlock);
const additiveKnownMessageBlockSchema = z
  .preprocess(omitAdditiveFields, messageBlockGeneratedSchema)
  .transform(toMessageBlock);

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
