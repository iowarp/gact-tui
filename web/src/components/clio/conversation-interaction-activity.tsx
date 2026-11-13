import type { Artifact, PendingInteraction, PendingInteractionResponse } from '@clio/core/v3';
import { isVariantPickInteraction } from '@/lib/variant-runs';
import { AgentAnswerActivity } from './agent-answer-activity';
import { ConnectorSetupActivity } from './connector-setup-activity';
import { InlinePlanExitResponse } from './plan-exit-interaction';

export function ConversationInteractionActivity({
  artifacts,
  compact = false,
  interaction,
  onOpenArtifact,
  onResponse,
}: {
  artifacts: Record<string, Artifact>;
  compact?: boolean;
  interaction: PendingInteraction;
  onOpenArtifact?: (artifact: Artifact) => void;
  onResponse?: (
    interaction: PendingInteraction,
    response: PendingInteractionResponse,
  ) => Promise<void>;
}) {
  // A pick between the agent's drafts is answered in its tabs block
  // (VariantRunsForMessage), never as a plain choice list.
  if (isVariantPickInteraction(interaction)) return null;
  if (interaction.kind === 'connector_setup')
    return <ConnectorSetupActivity interaction={interaction} />;
  if (interaction.source.tool_name === 'plan_exit' && !compact) {
    return (
      <InlinePlanExitResponse
        artifacts={artifacts}
        interaction={interaction}
        onOpenArtifact={onOpenArtifact}
        onResponse={onResponse}
      />
    );
  }
  return <AgentAnswerActivity compact={compact} interaction={interaction} />;
}
