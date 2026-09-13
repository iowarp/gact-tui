import type { Artifact, PendingInteraction, PendingInteractionResponse } from '@clio/core/v3';
import { AgentAnswerActivity } from './agent-answer-activity';
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
