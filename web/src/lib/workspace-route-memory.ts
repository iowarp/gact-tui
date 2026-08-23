const LAST_WORKSPACE_ROUTE = 'clio.last-workspace-route';

export function rememberWorkspaceRoute(workspaceId: string, sessionId: string): void {
  sessionStorage.setItem(
    LAST_WORKSPACE_ROUTE,
    `/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}`,
  );
}

export function lastWorkspaceRoute(): string {
  return sessionStorage.getItem(LAST_WORKSPACE_ROUTE) || '/';
}

export function returnRouteFromState(state: unknown): string {
  if (state && typeof state === 'object' && 'from' in state) {
    const from = (state as { from?: unknown }).from;
    if (typeof from === 'string' && from.startsWith('/workspaces/')) return from;
  }
  return lastWorkspaceRoute();
}
