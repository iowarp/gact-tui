import type { Message } from '@clio/core/v3';
import type { ReactNode } from 'react';
import { formatClockTime, formatDateTime, formatNumber } from '@/lib/locale-format';

/** End-of-message facts come from the message, never the session's cumulative usage. */
export function MessageCompletionFooter({
  message,
  toolCount,
  failedToolCount = 0,
  children,
  active = false,
}: {
  message: Message;
  toolCount: number;
  failedToolCount?: number;
  children: ReactNode;
  active?: boolean;
}) {
  const settled = Boolean(message.completed_at || message.stop_reason);
  const reason = message.stop_reason?.toLowerCase();
  const interrupted = ['cancelled', 'error', 'failed', 'interrupted'].includes(reason ?? '');
  const hasAnswer = message.blocks.some(
    (block) => block.type === 'text' && block.channel !== 'next_thought' && block.text.trim(),
  );
  // A recorded message boundary can be a question pause or a tool handoff.
  // Only an actual answer (or interruption) ends the response for the reader.
  if (
    active ||
    !settled ||
    (!interrupted && (!hasAnswer || !['end_turn', 'stop', 'completed'].includes(reason ?? '')))
  )
    return null;
  const status =
    reason === 'cancelled'
      ? 'Cancelled'
      : ['error', 'failed', 'interrupted'].includes(reason ?? '')
        ? 'Interrupted'
        : ['end_turn', 'stop', 'completed'].includes(reason ?? '')
          ? 'Done'
          : settled
            ? 'Finished'
            : undefined;
  const usage = message.usage;
  const facts = [
    usage && (usage.input > 0 || usage.output > 0)
      ? `${compactTokens(usage.input)} in / ${compactTokens(usage.output)} out`
      : undefined,
    message.cost_usd !== undefined ? `$${formatNumber(message.cost_usd, 4)}` : undefined,
    toolCount > 0
      ? `${toolCount}${failedToolCount > 0 ? ` (${failedToolCount} failed)` : ''} ${toolCount === 1 ? 'tool call' : 'tool calls'}`
      : undefined,
  ].filter(Boolean);
  const timestamp = message.completed_at ?? message.created_at;
  return (
    <div
      className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem] text-muted-foreground"
      data-slot="message-completion-footer"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 [&>span+span]:border-l [&>span+span]:border-border [&>span+span]:pl-3">
        {status ? (
          <span className={status === 'Done' ? 'font-medium text-success' : 'font-medium'}>
            {status}
          </span>
        ) : null}
        {settled ? facts.map((fact) => <span key={fact}>{fact}</span>) : null}
      </div>
      {children}
      <time dateTime={timestamp} className="shrink-0" title={formatDateTime(timestamp)}>
        {formatClockTime(timestamp)}
      </time>
    </div>
  );
}

function compactTokens(value: number): string {
  return value >= 1000 ? `${formatNumber(value / 1000, 1)}K` : formatNumber(value);
}
