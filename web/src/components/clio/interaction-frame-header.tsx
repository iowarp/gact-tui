import type { PendingInteraction } from '@clio/core/v3';
import { BoxesIcon, ClipboardPenLineIcon, MessageCircleQuestionIcon, XIcon } from 'lucide-react';
import { FrameHeader, FrameTitle } from '@/components/reui/frame';
import { Button } from '@/components/ui/button';
import { OwnerAttribution } from './pending-interaction-notices';

interface InteractionFrameHeaderProps {
  interaction: PendingInteraction;
  ownerLabel?: string;
  showOwner: boolean;
  onCancel?: () => void;
  disabled?: boolean;
}

/** Shared compact heading for questions and interactive response surfaces. */
export function InteractionFrameHeader({
  interaction,
  ownerLabel,
  showOwner,
  onCancel,
  disabled,
}: InteractionFrameHeaderProps) {
  const isPlanExit = interaction.source.tool_name === 'plan_exit';
  const Icon =
    interaction.kind === 'mcp_task_input'
      ? ClipboardPenLineIcon
      : interaction.kind === 'a2ui'
        ? BoxesIcon
        : MessageCircleQuestionIcon;
  return (
    <FrameHeader className="relative flex-row items-start gap-2 pr-10">
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-action" />
      <div className="min-w-0 flex-1">
        <FrameTitle
          className="line-clamp-3"
          data-slot="pending-interaction-title"
          title={isPlanExit ? interaction.title : (interaction.prompt ?? interaction.title)}
        >
          {isPlanExit ? interaction.title : (interaction.prompt ?? interaction.title)}
        </FrameTitle>
        <OwnerAttribution interaction={interaction} ownerLabel={ownerLabel} show={showOwner} />
        {interaction.routing_state === 'agent_elicitation_fallback_to_human' ? (
          <>
            <p className="mt-1 text-xs text-muted-foreground">
              The specialist could not answer this, so it needs you.
            </p>
            {interaction.fallback_detail ? (
              <details className="mt-1 text-xs text-muted-foreground">
                <summary className="cursor-pointer">Technical details</summary>
                <code>{interaction.fallback_detail}</code>
              </details>
            ) : null}
          </>
        ) : null}
      </div>
      {onCancel ? (
        <Button
          aria-label="Cancel question"
          className="absolute right-2 top-1"
          disabled={disabled}
          onClick={onCancel}
          size="icon-sm"
          variant="ghost"
        >
          <XIcon aria-hidden="true" />
        </Button>
      ) : null}
    </FrameHeader>
  );
}
