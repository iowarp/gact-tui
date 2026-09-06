import type { Session } from '@clio/core/v3';

const DEFAULT_RECENT_LIMIT = 8;
const SEARCH_LIMIT = 20;

export function visibleWorkspaceSessions(
  sessions: readonly Session[],
  workspaceId: string,
  query: string,
  limit = DEFAULT_RECENT_LIMIT,
): Session[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const candidates = sessions
    .filter(
      (session) => session.workspace_id === workspaceId && isWorkspaceNavigationSession(session),
    )
    .filter(
      (session) => !normalizedQuery || session.title.toLocaleLowerCase().includes(normalizedQuery),
    )
    .toSorted((left, right) =>
      sessionInteractionAt(right).localeCompare(sessionInteractionAt(left)),
    );
  if (normalizedQuery) return candidates.slice(0, SEARCH_LIMIT);
  return candidates.slice(0, limit);
}

export function isPrimarySession(session: Session): boolean {
  return !session.parent_session_id;
}

/** Keep empty landing drafts out of the durable conversation ledger. */
export function isWorkspaceNavigationSession(session: Session): boolean {
  return isPrimarySession(session) && session.message_count !== 0;
}

export function sessionInteractionAt(session: Session): string {
  return session.last_interaction_at || session.updated_at;
}
