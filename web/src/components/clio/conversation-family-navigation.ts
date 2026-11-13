import type { Session } from '@clio/core/v3';
import { isManagedChildSession } from '@/lib/session-state';
import { t } from '@lingui/core/macro';

/** Use the same ownership vocabulary across both family views. */
export function conversationRole(session: Session): string {
  return isManagedChildSession(session)
    ? 'Subagent'
    : session.parent_session_id
      ? t`User fork`
      : 'Conversation';
}

export function conversationHref(session: Session): string {
  return `/workspaces/${encodeURIComponent(session.workspace_id)}/sessions/${encodeURIComponent(session.id)}`;
}
