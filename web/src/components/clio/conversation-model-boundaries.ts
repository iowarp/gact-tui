import type { Message } from '@clio/core/v3';

type RecordedModel = NonNullable<Message['model']>;

export interface ConversationModelBoundary {
  model?: RecordedModel;
  previous?: RecordedModel;
}

/** Mark accepted model segments, without assigning current settings to old messages. */
export function conversationModelBoundaries(
  messages: readonly Message[],
): ReadonlyMap<string, ConversationModelBoundary> {
  const boundaries = new Map<string, ConversationModelBoundary>();
  let previous: RecordedModel | undefined;
  for (const message of messages) {
    // Resume envelopes and app responses are transport records, not new choices.
    if (
      message.role === 'system' ||
      message.role === 'unknown' ||
      message.metadata?.ask_user_resume ||
      message.metadata?.plan_exit_resume ||
      message.metadata?.mcp_app_response
    )
      continue;
    const model = message.model;
    // Assistant rows without a route belong to the accepted prompt's segment.
    if (message.role === 'assistant' && !model) continue;
    if (model?.provider_id === previous?.provider_id && model?.model_id === previous?.model_id)
      continue;
    boundaries.set(message.id, { model, previous });
    previous = model;
  }
  return boundaries;
}

/** Keep streamed row memoization stable when a neighboring turn updates. */
export function modelBoundariesEqual(
  left?: ConversationModelBoundary,
  right?: ConversationModelBoundary,
): boolean {
  return (
    Boolean(left) === Boolean(right) &&
    left?.model?.provider_id === right?.model?.provider_id &&
    left?.model?.model_id === right?.model?.model_id &&
    left?.previous?.provider_id === right?.previous?.provider_id &&
    left?.previous?.model_id === right?.previous?.model_id
  );
}
