import type { PluginEntry } from '@clio/core/v3';
import { plural, t } from '@lingui/core/macro';
import { formatList } from '@/lib/locale-format';

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

/** Each kind's count, as a whole message per kind so every language can inflect it. */
const KIND_COUNTS = {
  plugin: (n: number) => plural(n, { one: '# plugin', other: '# plugins' }),
  skill: (n: number) => plural(n, { one: '# skill', other: '# skills' }),
  server: (n: number) => plural(n, { one: '# MCP server', other: '# MCP servers' }),
  otherServer: (n: number) =>
    plural(n, { one: '# other MCP server', other: '# other MCP servers' }),
  tool: (n: number) => plural(n, { one: '# tool', other: '# tools' }),
  agent: (n: number) => plural(n, { one: '# agent', other: '# agents' }),
  flow: (n: number) => plural(n, { one: '# flow', other: '# flows' }),
  fragment: (n: number) => plural(n, { one: '# prompt fragment', other: '# prompt fragments' }),
  hook: (n: number) => plural(n, { one: '# hook', other: '# hooks' }),
  command: (n: number) => plural(n, { one: '# command', other: '# commands' }),
  catalog: (n: number) => plural(n, { one: '# UI catalog', other: '# UI catalogs' }),
} as const;

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
  const add = (n: number | undefined, kind: keyof typeof KIND_COUNTS) => {
    if (n) parts.push(KIND_COUNTS[kind](n));
  };
  add(plugin?.members?.length, 'plugin');
  add(plugin?.skills?.length, 'skill');
  if (connector) {
    const tools = connector.tool_count;
    parts.push(
      tools
        ? plural(tools, { one: '1 MCP server (# tool)', other: '1 MCP server (# tools)' })
        : t`1 MCP server`,
    );
  }
  const servers = (plugin?.mcp_servers ?? []).filter((name) => name !== connector?.id);
  add(servers.length, connector ? 'otherServer' : 'server');
  add(plugin?.tools?.length, 'tool');
  add(plugin?.subagents?.length, 'agent');
  add(plugin?.flows?.length, 'flow');
  add(plugin?.fragments?.length, 'fragment');
  add(plugin?.hooks?.length, 'hook');
  add(plugin?.commands?.length, 'command');
  add(plugin?.catalogs?.length, 'catalog');
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
  const kinds = formatList(parts, { and: true });
  return parts.length
    ? t`Brings ${kinds} to this conversation`
    : t`Adds it to this conversation only`;
}
