import type { PendingInteraction } from '@clio/core/v3';
import { isVariantPickInteraction } from '@/lib/variant-runs';

/** True for an MCP request the server first addressed to an agent. */
export function isAgentMcpInteraction(interaction: PendingInteraction): boolean {
  return (
    interaction.source.protocol === 'mcp' &&
    interaction.audience === 'agent' &&
    (interaction.routing_state === 'elicitation_routed_to_agent' ||
      interaction.routing_state === 'agent_elicitation_fallback_to_human')
  );
}

/** True for a native or MCP question that belongs in causal tool/task history. */
export function isCausalQuestionInteraction(interaction: PendingInteraction): boolean {
  return interaction.kind === 'question' || interaction.kind === 'mcp_task_input';
}

/** Return questions correlated with one causal tool invocation. */
export function questionInteractionsForTool(
  interactions: readonly PendingInteraction[] | undefined,
  toolId: string,
): PendingInteraction[] {
  return (interactions ?? [])
    .filter(
      (interaction) =>
        interaction.source.invocation_id === toolId && isCausalQuestionInteraction(interaction),
    )
    .sort(compareQuestionInteractions);
}

/**
 * Splits a call's questions: a plain pending question is said on the call's own row
 * ("waiting for you"), so it is not drawn again; everything else keeps its record.
 */
export function splitWaitingQuestion(questions: readonly PendingInteraction[]): {
  waiting?: PendingInteraction;
  rest: PendingInteraction[];
} {
  const waiting = questions.find(
    (interaction) =>
      interaction.status === 'pending' &&
      !isAgentMcpInteraction(interaction) &&
      !isVariantPickInteraction(interaction) &&
      interaction.source.tool_name !== 'plan_exit',
  );
  return { waiting, rest: questions.filter((interaction) => interaction !== waiting) };
}

/** Return questions owned by an asynchronous task. */
export function questionInteractionsForTask(
  interactions: readonly PendingInteraction[] | undefined,
  taskId: string,
): PendingInteraction[] {
  return (interactions ?? [])
    .filter(
      (interaction) => interaction.task_id === taskId && isCausalQuestionInteraction(interaction),
    )
    .sort(compareQuestionInteractions);
}

/** Human-readable identity that stays honest about request versus protocol round. */
export function questionInteractionRequestLabel(interaction: PendingInteraction): string {
  const kind =
    interaction.payload?.mode === 'url'
      ? 'URL consent request'
      : interaction.payload?.mode === 'form'
        ? 'Form request'
        : interaction.kind === 'mcp_task_input'
          ? 'Task input request'
          : interaction.source.protocol === 'native'
            ? 'Question'
            : 'Information request';
  const index = interaction.payload?.request_index;
  const count = interaction.payload?.request_count;
  return index && count ? `${kind} ${index} of ${count}` : kind;
}

function compareQuestionInteractions(left: PendingInteraction, right: PendingInteraction): number {
  const leftIndex = left.payload?.request_index;
  const rightIndex = right.payload?.request_index;
  if (leftIndex !== undefined && rightIndex !== undefined && leftIndex !== rightIndex) {
    return leftIndex - rightIndex;
  }
  return left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id);
}
