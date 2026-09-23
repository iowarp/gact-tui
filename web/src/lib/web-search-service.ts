/**
 * Frontend connection contract for CLIO Web Search.
 * Deployment artifacts and pins deliberately live only in CLIO's Python
 * infrastructure drivers; the UI consumes the endpoint CLIO reports.
 */

/** Portable launcher installed remotely and resolved from the bundled runtime locally. */
export const WEB_MCP_COMMAND = 'clio-kit';

/** Writable state location inside CLIO's already-allowed child-cache root. */
export const WEB_MCP_ENV = { WEB_STATE_DIR: '.clio-child-cache/web-mcp-state' } as const;

/** Host port the HTTP API is published on. */
export const WEB_SEARCH_HTTP_PORT = 8089;

/** Where a locally deployed service answers. */
export const WEB_SEARCH_DEFAULT_LOCAL_URL = `http://127.0.0.1:${WEB_SEARCH_HTTP_PORT}`;

/** Arguments that point the installer-bundled MCP adapter at a deployed service. */
export function webSearchMcpArgs(remoteUrl: string): string[] {
  return ['mcp-server', 'web', '--remote-url', remoteUrl];
}
