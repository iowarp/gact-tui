import type { PendingInteraction } from '@clio/core/v3';
import { BotIcon, MessageCircleQuestionIcon } from 'lucide-react';

/** Quiet lifecycle attribution for a question routed to an agent. */
export function AgentAnswerActivity({ interaction }: { interaction: PendingInteraction }) {
  const answered = interaction.status === 'answered' && interaction.answered_by === 'agent';
  return (
    <div
      className="flex items-center gap-2 px-1 text-xs text-muted-foreground"
      data-agent-question-state={answered ? 'answered' : 'answering'}
    >
      {answered ? (
        <BotIcon aria-hidden="true" className="size-3.5" />
      ) : (
        <MessageCircleQuestionIcon aria-hidden="true" className="size-3.5" />
      )}
      <span>{answered ? 'Answered by specialist' : 'Specialist answering a question'}</span>
    </div>
  );
}
