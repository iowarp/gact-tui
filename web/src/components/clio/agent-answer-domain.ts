import type { PendingInteraction } from '@clio/core/v3';

/** True for an MCP request the server first addressed to an agent. */
export function isAgentMcpInteraction(interaction: PendingInteraction): boolean {
  return (
    interaction.source.protocol === 'mcp' &&
    interaction.audience === 'agent' &&
    (interaction.routing_state === 'elicitation_routed_to_agent' ||
      interaction.routing_state === 'agent_elicitation_fallback_to_human')
  );
}

/** Return agent-addressed requests correlated with one causal tool invocation. */
export function agentInteractionsForTool(
  interactions: readonly PendingInteraction[] | undefined,
  toolId: string,
): PendingInteraction[] {
  return (interactions ?? [])
    .filter(
      (interaction) =>
        interaction.source.invocation_id === toolId && isAgentMcpInteraction(interaction),
    )
    .sort(compareAgentInteractions);
}

/** Return agent-addressed requests owned by an asynchronous MCP task. */
export function agentInteractionsForTask(
  interactions: readonly PendingInteraction[] | undefined,
  taskId: string,
): PendingInteraction[] {
  return (interactions ?? [])
    .filter((interaction) => interaction.task_id === taskId && isAgentMcpInteraction(interaction))
    .sort(compareAgentInteractions);
}

/** Human-readable identity that stays honest about request versus protocol round. */
export function agentInteractionRequestLabel(interaction: PendingInteraction): string {
  const kind =
    interaction.payload?.mode === 'url'
      ? 'URL consent request'
      : interaction.payload?.mode === 'form'
        ? 'Form request'
        : interaction.kind === 'mcp_task_input'
          ? 'Task input request'
          : 'Information request';
  const index = interaction.payload?.request_index;
  const count = interaction.payload?.request_count;
  return index && count ? `${kind} ${index} of ${count}` : kind;
}

function compareAgentInteractions(left: PendingInteraction, right: PendingInteraction): number {
  const leftIndex = left.payload?.request_index;
  const rightIndex = right.payload?.request_index;
  if (leftIndex !== undefined && rightIndex !== undefined && leftIndex !== rightIndex) {
    return leftIndex - rightIndex;
  }
  return left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id);
}
