import type { Session } from '@clio/core/v3';
import { pluginPageRouteForContext } from '@/lib/a2ui/plugin-pages';

export function sessionPath(session: Session): string {
  // A plugin page's context belongs to no conversation: its requests open the page.
  if (session.session_kind === 'page') {
    const page = pluginPageRouteForContext(session.id);
    if (page) return page;
  }
  return `/workspaces/${encodeURIComponent(session.workspace_id)}/sessions/${encodeURIComponent(session.id)}`;
}
