import type { Session } from '@clio/core/v3';

export function sessionPath(session: Session): string {
  return `/workspaces/${encodeURIComponent(session.workspace_id)}/sessions/${encodeURIComponent(session.id)}`;
}
