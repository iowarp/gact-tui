import type { Message } from '@clio/core/v3';
import { BookmarkIcon, CopyIcon, LoaderCircleIcon } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CloseIcon, RetryIcon } from '@/lib/icon-vocabulary';
import { copyText } from '@/lib/clipboard';
import { canDeferHoverControls } from '@/lib/hover-deferral';
import { cn } from '@/lib/utils';
import { TooltipProvider } from '@/components/ui/tooltip';
import { answerRevisions } from './answer-revisions';
import type { ConversationMessageRowProps } from './conversation-types';
import { MemoryUsedAction } from './memory-used-action';
import { ClioMessageHistoryActions } from './message-history-actions';
import { MessageMarkButton } from './message-mark-button';
import { IconButton } from './primitives/icon-button';
import { ResponseRating } from './response-rating';
import { TranscriptContentPicker } from './transcript-content-picker';

type MessageRowActionEntities = Pick<
  ConversationMessageRowProps,
  | 'cancellablePendingMessageIds'
  | 'cancellingPendingMessageId'
  | 'forkingMessageId'
  | 'markedMessageIds'
  | 'markingMessageId'
  | 'onCancelPendingSteer'
  | 'onForkFromMessage'
  | 'onMarkMessage'
  | 'onRetryMessage'
  | 'onRewindToMessage'
  | 'pendingMessageIds'
  | 'retryingMessageId'
  | 'rewindingMessageId'
>;

function copyMessage(message: Message) {
  // A hook's revision replaces the answer it revised; copy what is shown.
  const revised = answerRevisions(message.blocks);
  void copyText(
    message.blocks
      .flatMap((block) => (block.type === 'text' && !revised.has(block.id) ? [block.text] : []))
      .join('\n'),
  );
}

/**
 * Hover-only actions mount once the pointer or focus first enters their
 * message, so a long transcript does not carry every row's hidden buttons (and
 * their per-message rating reads). Devices without hover, and `keep` (a marked
 * message, a visible retry), mount them at once.
 */
export function DeferredMessageActions({
  children,
  keep,
}: {
  children: ReactNode;
  keep?: boolean;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [armed, setArmed] = useState(() => !canDeferHoverControls());
  useEffect(() => {
    if (armed || keep) return;
    const row = anchor.current?.closest('[data-message-id]');
    if (!row) {
      setArmed(true);
      return;
    }
    const arm = () => setArmed(true);
    row.addEventListener('pointerenter', arm);
    row.addEventListener('focusin', arm);
    return () => {
      row.removeEventListener('pointerenter', arm);
      row.removeEventListener('focusin', arm);
    };
  }, [armed, keep]);
  return armed || keep ? children : <span ref={anchor} hidden />;
}

/**
 * A message's icon actions in reading order. An answer carries retry, what it
 * used, rating, mark, fork, rewind and copy; a prompt carries mark and copy.
 */
export function MessageRowActions({
  message,
  active = false,
  canRetry = false,
  entities,
  className,
}: {
  message: Message;
  active?: boolean;
  canRetry?: boolean;
  entities: MessageRowActionEntities;
  className?: string;
}) {
  const assistant = message.role === 'assistant';
  const retrying = entities.retryingMessageId === message.id;
  const cancelling = entities.cancellingPendingMessageId === message.id;
  const cancellable =
    message.role === 'user' &&
    entities.pendingMessageIds?.has(message.id) &&
    entities.cancellablePendingMessageIds?.has(message.id);
  const marked = entities.markedMessageIds?.has(message.id) ?? false;
  return (
    <TooltipProvider delayDuration={450}>
      <div
        className={cn('flex shrink-0 items-center gap-0.5', className)}
        data-slot="message-row-actions"
      >
        {cancellable ? (
          <IconButton
            data-pending-cancel=""
            disabled={cancelling || !entities.onCancelPendingSteer}
            icon={
              cancelling ? (
                <LoaderCircleIcon aria-hidden="true" className="motion-safe:animate-spin" />
              ) : (
                <CloseIcon aria-hidden="true" />
              )
            }
            label={cancelling ? 'Cancelling pending message' : 'Cancel pending message'}
            onClick={() => void entities.onCancelPendingSteer?.(message.id)}
            size="sm"
            type="button"
          />
        ) : null}
        {canRetry ? (
          <IconButton
            disabled={retrying || !entities.onRetryMessage}
            icon={
              retrying ? (
                <LoaderCircleIcon aria-hidden="true" className="motion-safe:animate-spin" />
              ) : (
                <RetryIcon aria-hidden="true" />
              )
            }
            label={retrying ? 'Retrying response' : 'Retry response'}
            onClick={() => void entities.onRetryMessage?.(message.id)}
            size="sm"
            type="button"
          />
        ) : null}
        {assistant ? <MemoryUsedAction metadata={message.metadata} /> : null}
        {assistant ? (
          <TranscriptContentPicker sessionId={message.session_id} messageId={message.id} />
        ) : null}
        <ResponseRating message={message} active={active} />
        {entities.onMarkMessage ? (
          <MessageMarkButton
            marked={marked}
            pending={entities.markingMessageId !== undefined}
            onMark={(next) => entities.onMarkMessage!(message.id, next)}
          />
        ) : assistant && marked ? (
          <BookmarkIcon
            aria-label="Marked message"
            className="mx-1 size-3.5 shrink-0 text-muted-foreground"
            fill="currentColor"
            role="img"
          />
        ) : null}
        {assistant ? (
          <ClioMessageHistoryActions
            forking={entities.forkingMessageId === message.id}
            onFork={
              entities.onForkFromMessage
                ? () => entities.onForkFromMessage?.(message.id)
                : undefined
            }
            onRewind={
              entities.onRewindToMessage
                ? () => entities.onRewindToMessage?.(message.id)
                : undefined
            }
            rewinding={entities.rewindingMessageId === message.id}
          />
        ) : null}
        <IconButton
          icon={<CopyIcon aria-hidden="true" />}
          label="Copy message"
          onClick={() => copyMessage(message)}
          size="sm"
          type="button"
        />
      </div>
    </TooltipProvider>
  );
}
