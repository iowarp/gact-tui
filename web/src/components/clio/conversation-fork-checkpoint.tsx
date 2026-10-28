import { GitBranchIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Checkpoint, CheckpointIcon } from '@/components/ai-elements/checkpoint';
import { isAgentFork, type ConversationForkOrigin } from './conversation-fork-origin';

/** A child-side checkpoint after the last copied message, linked to its source. */
export function ConversationForkCheckpoint({
  origin,
  workspaceId,
}: {
  origin: ConversationForkOrigin;
  workspaceId?: string;
}) {
  const label = origin.title || 'parent conversation';
  return (
    <Checkpoint
      aria-label="Conversation branched here"
      role="separator"
      data-slot="fork-checkpoint"
      className="my-5 min-w-0 gap-2 [&>[data-slot=separator]]:min-w-4 [&>[data-slot=separator]]:flex-1 [&>[data-slot=separator]]:w-auto"
    >
      <CheckpointIcon aria-hidden="true">
        <GitBranchIcon className="size-3.5" />
      </CheckpointIcon>
      <span className="min-w-0 text-xs leading-5 text-muted-foreground">
        <strong className="font-medium text-foreground">
          {isAgentFork(origin) ? 'Forked by the agent here' : 'Branched here'}
        </strong>{' '}
        from{' '}
        {workspaceId ? (
          <Link
            className="underline decoration-border underline-offset-4 hover:text-primary"
            to={`/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(origin.session_id)}${origin.message_id ? `#message-${encodeURIComponent(origin.message_id)}` : ''}`}
          >
            {label}
          </Link>
        ) : (
          label
        )}
        {isAgentFork(origin) && origin.note ? (
          <span className="block text-[11px] text-foreground">Fork note: {origin.note}</span>
        ) : null}
        <span className="block text-[11px]">
          {origin.message_count
            ? 'History above was copied. Continue independently below.'
            : 'Started from an empty conversation.'}{' '}
          Files remain shared.
        </span>
      </span>
    </Checkpoint>
  );
}
