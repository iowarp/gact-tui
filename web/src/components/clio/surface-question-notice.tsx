import type { A2UISurface, PendingInteraction, PendingInteractionResponse } from '@clio/core/v3';
import { useState } from 'react';
import { ArrowUpRightIcon, MessageCircleQuestionIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQuestionAnswer } from './question-answer-context';
import { QuestionMarkdown } from './question-markdown';
import { pendingInteractionDomId } from './interaction-control';
import { CloseIcon } from '@/lib/icon-vocabulary';
import { OwnerAttribution, ResponseErrorNotice } from './pending-interaction-notices';

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
  return (
    <div
      className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1 px-3 py-2 text-sm sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:items-center"
      id={pendingInteractionDomId(interaction.id)}
      tabIndex={-1}
    >
      <MessageCircleQuestionIcon
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-action sm:mt-0"
      />
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2">
          <QuestionMarkdown>
            {interaction.prompt || 'A question is waiting in the interactive view.'}
          </QuestionMarkdown>
        </div>
        <OwnerAttribution interaction={interaction} ownerLabel={ownerLabel} show={showOwner} />
        {!available ? (
          <p className="text-xs text-muted-foreground">
            {!id
              ? 'This response has no linked view.'
              : surface && surface.session_id !== interaction.owner_session_id
                ? 'The linked view belongs to another conversation.'
                : surface
                  ? 'The linked view is unavailable.'
                  : 'Loading the linked view…'}
          </p>
        ) : null}
        <ResponseErrorNotice error={error} />
      </div>
      <div className="col-start-2 row-start-2 flex justify-end gap-1 sm:col-start-3 sm:row-start-1">
        <Button
          className="shrink-0"
          disabled={disabled || responding || !available || !open}
          onClick={() => open?.(interaction)}
          size="sm"
          variant="ghost"
        >
          <ArrowUpRightIcon aria-hidden="true" /> Go to question
        </Button>
        {!available && refetch ? (
          <Button onClick={refetch} size="sm" variant="ghost">
            Retry
          </Button>
        ) : null}
      </div>
      {onResponse && interaction.actions?.includes('cancel') ? (
        <Button
          aria-label="Dismiss question"
          className="col-start-3 row-start-1 sm:col-start-4"
          disabled={disabled || responding}
          onClick={async () => {
            setResponding(true);
            setError(undefined);
            try {
              await onResponse(interaction, { action: 'cancel' });
            } catch (caught) {
              setError(caught instanceof Error ? caught : new Error(String(caught)));
            } finally {
              setResponding(false);
            }
          }}
          size="icon-sm"
          variant="ghost"
        >
          <CloseIcon aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
