import type { PendingInteraction } from '@clio/core/v3';
import { ArrowUpToLineIcon, MessageCircleQuestionIcon } from 'lucide-react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { vocab } from '@/lib/brand-vocabulary';
import { CloseIcon, EditIcon } from '@/lib/icon-vocabulary';
import { plainQuestionText, questionPrompt } from './question-card-model';
import { IconButton } from './primitives/icon-button';
import { plural, t } from '@lingui/core/macro';

const { agent } = vocab;

interface PendingQuestionNoticeProps {
  /** Pending questions waiting in the log, oldest first. */
  questions: readonly PendingInteraction[];
  /** The question the composer's next message answers, when one was picked. */
  answering?: PendingInteraction;
  onGoToQuestion: (question: PendingInteraction) => void;
  onStopAnswering: () => void;
}

/**
 * One quiet row over the composer while the agent waits on a question: how
 * many are waiting, or which one the next message answers, and the way to it.
 * The question itself (full text, options) lives in its card, never here.
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
  const Icon = answering ? EditIcon : MessageCircleQuestionIcon;
  const prompt = answering ? plainQuestionText(questionPrompt(answering)) : undefined;
  return (
    <TooltipProvider>
      <div
        aria-live="polite"
        className="pointer-events-auto relative z-10 mx-auto mb-1.5 flex h-[30px] w-full max-w-4xl min-w-0 items-center gap-2 rounded-[7px] border border-border bg-card pr-0.5 pl-2.5 text-meta"
        data-slot="pending-question-notice"
        role="status"
      >
        <Icon aria-hidden="true" className="size-3.5 shrink-0 text-action" />
        <p className="min-w-0 flex-1 truncate" title={prompt}>
          {answering ? (
            <>
              <span className="font-medium">{t`Answering:`} </span>
              <span className="text-muted-foreground">{prompt}</span>
            </>
          ) : (
            plural(count, {
              one: `${agent} asked you a question`,
              other: `${agent} asked you # questions`,
            })
          )}
        </p>
        <IconButton
          icon={<ArrowUpToLineIcon aria-hidden="true" />}
          label={t`Go to question`}
          onClick={() => onGoToQuestion(target)}
          size="sm"
          type="button"
        />
        {answering ? (
          <IconButton
            icon={<CloseIcon aria-hidden="true" />}
            label={t`Stop answering`}
            onClick={onStopAnswering}
            size="sm"
            type="button"
          />
        ) : null}
      </div>
    </TooltipProvider>
  );
}
