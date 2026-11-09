import type { InfrastructureDependency, Message, RunState } from '@clio/core/v3';
import { currentTurnAssistantMessages } from '@/lib/current-turn-messages';
import { ClioInfrastructurePreparation } from './infrastructure-preparation';
import { StateView } from './primitives/state-view';

export interface TurnPreparationProps {
  messages: readonly Message[];
  sessionState?: RunState;
  activeTurnId?: string;
  activeTurnResponded?: boolean;
  dependencies?: readonly InfrastructureDependency[];
}

/** Preparation belongs to the current response and ends at its first content. */
export function ClioTurnPreparation({
  messages,
  sessionState,
  activeTurnId,
  activeTurnResponded,
  dependencies = [],
}: TurnPreparationProps) {
  if (sessionState !== 'queued' && sessionState !== 'running') return null;
  const currentMessages = currentTurnAssistantMessages(messages, activeTurnId);
  const hasContent = currentMessages.some((message) =>
    message.blocks.some(
      (block) =>
        (block.type !== 'text' && block.type !== 'reasoning') ||
        ((block.type === 'text' || block.type === 'reasoning') && block.text.trim().length > 0),
    ),
  );
  if (activeTurnResponded || hasContent) return null;
  const followUp = messages.some(
    (message) => message.role === 'assistant' && !currentMessages.includes(message),
  );
  return (
    <div className="py-2" data-slot="turn-preparation">
      <StateView
        kind="loading"
        size="row"
        title={<ClioInfrastructurePreparation dependencies={dependencies} followUp={followUp} />}
      />
    </div>
  );
}
