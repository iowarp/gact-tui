import type { InfrastructureDependency, Message, RunState } from '@clio/core/v3';
import { ClioInfrastructurePreparation } from './infrastructure-preparation';

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
  const latestUser = messages.findLast((message) => message.role === 'user');
  const currentRunId = activeTurnId ?? latestUser?.run_id ?? latestUser?.turn_id;
  const isCurrentAssistant = (message: Message): boolean => {
    if (message.role !== 'assistant') return false;
    const runId = message.run_id ?? message.turn_id;
    if (runId && currentRunId) return runId === currentRunId;
    // Tool content can precede its run association; keep the user-turn boundary.
    return !latestUser || Date.parse(message.created_at) >= Date.parse(latestUser.created_at);
  };
  const hasContent = messages.some(
    (message) =>
      isCurrentAssistant(message) &&
      message.blocks.some(
        (block) =>
          (block.type !== 'text' && block.type !== 'reasoning') ||
          ((block.type === 'text' || block.type === 'reasoning') && block.text.trim().length > 0),
      ),
  );
  if (activeTurnResponded || hasContent) return null;
  const followUp = messages.some(
    (message) => message.role === 'assistant' && !isCurrentAssistant(message),
  );
  return (
    <div className="py-4 text-sm text-muted-foreground" data-slot="turn-preparation" role="status">
      <ClioInfrastructurePreparation dependencies={dependencies} followUp={followUp} />
    </div>
  );
}
