/**
 * What `clio.mcp-app.v1` uses from the MCP App host: the live set a surface's app
 * joins (MA5, which pins its record, MA6), and the notifications a channel sends
 * the view after calling a server tool for it (MA21).
 */
import type { McpAppReopenedView } from '@clio/core/v3';
import { registerMcpAppSurface, releaseMcpAppSurface } from './mcp-app-live-set';
import type { McpAppSurfaceHandle } from './mcp-app-surface';
import type { McpAppTabTarget } from './workbench-shared';

type LiveSetRepository = Parameters<typeof registerMcpAppSurface>[1];

export function surfaceAppTarget(
  sessionId: string,
  view: McpAppReopenedView,
  label: string,
): McpAppTabTarget {
  return {
    appInstanceId: view.appInstanceId,
    dataRef: view.dataRef,
    sessionId,
    resourceUri: view.resourceUri,
    sourceServer: view.sourceServer,
    toolName: view.toolName,
    label,
  };
}

/** The app is mounted in a visible surface: it joins the live set and its record is pinned. */
export function holdSurfaceApp(target: McpAppTabTarget, repository: LiveSetRepository): void {
  registerMcpAppSurface(target, repository);
}

/** The surface's last mount went: the app closes through the existing close path (MA7). */
export function releaseSurfaceApp(appInstanceId: string): void {
  releaseMcpAppSurface(appInstanceId);
}

/**
 * After the host calls a server tool for a channel, the view receives the call's
 * input and result, as in the specification's interactive phase.
 */
export function deliverServerToolResult(
  handle: McpAppSurfaceHandle,
  args: Record<string, unknown>,
  result: unknown,
): void {
  handle.sendToolInput(args);
  handle.sendToolResult(result);
}
