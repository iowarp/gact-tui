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
  return (
    <Frame
      className={cn(
        'min-w-0 self-stretch rounded-none bg-transparent',
        interaction.kind === 'mcp_task_input' && 'border-accent-foreground/15 bg-accent/25',
      )}
      data-interaction-kind={interaction.kind}
      dense
      variant={interaction.kind === 'mcp_task_input' ? 'default' : 'ghost'}
      id={pendingInteractionDomId(interaction.id)}
      spacing="xs"
      tabIndex={-1}
    >
      <InteractionFrameHeader
        className="px-3 py-2"
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
      />
      <div className="min-w-0 overflow-hidden px-3 pb-3">{children}</div>
    </Frame>
  );
}
