import type { Message } from '@clio/core/v3';
import type { ReactNode } from 'react';
import { formatClockTime, formatDateTime } from '@/lib/locale-format';
import { cn } from '@/lib/utils';
import { MessageReplyCard } from './message-reply-card';
import { replyDuration, replyModelIcon, replyTokens } from './message-reply-facts';

/**
 * The 24px line under a finished answer: the model, its tokens and time on the
 * left (hover for what the reply used), then on hover the message's actions and
 * clock time at the right. Success carries no word; only Stopped or Failed do.
 * End-of-message facts come from the message, never the session's cumulative usage.
 */
export function MessageCompletionFooter({
  message,
  agentName,
  toolCount,
  failedToolCount = 0,
  children,
  active = false,
}: {
  message: Message;
  agentName?: string;
  toolCount: number;
  failedToolCount?: number;
  children: ReactNode;
  active?: boolean;
}) {
  if (!completionFooterShown(message, active)) return null;
  const reason = message.stop_reason?.toLowerCase() ?? '';
  const failed = ['error', 'failed'].includes(reason);
  const interrupted = reason === 'cancelled' || reason === 'interrupted' || failed;
  const tokens = replyTokens(message);
  const duration = replyDuration(message);
  const timestamp = message.completed_at ?? message.created_at;
  return (
    <div
      className="mb-1.5 flex h-6 min-w-0 items-center gap-3 whitespace-nowrap text-[11.5px] text-muted-foreground"
      data-slot="message-completion-footer"
    >
      <MessageReplyCard
        agentName={agentName}
        counts={{ toolCount, failedToolCount }}
        message={message}
      >
        <button
          className="flex h-full min-w-0 items-center gap-3 overflow-hidden rounded-[5px] text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          data-slot="message-reply-meta"
          type="button"
        >
          {interrupted ? (
            <span className="shrink-0 font-medium text-destructive">
              {failed ? 'Failed' : 'Stopped'}
            </span>
          ) : null}
          {message.model ? (
            <span
              className="inline-flex min-w-0 items-center gap-[5px] text-accent-foreground"
              data-slot="message-reply-model"
            >
              {replyModelIcon(message.model.provider_id)}
              <span className="truncate">{message.model.model_id}</span>
            </span>
          ) : null}
          {tokens ? <span className="truncate">{tokens}</span> : null}
          {duration ? <span className="shrink-0">{duration}</span> : null}
          {!interrupted && !message.model && !tokens && !duration ? (
            <span className="truncate">Reply details</span>
          ) : null}
        </button>
      </MessageReplyCard>
      <div
        className={cn(
          'ml-auto flex shrink-0 items-center gap-1',
          // Hover names the actions; a pressed one (a mark) stays in view. Touch shows all.
          'sm:invisible sm:group-hover/reply:visible sm:group-focus-within/reply:visible sm:has-[[aria-expanded=true]]:visible sm:[&_[aria-pressed=true]]:visible',
        )}
        data-slot="message-actions"
      >
        {children}
        <time className="ml-2 shrink-0" dateTime={timestamp} title={formatDateTime(timestamp)}>
          {formatClockTime(timestamp)}
        </time>
      </div>
    </div>
  );
}

/** Whether a message has ended its response for the reader, so its footer belongs under it. */
// oxlint-disable-next-line react/only-export-components
export function completionFooterShown(message: Message, active = false): boolean {
  if (active || !(message.completed_at || message.stop_reason)) return false;
  const reason = message.stop_reason?.toLowerCase() ?? '';
  if (['cancelled', 'error', 'failed', 'interrupted'].includes(reason)) return true;
  // A recorded message boundary can be a question pause or a tool handoff.
  // Only an actual answer (or interruption) ends the response for the reader.
  return (
    ['end_turn', 'stop', 'completed'].includes(reason) &&
    message.blocks.some(
      (block) => block.type === 'text' && block.channel !== 'next_thought' && block.text.trim(),
    )
  );
}
