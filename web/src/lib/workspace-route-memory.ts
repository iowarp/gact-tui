const LAST_WORKSPACE_ROUTE = 'clio.last-workspace-route';

function connectionRouteKey(endpoint: string): string {
  return `${LAST_WORKSPACE_ROUTE}:${encodeURIComponent(endpoint)}`;
}

export function rememberWorkspaceRoute(
  endpoint: string,
  workspaceId: string,
  sessionId: string,
): void {
  sessionStorage.setItem(
    connectionRouteKey(endpoint),
    `/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}`,
  );
}

export function lastWorkspaceRoute(endpoint: string): string {
  return sessionStorage.getItem(connectionRouteKey(endpoint)) || '/';
}

export function returnRouteFromState(state: unknown, endpoint: string): string {
  if (state && typeof state === 'object' && 'from' in state && 'endpoint' in state) {
    const { from, endpoint: sourceEndpoint } = state as {
      from?: unknown;
      endpoint?: unknown;
    };
    if (
      sourceEndpoint === endpoint &&
      typeof from === 'string' &&
      from.startsWith('/workspaces/')
    ) {
      return from;
    }
  }
  return lastWorkspaceRoute(endpoint);
}
