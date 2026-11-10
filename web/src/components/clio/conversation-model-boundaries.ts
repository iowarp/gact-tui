import type { Message } from '@clio/core/v3';

type RecordedModel = NonNullable<Message['model']>;

export interface ConversationModelBoundary {
  model?: RecordedModel;
  previous?: RecordedModel;
  /** The conversation's first recorded model; each reply's footer already names it. */
  initial?: true;
}

/**
 * Mark accepted model segments, without assigning current settings to old
 * messages. Replies and prompts do not group across a segment; the reply
 * footer names each model, so the boundary itself draws nothing.
 */
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
    boundaries.set(
      message.id,
      boundaries.size ? { model, previous } : { model, previous, initial: true },
    );
    previous = model;
  }
  return boundaries;
}
