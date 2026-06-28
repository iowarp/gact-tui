/**
 * Type definitions for Roadmap.
 */
import type { Client } from '@clio/core';

export interface ClientPageProps {
  client: Client;
  context?: { sessionId?: string; workspaceId?: string };
}

export function catalogScope(context?: ClientPageProps['context']) {
  return {
    ...(context?.sessionId ? { session_id: context.sessionId } : {}),
    ...(context?.workspaceId ? { workspace_id: context.workspaceId } : {}),
  };
}
