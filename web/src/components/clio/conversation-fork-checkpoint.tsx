import { GitBranchIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { StateView } from './primitives/state-view';
import { isAgentFork, type ConversationForkOrigin } from './conversation-fork-origin';

/**
 * A child-side marker after the last copied message: one quiet line, "Forked
 * here from <source>", linked to the source conversation.
 */
export function ConversationForkCheckpoint({
  origin,
  workspaceId,
}: {
  origin: ConversationForkOrigin;
  workspaceId?: string;
}) {
  const label = origin.title || 'parent conversation';
  const agent = isAgentFork(origin);
  const copied = origin.message_count
    ? 'History above was copied. Continue independently below.'
    : 'Started from an empty conversation.';
  return (
    <div
      aria-label="Conversation branched here"
      role="separator"
      data-slot="fork-checkpoint"
      className="my-1.5 min-w-0"
      title={`${copied} Files remain shared.`}
    >
      <StateView
        kind="marker"
        size="row"
        icon={GitBranchIcon}
        title={
          <>
            {agent ? 'Forked here by the agent from ' : 'Forked here from '}
            {workspaceId ? (
              <Link
                className="text-accent-foreground underline-offset-2 hover:underline rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                to={`/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(origin.session_id)}${origin.message_id ? `#message-${encodeURIComponent(origin.message_id)}` : ''}`}
              >
                {label}
              </Link>
            ) : (
              <span className="text-accent-foreground">{label}</span>
            )}
          </>
        }
      >
        {agent && origin.note ? (
          <span className="min-w-0 truncate text-faint" title={`Fork note: ${origin.note}`}>
            Fork note: {origin.note}
          </span>
        ) : null}
        {origin.message_count ? (
          <span className="sr-only">{copied} Files remain shared.</span>
        ) : (
          <span className="shrink-0 text-faint">
            {copied} <span className="sr-only">Files remain shared.</span>
          </span>
        )}
      </StateView>
    </div>
  );
}
