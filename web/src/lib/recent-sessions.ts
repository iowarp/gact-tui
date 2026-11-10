import type { Session } from '@clio/core/v3';
import { isManagedChildSession } from './session-state';

const DEFAULT_RECENT_LIMIT = 8;

/** The session kinds a person opens from lists (``kinds=`` of a server page). */
export const PRIMARY_SESSION_KINDS = ['conversation', 'branch'] as const;
const SEARCH_LIMIT = 20;

export function visibleWorkspaceSessions(
  sessions: readonly Session[],
  workspaceId: string,
  query: string,
  limit = DEFAULT_RECENT_LIMIT,
): Session[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const candidates = sessions
    .filter((session) => session.workspace_id === workspaceId && isPrimarySession(session))
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
  return (
    session.session_kind !== 'agent' &&
    session.session_kind !== 'lookup' &&
    !isManagedChildSession(session)
  );
}

export function sessionInteractionAt(session: Session): string {
  return session.last_interaction_at || session.updated_at;
}
