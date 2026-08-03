import type { SessionStatus } from '@clio/core';

/**
 * Session view-model shared by the rail and the session event handlers.
 *
 * This type previously lived in the legacy Sidebar component, which made a
 * presentation SHAPE a dependency of the wire layer that produces it. It
 * belongs here: the handlers own the shape, and any surface may render it.
 */
export interface SidebarSession {
  id: string;
  title: string;
  status: SessionStatus;
  workspace_id?: string;
  parent_session_id?: string;
  updated_at?: string;
  blueprintLabel?: string;
  [key: string]: unknown;
}
