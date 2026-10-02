import { z } from 'zod';
import type { PendingCompaction } from './compaction-domain.js';
import type { EntityState, Message } from './domain.js';

const compactionTriggerSchema = z.enum(['auto', 'manual']);

const compactionEventFields = {
  session_id: z.string().min(1),
  compaction_id: z.string().min(1),
  scope: z.string(),
  trigger: compactionTriggerSchema,
  turn_id: z.string(),
};

/** `compaction.started`: a compaction began; `turn_id` is `""` between turns. */
export const compactionStartedSchema = z.object(compactionEventFields);

/** `compaction.completed`: the summary is the `part_id` block of `message_id`. */
export const compactionCompletedSchema = z.object({
  ...compactionEventFields,
  message_id: z.string().min(1),
  part_id: z.string().min(1),
  replaced_count: z.number().int().nonnegative(),
});

/**
 * `compaction.failed`: no summary was produced; `error` is the typed reason and
 * `part_id` the transcript notice recording it (`""` when it could not be
 * recorded, code `compaction_failure_unrecorded`).
 */
export const compactionFailedSchema = z.object({
  ...compactionEventFields,
  part_id: z.string().default(''),
  error: z.object({ code: z.string().min(1), message: z.string() }),
});

type CompactionEvent = z.infer<typeof compactionStartedSchema>;

function sessionMessagesInOrder(state: EntityState, sessionId: string): Message[] {
  return Object.values(state.messages)
    .filter((message) => message.session_id === sessionId)
    .sort((left, right) => left.created_at.localeCompare(right.created_at));
}

/**
 * Where the row sits: after the open turn's assistant message when the
 * compaction ran inside a turn, otherwise after the session's last message.
 */
function anchorMessageId(state: EntityState, event: CompactionEvent): string | undefined {
  const messages = sessionMessagesInOrder(state, event.session_id);
  if (event.turn_id) {
    const turnMessages = messages.filter((message) => message.turn_id === event.turn_id);
    const assistants = turnMessages.filter((message) => message.role === 'assistant');
    const anchor = assistants.at(-1) ?? turnMessages.at(-1);
    if (anchor) return anchor.id;
  }
  return messages.at(-1)?.id;
}

function summaryResident(state: EntityState, messageId: string, partId: string): boolean {
  return state.messages[messageId]?.blocks.some((block) => block.id === partId) ?? false;
}

/** The compaction ids and block ids a message records outcomes for. */
function recordedOutcomes(message: Message): { compactionIds: Set<string>; blockIds: Set<string> } {
  const compactionIds = new Set<string>();
  for (const block of message.blocks) {
    if (
      ((block.type === 'injection' && block.source === 'summarization') ||
        (block.type === 'notice' && block.source === 'compaction_failed')) &&
      block.compaction_id
    ) {
      compactionIds.add(block.compaction_id);
    }
  }
  return { compactionIds, blockIds: new Set(message.blocks.map((block) => block.id)) };
}

function outcomeRecorded(state: EntityState, compactionId: string, partId: string): boolean {
  return Object.values(state.messages).some((message) => {
    const recorded = recordedOutcomes(message);
    return (
      recorded.compactionIds.has(compactionId) || (partId !== '' && recorded.blockIds.has(partId))
    );
  });
}

function pendingFromEvent(
  state: EntityState,
  event: CompactionEvent,
  occurredAt: string,
): PendingCompaction {
  const previous = state.compactions[event.compaction_id];
  return {
    compaction_id: event.compaction_id,
    session_id: event.session_id,
    scope: event.scope,
    trigger: event.trigger,
    turn_id: event.turn_id,
    anchor_message_id: previous ? previous.anchor_message_id : anchorMessageId(state, event),
    status: 'running',
    started_at: previous?.started_at ?? occurredAt,
  };
}

function withoutCompaction(
  compactions: EntityState['compactions'],
  compactionId: string,
): EntityState['compactions'] {
  if (!(compactionId in compactions)) return compactions;
  const { [compactionId]: _removed, ...rest } = compactions;
  return rest;
}

/** Reduces `compaction.started` into a running row positioned where it began. */
export function reduceCompactionStarted(
  state: EntityState,
  payload: unknown,
  occurredAt: string,
): EntityState['compactions'] {
  const event = compactionStartedSchema.parse(payload);
  const previous = state.compactions[event.compaction_id];
  // A redelivered start must not resurrect a compaction that already ended,
  // whether its outcome is still a live row or already in the transcript.
  if (previous && previous.status !== 'running') return state.compactions;
  if (!previous && outcomeRecorded(state, event.compaction_id, '')) return state.compactions;
  return {
    ...state.compactions,
    [event.compaction_id]: pendingFromEvent(state, event, occurredAt),
  };
}

/**
 * Reduces `compaction.completed`: the row is cleared as soon as the summary
 * block is in its message (it then renders from the transcript); until then it
 * keeps its place as `completing`.
 */
export function reduceCompactionCompleted(
  state: EntityState,
  payload: unknown,
  occurredAt: string,
): EntityState['compactions'] {
  const event = compactionCompletedSchema.parse(payload);
  if (summaryResident(state, event.message_id, event.part_id)) {
    return withoutCompaction(state.compactions, event.compaction_id);
  }
  return {
    ...state.compactions,
    [event.compaction_id]: {
      ...pendingFromEvent(state, event, occurredAt),
      status: 'completing',
      message_id: event.message_id,
      part_id: event.part_id,
    },
  };
}

/**
 * Reduces `compaction.failed`. The transcript's failure notice is the durable
 * record (live == reload), so the row is cleared once that notice is resident;
 * until then, or when the service could not record it, the row shows the typed
 * error at the same position.
 */
export function reduceCompactionFailed(
  state: EntityState,
  payload: unknown,
  occurredAt: string,
): EntityState['compactions'] {
  const event = compactionFailedSchema.parse(payload);
  if (outcomeRecorded(state, event.compaction_id, event.part_id)) {
    return withoutCompaction(state.compactions, event.compaction_id);
  }
  return {
    ...state.compactions,
    [event.compaction_id]: {
      ...pendingFromEvent(state, event, occurredAt),
      status: 'failed',
      ...(event.part_id ? { part_id: event.part_id } : {}),
      error: event.error,
    },
  };
}

/**
 * Drops every live compaction whose outcome this message now records -- its
 * summary or its failure notice -- matched by the outcome's `part_id` or by the
 * block's own `compaction_id`. Returns the same object when nothing settled.
 */
export function settleCompactions(
  compactions: EntityState['compactions'],
  message: Message,
): EntityState['compactions'] {
  const { compactionIds, blockIds } = recordedOutcomes(message);
  const settled = Object.values(compactions).filter(
    (compaction) =>
      compactionIds.has(compaction.compaction_id) ||
      (compaction.part_id !== undefined &&
        (compaction.message_id === undefined || compaction.message_id === message.id) &&
        blockIds.has(compaction.part_id)),
  );
  if (settled.length === 0) return compactions;
  return settled.reduce(
    (remaining, compaction) => withoutCompaction(remaining, compaction.compaction_id),
    compactions,
  );
}
