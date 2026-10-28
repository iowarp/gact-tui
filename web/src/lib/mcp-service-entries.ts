import type { McpServerDefinition, SavedMcpService, ToolCatalogItem } from '@clio/core/v3';

/** One MCP service as the settings page shows it: the server row, its saved entry, its tools. */
export interface McpServiceEntry {
  key: string;
  name: string;
  server?: McpServerDefinition;
  saved?: SavedMcpService;
  tools: ToolCatalogItem[];
}

/**
 * Joins the server listing, the saved services and the tool catalog into one list.
 * A saved service the listing does not report yet still appears, by name.
 */
export function mcpServiceEntries(
  servers: readonly McpServerDefinition[],
  saved: readonly SavedMcpService[],
  tools: readonly ToolCatalogItem[],
): McpServiceEntry[] {
  const savedByName = new Map(saved.map((service) => [service.name, service]));
  const entries: McpServiceEntry[] = servers.map((server) => ({
    key: server.id,
    name: server.name,
    server,
    saved: server.source === 'user' ? savedByName.get(server.name) : undefined,
    tools: tools.filter(
      (tool) =>
        tool.server_id === server.id ||
        tool.source === server.id ||
        (server.tools.includes(tool.name) && !tool.server_id),
    ),
  }));
  const listed = new Set(entries.map((entry) => entry.saved?.name).filter(Boolean));
  for (const service of saved) {
    if (!listed.has(service.name))
      entries.push({ key: `saved:${service.name}`, name: service.name, saved: service, tools: [] });
  }
  return entries.sort((left, right) => rank(left) - rank(right));
}

function rank(entry: McpServiceEntry): number {
  if (entry.server?.transport === 'in_process') return 0;
  if (entry.server?.source === 'plugin') return 1;
  return 2;
}
