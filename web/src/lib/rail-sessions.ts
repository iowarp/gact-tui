import type { Session } from '@clio/core/v3';
import { sessionInteractionAt } from './recent-sessions';

/**
 * The rail's rows: paged rows merged with live rows, newest interaction first.
 *
 * A live row wins over its paged copy. While older pages remain (`hasMore`), a
 * live row that no page holds joins only inside the loaded window (newer than the
 * oldest paged row), so the rail never shows more than it has paged in; a new
 * conversation still appears at once.
 */
export function mergeRailSessions(
  paged: readonly Session[] | undefined,
  live: readonly Session[],
  workspaceId: string,
  hasMore: boolean,
): Session[] {
  const byId = new Map<string, Session>();
  for (const session of paged ?? []) byId.set(session.id, session);
  let oldestLoaded = '';
  for (const session of byId.values()) {
    const at = sessionInteractionAt(session);
    if (!oldestLoaded || at < oldestLoaded) oldestLoaded = at;
  }
  for (const session of live) {
    if (session.workspace_id !== workspaceId) continue;
    if (
      byId.has(session.id) ||
      !hasMore ||
      paged === undefined ||
      sessionInteractionAt(session) >= oldestLoaded
    ) {
      byId.set(session.id, session);
    }
  }
  return [...byId.values()].toSorted((left, right) =>
    sessionInteractionAt(right).localeCompare(sessionInteractionAt(left)),
  );
}
