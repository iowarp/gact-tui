import type { Message } from '@clio/core/v3';
import type { ReactNode } from 'react';

/** End-of-message facts come from the message, never the session's cumulative usage. */
export function MessageCompletionFooter({
  message,
  toolCount,
  failedToolCount = 0,
  children,
}: {
  message: Message;
  toolCount: number;
  failedToolCount?: number;
  children: ReactNode;
}) {
  const settled = Boolean(message.completed_at || message.stop_reason);
  const reason = message.stop_reason?.toLowerCase();
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
    usage ? `${compactTokens(usage.input)} in / ${compactTokens(usage.output)} out` : undefined,
    message.cost_usd !== undefined
      ? `$${message.cost_usd.toLocaleString(undefined, { maximumFractionDigits: 4 })}`
      : undefined,
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
      <time dateTime={timestamp} className="shrink-0" title={new Date(timestamp).toLocaleString()}>
        {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </time>
    </div>
  );
}

function compactTokens(value: number): string {
  return value >= 1000
    ? `${(value / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}K`
    : value.toLocaleString();
}
