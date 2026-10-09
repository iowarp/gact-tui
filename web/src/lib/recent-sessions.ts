import type { Session } from '@clio/core/v3';
import { isManagedChildSession } from './session-state';

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
  return !isManagedChildSession(session);
}

/**
 * Titles shared by more than one of `sessions`, so their rows can be told apart.
 * Every session is listed, including ones without messages yet; two with the
 * same name are otherwise indistinguishable in the sidebar.
 */
export function duplicateSessionTitles(sessions: readonly Session[]): Set<string> {
  const counts = new Map<string, number>();
  for (const session of sessions) {
    const title = session.title.trim();
    counts.set(title, (counts.get(title) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([title]) => title));
}

export function sessionInteractionAt(session: Session): string {
  return session.last_interaction_at || session.updated_at;
}
