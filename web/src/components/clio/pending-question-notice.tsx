import type { PendingInteraction } from '@clio/core/v3';
import { ArrowUpToLineIcon, MessageCircleQuestionIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CloseIcon, EditIcon } from '@/lib/icon-vocabulary';

interface PendingQuestionNoticeProps {
  /** Pending questions waiting in the log, oldest first. */
  questions: readonly PendingInteraction[];
  /** The question the composer's next message answers, when one was picked. */
  answering?: PendingInteraction;
  onGoToQuestion: (question: PendingInteraction) => void;
  onStopAnswering: () => void;
}

/**
 * The small notice over the composer while the agent waits on a question:
 * how many are waiting and a way to the card in the log. Once "Other answer"
 * was picked it says which question the next message answers instead. The
 * question itself (full text, options) lives in the log, never here.
 */
export function PendingQuestionNotice({
  questions,
  answering,
  onGoToQuestion,
  onStopAnswering,
}: PendingQuestionNoticeProps) {
  const target = answering ?? questions[0];
  if (!target) return null;
  const count = questions.length;
  return (
    <div
      aria-live="polite"
      // Match the composer surface so the tray joins the input in either theme.
      className="pointer-events-auto relative z-10 mx-auto -mb-px flex w-[calc(100%_-_1.5rem)] min-w-0 max-w-[54.5rem] items-center gap-2 rounded-t-xl border border-b-0 border-composer-border bg-composer px-3 py-1 text-sm"
      data-slot="pending-question-notice"
      role="status"
    >
      {answering ? (
        <EditIcon aria-hidden="true" className="size-4 shrink-0 text-action" />
      ) : (
        <MessageCircleQuestionIcon aria-hidden="true" className="size-4 shrink-0 text-action" />
      )}
      <p className="min-w-0 flex-1 truncate">
        {answering ? (
          <>
            <span className="font-medium">Answering: </span>
            <span className="text-muted-foreground">{answering.prompt ?? answering.title}</span>
          </>
        ) : count === 1 ? (
          'The agent asked you a question'
        ) : (
          `The agent asked you ${count} questions`
        )}
      </p>
      <Button
        className="h-7 shrink-0"
        onClick={() => onGoToQuestion(target)}
        size="sm"
        type="button"
        variant="ghost"
      >
        <ArrowUpToLineIcon data-icon="inline-start" />
        Go to question
      </Button>
      {answering ? (
        <Button
          aria-label="Stop answering"
          className="shrink-0"
          onClick={onStopAnswering}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <CloseIcon aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
