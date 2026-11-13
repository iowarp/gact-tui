import { GitBranchIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { StateView } from './primitives/state-view';
import { isAgentFork, type ConversationForkOrigin } from './conversation-fork-origin';
import { t, ph } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';

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
  const label = origin.title || t`parent conversation`;
  const agent = isAgentFork(origin);
  const copied = origin.message_count
    ? t`History above was copied. Continue independently below.`
    : t`Started from an empty conversation.`;
  const source = workspaceId ? (
    <Link
      className="text-accent-foreground underline-offset-2 hover:underline rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      to={`/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(origin.session_id)}${origin.message_id ? `#message-${encodeURIComponent(origin.message_id)}` : ''}`}
    >
      {label}
    </Link>
  ) : (
    <span className="text-accent-foreground">{label}</span>
  );
  return (
    <div
      aria-label={t`Conversation branched here`}
      role="separator"
      data-slot="fork-checkpoint"
      className="my-px min-w-0"
      title={t`${copied} Files remain shared.`}
    >
      <StateView
        kind="marker"
        size="row"
        icon={GitBranchIcon}
        title={
          agent ? (
            <Trans>Forked here by the agent from {source}</Trans>
          ) : (
            <Trans>Forked here from {source}</Trans>
          )
        }
      >
        {agent && origin.note ? (
          <span
            className="min-w-0 truncate text-faint"
            title={t`Fork note: ${ph({ note: origin.note })}`}
          >
            {t`Fork note: ${ph({ note: origin.note })}`}
          </span>
        ) : null}
        {origin.message_count ? (
          <span className="sr-only">{t`${copied} Files remain shared.`}</span>
        ) : (
          <span className="shrink-0 text-faint">
            {copied} <span className="sr-only">{t`Files remain shared.`}</span>
          </span>
        )}
      </StateView>
    </div>
  );
}
