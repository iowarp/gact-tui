const LAST_WORKSPACE_ROUTE = 'clio.last-workspace-route';

function connectionRouteKey(endpoint: string): string {
  return `${LAST_WORKSPACE_ROUTE}:${encodeURIComponent(endpoint)}`;
}

export function rememberWorkspaceRoute(
  endpoint: string,
  workspaceId: string,
  sessionId: string,
): void {
  localStorage.setItem(
    connectionRouteKey(endpoint),
    `/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}`,
  );
}

export function rememberValidatedWorkspaceRoute(
  endpoint: string,
  workspaceId: string,
  session: { id: string; workspace_id: string } | undefined,
): boolean {
  if (!session || session.workspace_id !== workspaceId) return false;
  rememberWorkspaceRoute(endpoint, workspaceId, session.id);
  return true;
}

export function lastWorkspaceRoute(endpoint: string): string {
  const key = connectionRouteKey(endpoint);
  const persistent = localStorage.getItem(key);
  if (persistent) return persistent;
  const previousSessionValue = sessionStorage.getItem(key);
  if (previousSessionValue) {
    localStorage.setItem(key, previousSessionValue);
    return previousSessionValue;
  }
  return '/';
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

export function workspaceIdFromRoute(route: string): string | undefined {
  const match = /^\/workspaces\/([^/]+)\/sessions\//u.exec(route);
  if (!match?.[1]) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
}

export function sessionIdFromRoute(route: string): string | undefined {
  const match = /^\/workspaces\/[^/]+\/sessions\/([^/?#]+)/u.exec(route);
  if (!match?.[1]) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
}
