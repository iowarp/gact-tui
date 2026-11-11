import type { PendingInteraction, PendingInteractionResponse } from '@clio/core/v3';
import type { ReactNode } from 'react';
import type { AskPager } from './ask-card-keys';
import { AskPagerControls } from './ask-card';
import { CloseIcon } from '@/lib/icon-vocabulary';
import { TooltipProvider } from '@/components/ui/tooltip';
import { respondFromControl } from './interaction-control';
import { QuestionCard, QuestionFooter, type QuestionCardProps } from './interaction-frame-header';
import { canDismissQuestion } from './question-card-model';
import { PendingA2UIResponse } from './pending-a2ui-response';
import { IconButton } from './primitives/icon-button';
import { ResponseViewportContext } from './response-viewport-context';

export type QuestionFrameCard = Omit<
  QuestionCardProps,
  'interaction' | 'children' | 'heading' | 'ownerLabel' | 'showOwner' | 'showFullPrompt'
> &
  Record<`data-${string}`, string | undefined>;

/**
 * One frame shared by text, choice, form, link and bundle questions: the ask
 * card, or the resizable visual surface when the question carries one.
 */
export function QuestionResponseFrame({
  children,
  interaction,
  disabled,
  onResponse,
  ownerLabel,
  showOwner,
  showFullPrompt,
  heading,
  meta,
  allowsComposer,
  composerOnly,
  pager,
  hints,
  card,
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
  /** The question on screen, when it is not the interaction's prompt (a bundle page). */
  heading?: string;
  meta?: ReactNode;
  /** The answer may be written in the composer instead. */
  allowsComposer?: boolean;
  /** The composer is the only way to answer (a written-answer question). */
  composerOnly?: boolean;
  /** The card's own pages (a bundle's questions), as ‹ 1/2 › beside ✕. */
  pager?: AskPager;
  /** Footer hints before the composer and dismiss hints. */
  hints?: ReactNode;
  /** Frame attributes for a card shown outside the tray (the transcript's inline question). */
  card?: QuestionFrameCard;
}) {
  if (interaction.source.surface_id) {
    return (
      <PendingA2UIResponse
        allowsComposer={allowsComposer}
        composerOnly={composerOnly}
        interaction={interaction}
        disabled={disabled}
        onResponse={onResponse}
        ownerLabel={ownerLabel}
        showOwner={showOwner}
        showFullPrompt={showFullPrompt}
        renderBody={(viewport) => (
          <ResponseViewportContext.Provider value={viewport}>
            <div className="min-w-0">{children}</div>
          </ResponseViewportContext.Provider>
        )}
      />
    );
  }
  const dismiss = canDismissQuestion(interaction)
    ? () => respondFromControl(onResponse(interaction, { action: 'cancel' }))
    : undefined;
  return (
    <QuestionCard
      {...card}
      headerActions={
        pager || dismiss ? (
          <>
            {pager ? <AskPagerControls label="Questions" noun="question" pager={pager} /> : null}
            {dismiss ? (
              <TooltipProvider>
                <IconButton
                  disabled={disabled}
                  icon={<CloseIcon aria-hidden="true" />}
                  label="Close question"
                  onClick={dismiss}
                  size="sm"
                />
              </TooltipProvider>
            ) : null}
          </>
        ) : undefined
      }
      heading={heading}
      interaction={interaction}
      meta={meta}
      ownerLabel={ownerLabel}
      showFullPrompt={showFullPrompt}
      showOwner={showOwner}
    >
      {children}
      <QuestionFooter
        allowsComposer={allowsComposer}
        composerOnly={composerOnly}
        disabled={disabled}
        interaction={interaction}
        onDismiss={dismiss}
      >
        {hints}
      </QuestionFooter>
    </QuestionCard>
  );
}
