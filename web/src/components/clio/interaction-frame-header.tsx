import type { PendingInteraction } from '@clio/core/v3';
import { BoxesIcon, ClipboardPenLineIcon, MessageCircleQuestionIcon } from 'lucide-react';
import { CloseIcon } from '@/lib/icon-vocabulary';
import type { ReactNode } from 'react';
import { FrameHeader, FrameTitle } from '@/components/reui/frame';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { OwnerAttribution } from './pending-interaction-notices';
import { TechnicalDetails } from './technical-details';
import { QuestionMarkdown } from './question-markdown';

interface InteractionFrameHeaderProps {
  className?: string;
  interaction: PendingInteraction;
  ownerLabel?: string;
  showOwner: boolean;
  onCancel?: () => void;
  actions?: ReactNode;
  disabled?: boolean;
  showFullPrompt?: boolean;
  questionTitle?: string;
  progress?: ReactNode;
  questionnaire?: boolean;
}

/** Shared compact heading for questions and interactive response surfaces. */
export function InteractionFrameHeader({
  className,
  interaction,
  ownerLabel,
  showOwner,
  onCancel,
  actions,
  disabled,
  showFullPrompt,
  questionTitle,
  progress,
  questionnaire,
}: InteractionFrameHeaderProps) {
  const isPlanExit = interaction.source.tool_name === 'plan_exit';
  const Icon =
    interaction.kind === 'mcp_task_input'
      ? ClipboardPenLineIcon
      : interaction.kind === 'a2ui'
        ? BoxesIcon
        : MessageCircleQuestionIcon;
  return (
    <FrameHeader
      className={cn('relative flex-row items-start gap-2', actions ? 'pr-28' : 'pr-10', className)}
    >
      {questionnaire ? null : (
        <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-action" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <FrameTitle
            className={cn(
              'min-w-0 flex-1 break-words',
              questionnaire ? 'text-base font-semibold leading-snug' : 'font-normal',
              !showFullPrompt && 'clio-scrollbar max-h-28 overflow-y-auto pb-1 pr-1',
            )}
            data-slot="pending-interaction-title"
          >
            <QuestionMarkdown>
              {questionTitle ??
                (isPlanExit ? interaction.title : (interaction.prompt ?? interaction.title))}
            </QuestionMarkdown>
          </FrameTitle>
          {progress ? (
            <div className="shrink-0 pt-0.5 text-xs text-muted-foreground">{progress}</div>
          ) : null}
        </div>
        <OwnerAttribution interaction={interaction} ownerLabel={ownerLabel} show={showOwner} />
        {interaction.routing_state === 'agent_elicitation_fallback_to_human' ? (
          <>
            <p className="mt-1 text-xs text-muted-foreground">
              The specialist could not answer this, so it needs you.
            </p>
            {interaction.fallback_detail ? (
              <TechnicalDetails
                className="mt-1 text-xs text-muted-foreground"
                title="Technical details"
              >
                <code>{interaction.fallback_detail}</code>
              </TechnicalDetails>
            ) : null}
          </>
        ) : null}
      </div>
      {actions || onCancel ? (
        <div className="absolute right-2 top-1 flex items-center gap-0.5">
          {actions}
          {onCancel ? (
            <Button
              aria-label="Cancel question"
              disabled={disabled}
              onClick={onCancel}
              size="icon-sm"
              variant="ghost"
            >
              <CloseIcon aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      ) : null}
    </FrameHeader>
  );
}
