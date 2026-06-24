/**
 * View-model / pure logic for Mcp Page: state shaping and helpers, no DOM. Key export `filterMcpServers`.
 */
import type { McpServerInfo } from '@clio/core';

export function filterMcpServers(
  servers: McpServerInfo[],
  query: string,
): McpServerInfo[] {
  const q = query.trim().toLowerCase();
  if (!q) return servers;
  return servers.filter(
    (server) =>
      server.id.toLowerCase().includes(q) ||
      server.name.toLowerCase().includes(q) ||
      (server.tools ?? []).some((tool) => tool.toLowerCase().includes(q)),
  );
}

export function isReconnectUnsupportedError(error: unknown): boolean {
  return (error as { status?: number } | null)?.status === 404;
}
