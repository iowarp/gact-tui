import type { McpAppDescriptor, McpAppIdentity } from '@clio/core/v3';

/** The host-context key a view reads its live service address from (MA23). */
export const MCP_APP_SERVICE_CONTEXT_KEY = 'ai.iowarp.clio/service';

/**
 * The view's service URL, when CLIO carries one and it is the app's own route.
 *
 * The URL must be on the sandbox origin and name this app's capability, so a
 * view is only ever pointed at CLIO's route for itself, never at a loopback port.
 */
export function mcpAppServiceUrl(
  descriptor: McpAppDescriptor,
  identity: McpAppIdentity,
): string | undefined {
  if (!descriptor.service_url) return undefined;
  let service: URL;
  try {
    service = new URL(descriptor.service_url);
  } catch {
    return undefined;
  }
  const expectedPath =
    `/v1/sessions/${encodeURIComponent(identity.sessionId)}` +
    `/mcp-apps/${encodeURIComponent(identity.appInstanceId)}` +
    `/service/${encodeURIComponent(identity.dataRef)}/`;
  if (
    service.origin !== new URL(descriptor.sandbox_url).origin ||
    service.pathname !== expectedPath ||
    service.search ||
    service.hash
  ) {
    return undefined;
  }
  return service.href;
}

/** The host-context entry that gives a view its service address, if it has one. */
export function mcpAppServiceHostContext(
  descriptor: McpAppDescriptor,
  identity: McpAppIdentity,
): Record<string, { url: string }> {
  const url = mcpAppServiceUrl(descriptor, identity);
  return url ? { [MCP_APP_SERVICE_CONTEXT_KEY]: { url } } : {};
}
