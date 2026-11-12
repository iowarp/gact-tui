import type { Message } from '@clio/core/v3';
import type { ReactElement } from 'react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { KeyValueGrid } from './primitives/key-value-grid';
import { replyUsedRows, type ReplyToolCounts } from './message-reply-facts';
/**
 * "This reply used": the agent, model, behavior and usage behind one answer.
 * The card's content mounts only while it is open.
 */
export function MessageReplyCard({
  message,
  agentName,
  counts,
  children,
}: {
  message: Message;
  agentName?: string;
  counts: ReplyToolCounts;
  children: ReactElement;
}) {
  return (
    <HoverCard openDelay={350} closeDelay={120}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        align="start"
        side="bottom"
        className="w-[min(340px,calc(100vw-24px))] px-1 py-1.5"
        data-slot="message-reply-card"
      >
        <ReplyUsedDetails message={message} agentName={agentName} counts={counts} />
      </HoverCardContent>
    </HoverCard>
  );
}

function ReplyUsedDetails({
  message,
  agentName,
  counts,
}: {
  message: Message;
  agentName?: string;
  counts: ReplyToolCounts;
}) {
  const { setup, usage } = replyUsedRows(message, agentName, counts);
  return (
    <section aria-label="This reply used">
      <p className="px-2 pt-1 pb-1.5 text-caption text-muted-foreground">This reply used</p>
      <KeyValueGrid variant="card" items={setup} />
      {usage.length ? (
        <>
          <div className="my-1 border-t border-border" role="separator" />
          <KeyValueGrid variant="card" items={usage} />
        </>
      ) : null}
    </section>
  );
}
