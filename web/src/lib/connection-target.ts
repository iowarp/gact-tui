import type { Session, Workspace } from '@clio/core/v3';
import { sessionInteractionAt } from './recent-sessions';

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
    .flatMap((session): ConnectionSessionTarget[] => {
      const workspace = workspacesById.get(session.workspace_id);
      return workspace ? [{ session, workspace }] : [];
    })
    .toSorted((left, right) =>
      sessionInteractionAt(right.session).localeCompare(sessionInteractionAt(left.session)),
    )[0];
}

export function connectionSessionRoute(target: ConnectionSessionTarget): string {
  return `/workspaces/${encodeURIComponent(target.workspace.id)}/sessions/${encodeURIComponent(target.session.id)}`;
}
