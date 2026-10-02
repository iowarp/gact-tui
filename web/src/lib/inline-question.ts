import type { Message, PendingInteraction, PendingInteractionResponse } from '@clio/core/v3';
import { isVariantPickInteraction } from './variant-runs';

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
  "This question was asked by a delegated agent, so its answer can't include " +
  'attachments. Remove them, or stop answering to send them as a new message.';

export type ComposerQuestionAnswer =
  /** Text only: answered through the question's own response route. */
  | { kind: 'response'; interaction: PendingInteraction; response: PendingInteractionResponse }
  /** With attachments: the composer message itself answers the question. */
  | { kind: 'message'; questionId: string };

/**
 * How the composer's message answers the question picked with "Other answer".
 * Text alone goes through the question's response route. A message with
 * attachments is sent as a normal message that names the question, so its
 * attachments travel the one message path -- possible for a question raised in
 * the session the composer sends to; a delegated agent's question is refused.
 */
export function questionAnswerFromComposer(
  answering: PendingInteraction | undefined,
  sessionId: string,
  input: { text: string; files?: readonly unknown[]; references?: readonly unknown[] },
): ComposerQuestionAnswer | undefined {
  if (!answering || answering.status !== 'pending') return undefined;
  // A pick between drafts is answered only in its tabs block, with exactly one
  // draft: never by a composer message (the server refuses one with
  // `drafts_question_needs_pick`), so the composer sends an ordinary message.
  if (isVariantPickInteraction(answering)) return undefined;
  const questionId =
    typeof answering.payload?.question_id === 'string' ? answering.payload.question_id : '';
  if ((input.files?.length ?? 0) > 0 || (input.references?.length ?? 0) > 0) {
    if (!questionId || answering.owner_session_id !== sessionId) {
      throw new Error(ANSWER_ATTACHMENTS_UNSUPPORTED);
    }
    return { kind: 'message', questionId };
  }
  const answer = input.text.trim();
  if (!answer) return undefined;
  return { kind: 'response', interaction: answering, response: { action: 'answer', answer } };
}
