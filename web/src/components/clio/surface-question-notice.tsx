import type { A2UISurface, PendingInteraction, PendingInteractionResponse } from '@clio/core/v3';
import { useState } from 'react';
import { ArrowUpRightIcon } from 'lucide-react';
import { AskButton, AskError, AskOptions, AskSubject } from './ask-card';
import { QuestionCard, QuestionFooter } from './interaction-frame-header';
import { canDismissQuestion } from './question-card-model';
import { useQuestionAnswer } from './question-answer-context';

/** Link to a question's original view without mounting a second widget. */
export function SurfaceQuestionNotice({
  interaction,
  disabled,
  rawSurface,
  onOpen,
  onRefetch,
  onResponse,
  ownerLabel,
  showOwner = false,
}: {
  interaction: PendingInteraction;
  disabled?: boolean;
  rawSurface?: A2UISurface;
  onOpen?: (interaction: PendingInteraction) => void;
  onRefetch?: () => void;
  onResponse?: (
    interaction: PendingInteraction,
    response: PendingInteractionResponse,
  ) => Promise<void>;
  ownerLabel?: string;
  showOwner?: boolean;
}) {
  const state = useQuestionAnswer();
  const [responding, setResponding] = useState(false);
  const [error, setError] = useState<Error>();
  const id = interaction.source.surface_id;
  const surface =
    rawSurface ??
    (id
      ? (state?.surfaces?.[`${interaction.owner_session_id}:${id}`] ?? state?.surfaces?.[id])
      : undefined);
  const available =
    surface?.session_id === interaction.owner_session_id && surface.state !== 'deleted';
  const open = onOpen ?? state?.openSurfaceQuestion;
  const refetch = onRefetch ?? state?.refetchSurfaces;
  const dismiss = async () => {
    if (!onResponse) return;
    setResponding(true);
    setError(undefined);
    try {
      await onResponse(interaction, { action: 'cancel' });
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error(String(caught)));
    } finally {
      setResponding(false);
    }
  };
  return (
    <QuestionCard
      data-response-surface="link"
      heading={interaction.prompt || 'A question is waiting in the interactive view.'}
      interaction={interaction}
      ownerLabel={ownerLabel}
      showOwner={showOwner}
    >
      {!available ? (
        <AskSubject className="text-[12px]">
          {!id
            ? 'This response has no linked view.'
            : surface && surface.session_id !== interaction.owner_session_id
              ? 'The linked view belongs to another conversation.'
              : surface
                ? 'The linked view is unavailable.'
                : 'Loading the linked view…'}
        </AskSubject>
      ) : null}
      <AskError error={error} />
      <AskOptions aria-label="Question">
        <AskButton
          disabled={disabled || responding || !available || !open}
          hint="Enter"
          onClick={() => open?.(interaction)}
          primary
        >
          <span className="inline-flex items-center gap-1.5">
            <ArrowUpRightIcon aria-hidden="true" className="size-3.5" />
            Go to question
          </span>
        </AskButton>
        {!available && refetch ? <AskButton onClick={refetch}>Retry</AskButton> : null}
      </AskOptions>
      <QuestionFooter
        disabled={disabled || responding}
        interaction={interaction}
        onDismiss={onResponse && canDismissQuestion(interaction) ? () => void dismiss() : undefined}
      />
    </QuestionCard>
  );
}
