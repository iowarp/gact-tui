/**
 * Demo/fixture data (demo Permission) for offline rendering and visual tests; not used against a live backend.
 */
import type { PermissionRequest } from '@clio/core';

export function demoPermission(): PermissionRequest {
  return {
    id: 'p-1',
    session_id: 's3',
    tool_name: 'WriteFile',
    risk: 'medium',
    reason: 'WriteFile touches the workspace; review the path before approving.',
    created_at: new Date().toISOString(),
    tool_call: {
      input: { path: 'src/handlers.go', mode: 'overwrite' },
    },
  };
}
