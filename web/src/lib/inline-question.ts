import type { Message, PendingInteraction, PendingInteractionResponse } from '@clio/core/v3';

/** The inline question card's DOM id, keyed by the tool call that asked it. */
export function inlineQuestionDomId(invocationId: string): string {
  return `question-${encodeURIComponent(invocationId)}`;
}

/**
 * A question the agent asked with its own `ask_user` tool, anchored to that
 * tool call: it lives in the log at the tool call, not in the response tray.
 */
export function isToolAnchoredQuestion(interaction: PendingInteraction): boolean {
  return (
    interaction.kind === 'question' &&
    interaction.source.protocol === 'native' &&
    interaction.source.tool_name !== 'plan_exit' &&
    Boolean(interaction.source.invocation_id)
  );
}

/** Pending tool-anchored questions whose tool call is in the transcript, oldest first. */
export function pendingLogQuestions(
  interactions: readonly PendingInteraction[],
  anchoredInvocationIds: ReadonlySet<string>,
): PendingInteraction[] {
  return interactions
    .filter(
      (interaction) =>
        interaction.status === 'pending' &&
        isToolAnchoredQuestion(interaction) &&
        anchoredInvocationIds.has(interaction.source.invocation_id ?? ''),
    )
    .sort((left, right) => left.created_at.localeCompare(right.created_at));
}

/**
 * The transcript deep link (`#message-<id>/activity-<tool>`) to a question's
 * card, or `undefined` when no loaded message holds its tool call.
 */
export function questionLink(
  messages: readonly Message[],
  interaction: PendingInteraction,
): string | undefined {
  const toolId = interaction.source.invocation_id;
  if (!toolId) return undefined;
  const message = messages.find((candidate) =>
    candidate.blocks.some((block) => block.type === 'tool' && block.tool_id === toolId),
  );
  if (!message) return undefined;
  return `#message-${encodeURIComponent(message.id)}/activity-${encodeURIComponent(toolId)}`;
}

/** Go to a transcript deep link, re-running it when the address already holds it. */
export function followTranscriptLink(link: string): void {
  if (window.location.hash === link) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else window.location.hash = link;
}

export const ANSWER_ATTACHMENTS_UNSUPPORTED =
  "An answer to the agent's question can't include attachments yet. Remove them, " +
  'or stop answering to send them as a new message.';

/**
 * Turns the composer's message into the answer to the question picked with
 * "Other answer". Attachments are refused: the answer route carries text and
 * option picks only, so they would be silently dropped.
 */
export function questionAnswerFromComposer(
  answering: PendingInteraction | undefined,
  input: { text: string; files?: readonly unknown[]; references?: readonly unknown[] },
): { interaction: PendingInteraction; response: PendingInteractionResponse } | undefined {
  if (!answering || answering.status !== 'pending') return undefined;
  if ((input.files?.length ?? 0) > 0 || (input.references?.length ?? 0) > 0) {
    throw new Error(ANSWER_ATTACHMENTS_UNSUPPORTED);
  }
  const answer = input.text.trim();
  if (!answer) return undefined;
  return {
    interaction: answering,
    response: { action: 'answer', answer },
  };
}
