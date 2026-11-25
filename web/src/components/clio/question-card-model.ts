import type { PendingInteraction } from '@clio/core/v3';
import { serverOwnerName } from '@/lib/a2ui/server-surface';
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

/** A prompt that opens by repeating its title says the question twice; read it once. */
export function withoutRepeatedTitle(prompt: string, title: string): string {
  const head = title.trim();
  const text = prompt.trim();
  if (!head || !text.toLowerCase().startsWith(head.toLowerCase())) return text;
  const rest = text.slice(head.length).trim();
  return rest || text;
}

/**
 * The question without its asker's name in front ("Relay: Where should…" reads "Where
 * should…"). The backend titles a plugin's ask with the plugin's name; the card says who
 * asks once, in its attribution and navigation, so the header is only the question.
 */
export function withoutOwnerPrefix(title: string, interaction: PendingInteraction): string {
  const payload = interaction.payload;
  const owners = [
    payload?.plugin_title,
    payload?.plugin || payload?.server
      ? serverOwnerName({
          plugin: payload?.plugin ?? '',
          plugin_title: payload?.plugin_title,
          server: payload?.server ?? '',
        })
      : undefined,
    payload?.plugin,
    payload?.server,
  ]
    .map((name) => name?.trim().toLowerCase())
    .filter((name): name is string => Boolean(name));
  const lower = title.toLowerCase();
  for (const owner of owners) {
    if (!lower.startsWith(`${owner}:`)) continue;
    const rest = title.slice(owner.length + 1).trim();
    if (rest) return rest;
  }
  return title;
}
