import { z } from 'zod';
import { forwardCompatibleEnum } from './schema-utils.js';

export const pendingInteractionSchema = z.object({
  id: z.string(),
  kind: forwardCompatibleEnum(['question', 'permission', 'a2ui', 'mcp_task_input']),
  owner_session_id: z.string(),
  attended_session_id: z.string(),
  task_id: z.string().optional(),
  status: forwardCompatibleEnum(['pending', 'answered', 'cancelled', 'expired']),
  title: z.string(),
  prompt: z.string().optional(),
  source: z.object({
    protocol: forwardCompatibleEnum(['native', 'mcp']),
    tool_name: z.string().optional(),
    invocation_id: z.string().optional(),
    surface_id: z.string().optional(),
  }),
  created_at: z.string(),
  payload: z
    .object({
      question_id: z.string().optional(),
      question_kind: forwardCompatibleEnum(['freeform', 'choice', 'confirmation']).optional(),
      options: z
        .array(
          z.object({
            label: z.string(),
            value: z.string().default(''),
            description: z.string().optional(),
          }),
        )
        .optional(),
      allow_freeform: z.boolean().optional(),
      expires_at: z.string().optional(),
      input_key: z.string().optional(),
      permission_id: z.string().optional(),
      tool_call: z
        .object({
          tool_name: z.string().optional(),
          input: z.unknown().optional(),
        })
        .optional(),
      revision: z.number().int().nonnegative().optional(),
      server_id: z.string().optional(),
      awaiting_question: z.boolean().optional(),
    })
    .passthrough()
    .optional(),
  actions: z.array(z.string()).optional(),
});

/**
 * A pending-interaction record this client cannot fully decode is contained
 * per item — mirroring the transcript path's unknown-block pattern
 * (message-schemas.ts) — rather than one malformed row failing the whole
 * interactions array. Still surfaced as `pending`: an interaction the reader
 * cannot see is one they were never told is blocking their agent.
 */
const unknownPendingInteractionSchema = z
  .object({
    id: z.string(),
    owner_session_id: z.string().optional(),
    attended_session_id: z.string().optional(),
    created_at: z.string().optional(),
  })
  .passthrough()
  .transform((value) => ({
    id: value.id,
    kind: 'unknown' as const,
    owner_session_id: value.owner_session_id ?? value.id,
    attended_session_id: value.attended_session_id ?? value.owner_session_id ?? value.id,
    status: 'pending' as const,
    title: 'This response could not be read.',
    source: { protocol: 'unknown' as const },
    created_at: value.created_at ?? new Date(0).toISOString(),
    actions: [],
  }));

/** Decodes a pending interaction strictly, then degrades a row this version cannot read. */
export const pendingInteractionOrDegradedSchema = z.union([
  pendingInteractionSchema,
  unknownPendingInteractionSchema,
]);
