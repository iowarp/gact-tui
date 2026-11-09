import type { McpServerDefinition, ToolCatalogItem } from '@clio/core/v3';
import { PROTOCOL, capitalize, vocab } from '@/lib/brand-vocabulary';
import { toolDomainLabel } from '@/lib/tool-domain-labels';

export type ToolSource = 'all' | 'builtin' | 'mcp';

export interface ToolEntry {
  tool: ToolCatalogItem;
  /** The built-in domain ("Planning") or the MCP server's title. */
  group: string;
  server?: McpServerDefinition;
}

export interface ToolBundles {
  builtin: ToolEntry[];
  mcp: ToolEntry[];
}

/** How many tools each source holds once the search is applied. */
export function toolSourceCounts(
  tools: ToolCatalogItem[],
  servers: McpServerDefinition[],
  query: string,
): Record<ToolSource, number> {
  const bundles = toolBundles(tools, servers, query);
  return {
    all: bundles.builtin.length + bundles.mcp.length,
    builtin: bundles.builtin.length,
    mcp: bundles.mcp.length,
  };
}

export function toolBundles(
  tools: ToolCatalogItem[],
  servers: McpServerDefinition[],
  query: string,
): ToolBundles {
  const needle = query.trim().toLocaleLowerCase();
  const filtered = needle
    ? tools.filter((tool) =>
        [tool.name, tool.title, tool.description, tool.server_id]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase().includes(needle)),
      )
    : tools;
  const serverMap = new Map(servers.map((server) => [server.id, server]));
  const builtin: ToolEntry[] = [];
  const mcp: ToolEntry[] = [];
  for (const tool of filtered) {
    if (!tool.server_id) {
      builtin.push({ tool, group: clioDomain(tool) });
    } else {
      const server = serverMap.get(tool.server_id);
      mcp.push({ tool, group: serverTitle(server, tool.server_id), server });
    }
  }
  const byGroup = (left: ToolEntry, right: ToolEntry) =>
    left.group.localeCompare(right.group) || toolTitleSort(left.tool, right.tool);
  return { builtin: builtin.sort(byGroup), mcp: mcp.sort(byGroup) };
}

function clioDomain(tool: ToolCatalogItem): string {
  // The server's own declared domain (#1350) always wins; the name regex
  // below is the fallback for a tool that declared none.
  return (
    toolDomainLabel(tool.domain) ||
    clioDomainForName(tool.name) ||
    humanize(tool.server_id?.replace(/^mcp_/u, '') || 'Other')
  );
}

function clioDomainForName(name: string): string | undefined {
  const groups: Array<[RegExp, string]> = [
    [/^(fs_|shell_)/u, capitalize(vocab.workspace)],
    [/^(workspace_resource_|resource_)/u, 'Resources'],
    [/^memory_/u, 'Memory'],
    [/^(spawn_|observe_|wait_agent|get_agent|send_message|message_agent|loop_wakeup)/u, 'Agents'],
    [/^(create_artifact|update_artifact|artifact_)/u, 'Artifacts'],
    [
      /^(create_plan|update_plan|plan_|create_todo|update_todo|write_todos|create_goal|update_goal|goal_|schedule_|cron_)/u,
      'Planning',
    ],
    [/^(create_a2ui|update_a2ui|a2ui_|raise_alert_card)/u, `${PROTOCOL.a2ui} surfaces`],
    [/^(provider_|refresh_provider)/u, 'Models'],
    [/^(run_flow|run_workflow|workflow_add_step|workflow_cancel_step)/u, 'Flows'],
    [/^(log_entry|link|set_status|query_log|export_measurements)$/u, 'Science log'],
  ];
  return groups.find(([pattern]) => pattern.test(name))?.[1];
}

function serverTitle(server: McpServerDefinition | undefined, fallback: string): string {
  if (!server) return humanize(fallback.replace(/^mcp_/u, ''));
  const title = server.spec.title;
  if (typeof title === 'string' && title.trim()) return title;
  return humanize(server.name);
}

function serverDescription(server: McpServerDefinition | undefined): string | undefined {
  const description = server?.spec.description;
  return typeof description === 'string' && description.trim() ? description : undefined;
}

export function isBuiltinMcp(server: McpServerDefinition): boolean {
  return server.transport === 'in_process' || server.source === 'builtin';
}

export function domainDescription(server: McpServerDefinition): string | undefined {
  if (isBuiltinMcp(server))
    return `Included with ${vocab.agent} and available in this ${vocab.workspace}.`;
  return serverDescription(server);
}

function toolTitleSort(left: ToolCatalogItem, right: ToolCatalogItem): number {
  return (left.title || left.name).localeCompare(right.title || right.name);
}

export function toolKey(tool: ToolCatalogItem): string {
  return `${tool.server_id || tool.source || 'clio'}:${tool.name}`;
}

export function humanize(value: string): string {
  return value
    .replace(/^mcp_/u, '')
    .replaceAll(/[-_]+/gu, ' ')
    .replace(/\b\w/gu, (character) => character.toUpperCase());
}
