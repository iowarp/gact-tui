import type { PendingInteraction } from '@clio/core/v3';
import { isVariantPickInteraction } from '@/lib/variant-runs';
import { useQuestionAnswer } from './question-answer-context';

/** The words of the question: its prompt, or its title when it has none. */
export function questionPrompt(interaction: PendingInteraction): string {
  return interaction.source.tool_name === 'plan_exit'
    ? interaction.title
    : (interaction.prompt ?? interaction.title);
}

/** Markdown markers read as noise in a one-line title or row. */
export function plainQuestionText(text: string): string {
  return text
    .replace(/^#{1,6}\s+/u, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
    .replace(/\*\*|__|`/gu, '')
    .trim();
}

/** Task cancellation belongs to Work's identifying confirmation, not dismissal. */
export function canDismissQuestion(interaction: PendingInteraction): boolean {
  return !interaction.payload?.task_handle && (interaction.actions ?? []).includes('cancel');
}

/** Whether the main composer can carry this question's own answer. */
function composerCanAnswer(interaction: PendingInteraction): boolean {
  return (
    interaction.kind === 'question' &&
    interaction.source.protocol === 'native' &&
    !interaction.payload?.mode &&
    interaction.source.tool_name !== 'plan_exit' &&
    !isVariantPickInteraction(interaction)
  );
}

/** "Or type your own answer below": the composer answers this question when it can. */
export function useComposerAnswer(interaction: PendingInteraction) {
  const state = useQuestionAnswer();
  const available = Boolean(state) && composerCanAnswer(interaction);
  return {
    available,
    answering: available && state?.answeringId === interaction.id,
    start: () => state?.startAnswer(interaction.id),
    stop: () => state?.stopAnswer(),
  };
}
