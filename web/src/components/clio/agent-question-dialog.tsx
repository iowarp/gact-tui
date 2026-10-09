import type { PendingInteraction, PendingInteractionResponse } from '@clio/core/v3';
import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useConversationWidth } from '@/providers/appearance-provider';
import { vocab } from '@/lib/brand-vocabulary';
import { cn } from '@/lib/utils';
import { QuestionResponse } from './pending-interaction-question-response';
import { useQuestionAnswer } from './question-answer-context';
import { Button } from '@/components/ui/button';

export function AgentQuestionDialog({
  interaction,
  onClose,
  onResponse,
}: {
  interaction?: PendingInteraction;
  onClose: () => void;
  onResponse: (
    interaction: PendingInteraction,
    response: PendingInteractionResponse,
  ) => Promise<void>;
}) {
  const width = useConversationWidth();
  const answer = useQuestionAnswer();
  return (
    <Dialog
      open={Boolean(interaction)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        className={cn(
          'top-1/2 -translate-y-1/2 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] overflow-y-auto',
          width === 'wide' ? 'sm:max-w-6xl' : 'sm:max-w-4xl',
        )}
      >
        <DialogTitle>{vocab.agent} asked a question</DialogTitle>
        {interaction &&
        answer &&
        interaction.source.protocol === 'native' &&
        !interaction.payload?.mode ? (
          <Button
            variant="ghost"
            className="justify-self-start"
            onClick={() => {
              answer.startAnswer(interaction.id);
              onClose();
            }}
          >
            Answer in message box
          </Button>
        ) : null}
        {interaction ? (
          <QuestionDialogBody
            key={interaction.id}
            interaction={interaction}
            onResponse={onResponse}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function QuestionDialogBody({
  interaction,
  onResponse,
}: {
  interaction: PendingInteraction;
  onResponse: (
    interaction: PendingInteraction,
    response: PendingInteractionResponse,
  ) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error>();
  return (
    <div className="min-w-0">
      <p className="mb-3 text-xs text-muted-foreground">
        {interaction.payload?.response_mode === 'async'
          ? `Answer when ready. ${vocab.agent} can continue working; your answer enters the message queue.`
          : `${vocab.agent} needs your answer to continue.`}
      </p>
      <QuestionResponse
        interaction={interaction}
        showOwner={false}
        disabled={pending}
        responseError={error}
        onResponse={async (row, response) => {
          if (pending) return;
          setPending(true);
          setError(undefined);
          try {
            await onResponse(row, response);
          } catch (caught) {
            setError(caught instanceof Error ? caught : new Error(String(caught)));
            throw caught;
          } finally {
            setPending(false);
          }
        }}
      />
    </div>
  );
}
