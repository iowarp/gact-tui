import type { Session, Workspace } from '@clio/core/v3';
import { isPrimarySession, sessionInteractionAt } from './recent-sessions';

export interface ConnectionSessionTarget {
  session: Session;
  workspace: Workspace;
}

const INTERNAL_SESSION_TITLE_PREFIX = '__CLIO dev ';

/** Internal qualification sessions must never become a user's entry composer. */
function isReusableEntrySession(session: Session): boolean {
  return (
    isPrimarySession(session) &&
    !session.archived &&
    session.message_count === 0 &&
    !session.active_blueprint_id &&
    !session.title.startsWith(INTERNAL_SESSION_TITLE_PREFIX)
  );
}

/** Resolve the newest reusable empty base-agent session in one workspace. */
export function emptyConnectionSessionTarget(
  workspace: Workspace,
  sessions: readonly Session[],
): ConnectionSessionTarget | undefined {
  const session = sessions
    .filter(
      (candidate) =>
        candidate.workspace_id === workspace.id &&
        isReusableEntrySession(candidate),
    )
    .toSorted((left, right) => right.created_at.localeCompare(left.created_at))[0];
  return session ? { session, workspace } : undefined;
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

/** Resolve a remembered workspace route only when both entities still exist. */
export function connectionSessionTargetForRoute(
  route: string,
  workspaces: readonly Workspace[],
  sessions: readonly Session[],
): ConnectionSessionTarget | undefined {
  const match = /^\/workspaces\/([^/]+)\/sessions\/([^/?#]+)$/u.exec(route);
  if (!match?.[1] || !match[2]) return undefined;
  let workspaceId: string;
  let sessionId: string;
  try {
    workspaceId = decodeURIComponent(match[1]);
    sessionId = decodeURIComponent(match[2]);
  } catch {
    return undefined;
  }
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
