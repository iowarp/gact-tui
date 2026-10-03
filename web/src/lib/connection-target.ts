import type { Session, Workspace } from '@clio/core/v3';
import { isPrimarySession, sessionInteractionAt } from './recent-sessions';

export interface ConnectionSessionTarget {
  session: Session;
  workspace: Workspace;
}

/** Resolve the most recently interacted-with valid session owned by one connection. */
export function latestConnectionSessionTarget(
  workspaces: readonly Workspace[],
  sessions: readonly Session[],
): ConnectionSessionTarget | undefined {
  const workspacesById = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
  return sessions
    .filter((session) => isPrimarySession(session) && !session.archived)
    .flatMap((session): ConnectionSessionTarget[] => {
      const workspace = workspacesById.get(session.workspace_id);
      return workspace ? [{ session, workspace }] : [];
    })
    .toSorted((left, right) =>
      sessionInteractionAt(right.session).localeCompare(sessionInteractionAt(left.session)),
    )[0];
}

/** The workspace and session ids a remembered route names, if it is one. */
function parseWorkspaceRoute(
  route: string,
): { sessionId: string; workspaceId: string } | undefined {
  const match = /^\/workspaces\/([^/]+)\/sessions\/([^/?#]+)$/u.exec(route);
  if (!match?.[1] || !match[2]) return undefined;
  try {
    return { sessionId: decodeURIComponent(match[2]), workspaceId: decodeURIComponent(match[1]) };
  } catch {
    return undefined;
  }
}

/**
 * The workspace a remembered route names, when it still exists.
 *
 * If the last conversation was removed, its workspace can still host the
 * presentation-only entry composer. A workspace outlives a conversation in it.
 */
export function connectionWorkspaceForRoute(
  route: string,
  workspaces: readonly Workspace[],
): Workspace | undefined {
  const parsed = parseWorkspaceRoute(route);
  return parsed ? workspaces.find((candidate) => candidate.id === parsed.workspaceId) : undefined;
}

/** Resolve a remembered workspace route only when both entities still exist. */
export function connectionSessionTargetForRoute(
  route: string,
  workspaces: readonly Workspace[],
  sessions: readonly Session[],
): ConnectionSessionTarget | undefined {
  const parsed = parseWorkspaceRoute(route);
  if (!parsed) return undefined;
  const { sessionId, workspaceId } = parsed;
  const workspace = workspaces.find((candidate) => candidate.id === workspaceId);
  const session = sessions.find(
    (candidate) =>
      candidate.id === sessionId &&
      candidate.workspace_id === workspaceId &&
      isPrimarySession(candidate) &&
      !candidate.archived,
  );
  return workspace && session ? { workspace, session } : undefined;
}

export function connectionSessionRoute(target: ConnectionSessionTarget): string {
  return `/workspaces/${encodeURIComponent(target.workspace.id)}/sessions/${encodeURIComponent(target.session.id)}`;
}
