import type { PendingInteraction } from '@clio/core/v3';

/** Return agent-addressed questions correlated with one causal tool invocation. */
export function agentInteractionsForTool(
  interactions: readonly PendingInteraction[] | undefined,
  toolId: string,
): PendingInteraction[] {
  return (interactions ?? []).filter(
    (interaction) =>
      interaction.source.invocation_id === toolId &&
      interaction.audience === 'agent' &&
      interaction.routing_state === 'elicitation_routed_to_agent',
  );
}
