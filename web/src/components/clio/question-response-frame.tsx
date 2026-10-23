import type { PendingInteraction, PendingInteractionResponse } from '@clio/core/v3';
import type { ReactNode } from 'react';
import { Frame } from '@/components/reui/frame';
import { cn } from '@/lib/utils';
import { pendingInteractionDomId, respondFromControl } from './interaction-control';
import { InteractionFrameHeader } from './interaction-frame-header';
import { PendingA2UIResponse } from './pending-a2ui-response';
import { ResponseViewportContext } from './response-viewport-context';

/** One surface shared by text, choice, form and link questions. */
export function QuestionResponseFrame({
  children,
  interaction,
  disabled,
  onResponse,
  ownerLabel,
  showOwner,
  showFullPrompt,
  questionTitle,
  progress,
}: {
  children: ReactNode;
  interaction: PendingInteraction;
  disabled?: boolean;
  onResponse: (
    interaction: PendingInteraction,
    response: PendingInteractionResponse,
  ) => Promise<void>;
  ownerLabel?: string;
  showOwner: boolean;
  showFullPrompt?: boolean;
  questionTitle?: string;
  progress?: ReactNode;
}) {
  if (interaction.source.surface_id) {
    return (
      <PendingA2UIResponse
        interaction={interaction}
        disabled={disabled}
        onResponse={onResponse}
        ownerLabel={ownerLabel}
        showOwner={showOwner}
        showFullPrompt={showFullPrompt}
        renderBody={(viewport) => (
          <ResponseViewportContext.Provider value={viewport}>
            <div className="min-w-0 px-3 pb-3">{children}</div>
          </ResponseViewportContext.Provider>
        )}
      />
    );
  }
  const questionnaire =
    (interaction.kind === 'question' && !interaction.payload?.mode) || Boolean(questionTitle);
  return (
    <Frame
      className={cn(
        'min-w-0 self-stretch',
        questionnaire ? 'rounded-2xl border bg-card' : 'rounded-none bg-transparent',
        interaction.kind === 'mcp_task_input' && 'border-accent-foreground/15 bg-accent/25',
      )}
      data-interaction-kind={interaction.kind}
      dense
      variant={questionnaire || interaction.kind === 'mcp_task_input' ? 'default' : 'ghost'}
      id={pendingInteractionDomId(interaction.id)}
      spacing="xs"
      tabIndex={-1}
    >
      <InteractionFrameHeader
        className={questionnaire ? 'px-4 pb-4 pt-4 pr-10' : 'px-3 py-2'}
        disabled={disabled}
        interaction={interaction}
        onCancel={
          !interaction.payload?.task_handle && (interaction.actions ?? []).includes('cancel')
            ? () => respondFromControl(onResponse(interaction, { action: 'cancel' }))
            : undefined
        }
        ownerLabel={ownerLabel}
        showOwner={showOwner}
        showFullPrompt={showFullPrompt}
        questionTitle={questionTitle}
        progress={progress}
        questionnaire={questionnaire}
      />
      <div className={cn('min-w-0 overflow-hidden', questionnaire ? 'px-4 pb-4' : 'px-3 pb-3')}>
        {children}
      </div>
    </Frame>
  );
}
