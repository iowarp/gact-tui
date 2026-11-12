import type { Session } from '@clio/core/v3';
import { isPrimarySession, visibleWorkspaceSessions } from '@/lib/recent-sessions';
import { useRailSessionCount, useRailSessions } from '@/hooks/use-rail-sessions';
import { useHeldValue, useRailHeld } from './rail-menu-hold';

/** Which rows a conversation list shows, given its rail page and fold state. */
export function useConversationList(
  workspaceId: string,
  sessions: readonly Session[],
  open: boolean,
  expanded: boolean,
  excludedSessionIds: ReadonlySet<string>,
) {
  // The rail reads its conversations a page at a time; live rows win over a page's copy.
  const rail = useRailSessions(workspaceId, sessions, open);
  // A folded workspace never loaded its pages, so it asks only for the count.
  const foldedCount = useRailSessionCount(workspaceId, !open && rail.total === undefined);
  const railHeld = useRailHeld();
  const railRows = useHeldValue(rail.sessions, railHeld);
  const railTotal = useHeldValue(rail.total, railHeld);
  const heldFoldedCount = useHeldValue(foldedCount, railHeld);
  const railSessions = railRows.filter((session) => !session.archived && isPrimarySession(session));
  const listed = railSessions.filter((session) => !excludedSessionIds.has(session.id));
  const pinnedHere =
    railTotal === undefined && heldFoldedCount !== undefined
      ? sessions.filter(
          (session) =>
            session.workspace_id === workspaceId &&
            excludedSessionIds.has(session.id) &&
            !session.archived &&
            isPrimarySession(session),
        ).length
      : railSessions.length - listed.length;
  const total = Math.max((railTotal ?? heldFoldedCount ?? 0) - pinnedHere, listed.length);
  const visible = visibleWorkspaceSessions(
    listed,
    workspaceId,
    '',
    expanded ? listed.length : undefined,
  ).sort((left, right) => Number(right.pinned) - Number(left.pinned));
  return { rail, total, visible };
}
