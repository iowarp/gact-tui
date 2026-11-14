import type { PluginEntry } from '@clio/core/v3';

/** The connector behind an offer: its id (its server's name) and listed tool count. */
export interface OfferedConnector {
  id?: string;
  tool_count: number | null;
}

/** What a plugin row lists, counted as the offer card says it. */
type Contents = Pick<
  PluginEntry,
  | 'skills'
  | 'mcp_servers'
  | 'tools'
  | 'subagents'
  | 'flows'
  | 'fragments'
  | 'hooks'
  | 'commands'
  | 'catalogs'
  | 'members'
>;

function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "a", "a and b", "a, b and c". */
function joinWords(items: readonly string[]): string {
  if (items.length < 2) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/**
 * The kinds a plugin (or a connector and its plugin) brings, in words, non-zero kinds
 * only: "1 skill", "1 MCP server (13 tools)", "2 prompt fragments". A connector is one
 * MCP server, whether or not its plugin also declares it under the connector's id; its
 * tool count is known once it has been listed (`tool_count`). The nouns are the plugin
 * explorer's.
 */
export function offerContentParts(
  plugin: Partial<Contents> | undefined,
  connector?: OfferedConnector | null,
): string[] {
  const parts: string[] = [];
  const add = (n: number | undefined, one: string, many?: string) => {
    if (n) parts.push(count(n, one, many));
  };
  add(plugin?.members?.length, 'plugin');
  add(plugin?.skills?.length, 'skill');
  if (connector) {
    const tools = connector.tool_count;
    parts.push(`1 MCP server${tools ? ` (${count(tools, 'tool')})` : ''}`);
  }
  const servers = (plugin?.mcp_servers ?? []).filter((name) => name !== connector?.id);
  add(servers.length, connector ? 'other MCP server' : 'MCP server');
  add(plugin?.tools?.length, 'tool');
  add(plugin?.subagents?.length, 'agent');
  add(plugin?.flows?.length, 'flow');
  add(plugin?.fragments?.length, 'prompt fragment');
  add(plugin?.hooks?.length, 'hook');
  add(plugin?.commands?.length, 'command');
  add(plugin?.catalogs?.length, 'UI catalog');
  return parts;
}

/**
 * What Add changes, one line: "Brings 1 skill and 1 MCP server (13 tools) to this
 * conversation". With nothing known yet it still says where it goes.
 */
export function offerContentsLine(
  plugin: Partial<Contents> | undefined,
  connector?: OfferedConnector | null,
): string {
  const parts = offerContentParts(plugin, connector);
  return parts.length
    ? `Brings ${joinWords(parts)} to this conversation`
    : 'Adds it to this conversation only';
}
