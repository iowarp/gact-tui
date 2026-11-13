import type { ReactNode } from 'react';
import type { InfrastructureDependency, Message, RunState } from '@clio/core/v3';
import { currentTurnAssistantMessages } from '@/lib/current-turn-messages';
import { ClioInfrastructurePreparation } from './infrastructure-preparation';
import { StateView } from './primitives/state-view';
import { t } from '@lingui/core/macro';

export interface TurnPreparationProps {
  messages: readonly Message[];
  sessionState?: RunState;
  activeTurnId?: string;
  activeTurnResponded?: boolean;
  dependencies?: readonly InfrastructureDependency[];
  /** The person's message is still on its way to the service; no turn exists yet. */
  sending?: boolean;
}

function PreparationRow({ title }: { title: ReactNode }) {
  return (
    <div className="py-2" data-slot="turn-preparation">
      <StateView kind="loading" size="row" title={title} />
    </div>
  );
}

/** Preparation belongs to the current response and ends at its first content. */
export function ClioTurnPreparation({
  messages,
  sessionState,
  activeTurnId,
  activeTurnResponded,
  dependencies = [],
  sending,
}: TurnPreparationProps) {
  if (sending && sessionState !== 'running') return <PreparationRow title={t`Sending message`} />;
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
    <PreparationRow
      title={<ClioInfrastructurePreparation dependencies={dependencies} followUp={followUp} />}
    />
  );
}
