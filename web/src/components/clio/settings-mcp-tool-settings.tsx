import type { PluginEntry, ToolSettings } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { usePluginCatalog } from '@/hooks/use-session-agent';
import { connectionScope } from '@/lib/connection-scope';
import type { McpServiceEntry } from '@/lib/mcp-service-entries';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ToolSettingsBody } from './plugin-tool-settings';
import { StateView } from './primitives/state-view';
import { t, ph } from '@lingui/core/macro';

/** Where one MCP server's tool settings are read from. */
type McpToolSource =
  /** A plugin's server, or a bundled one whose tools a plugin provides. */
  | { kind: 'plugin'; ref: string; plugin: string; server?: string; names?: readonly string[] }
  /** A person's or workspace's own server, read by its name. */
  | { kind: 'server'; name: string };

function mcpToolSource(entry: McpServiceEntry, plugins: readonly PluginEntry[]): McpToolSource {
  const server = entry.server;
  if (server?.source === 'plugin' && server.plugin) {
    const plugin =
      plugins.find((item) => item.id === server.plugin && item.mcp_servers.includes(server.name)) ??
      plugins.find((item) => item.id === server.plugin);
    if (plugin) return { kind: 'plugin', ref: plugin.ref, plugin: plugin.id, server: server.name };
  }
  if (server?.transport === 'in_process' && server.tools.length) {
    const names = server.tools;
    const plugin = plugins.find((item) => names.every((name) => item.tools.includes(name)));
    if (plugin) return { kind: 'plugin', ref: plugin.ref, plugin: plugin.id, names };
  }
  return { kind: 'server', name: entry.saved?.name ?? server?.name ?? entry.name };
}

function serverShare(data: ToolSettings, source: McpToolSource): ToolSettings {
  if (source.kind !== 'plugin') return data;
  if (source.names) {
    const names = new Set(source.names);
    return {
      ...data,
      tools: data.tools.filter((tool) => names.has(tool.name)),
      servers_not_loaded: [],
    };
  }
  const server = source.server;
  return {
    ...data,
    tools: data.tools.filter((tool) => tool.server === server),
    servers_not_loaded: data.servers_not_loaded.filter((name) => name === server),
  };
}

/**
 * One MCP server's tools with the same rows as the Tools page: permission, I/O and
 * what a call does, each opening its details. An agent that can't report them for
 * this server keeps the plain list (`fallback`).
 */
export function McpServerToolSettings({
  entry,
  title,
  fallback,
}: {
  entry: McpServiceEntry;
  title: string;
  fallback: ReactNode;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const scope = connectionScope(settings);
  const plugins = usePluginCatalog();
  const waiting = plugins.isPending && plugins.fetchStatus !== 'idle';
  const source = waiting ? undefined : mcpToolSource(entry, plugins.data?.plugins ?? []);
  const view = useQuery({
    enabled: Boolean(source),
    queryKey: [
      'tool-settings',
      scope,
      source?.kind === 'plugin' ? source.ref : `server:${source?.name ?? ''}`,
    ],
    queryFn: ({ signal }) =>
      source!.kind === 'plugin'
        ? repository.toolSettings(source!.ref, signal)
        : repository.serverToolSettings(source!.name, signal),
    // An agent without per-server settings answers 404 or 422; the plain list stands in.
    retry: source?.kind === 'plugin' ? undefined : false,
  });
  const data = view.data && source ? serverShare(view.data, source) : undefined;
  if (!source || view.isPending)
    return <StateView kind="loading" size="row" title={t`Loading tool settings…`} />;
  if (view.error) {
    if (source.kind === 'plugin') {
      return (
        <div title={view.error.message}>
          <StateView
            action={{ label: t`Retry`, onClick: () => void view.refetch() }}
            kind="error"
            size="row"
            title={t`Tool settings couldn’t be loaded.`}
          />
        </div>
      );
    }
    return (
      <div className="grid min-w-0 gap-1">
        <p className="truncate text-xs text-faint" title={view.error.message}>
          {t`This agent doesn’t report permission and I/O for this server’s tools.`}
        </p>
        {fallback}
      </div>
    );
  }
  if (!data || (!data.tools.length && !data.servers_not_loaded.length)) return fallback;
  return (
    <ToolSettingsBody
      backLabel={t`All tools`}
      data={data}
      emptyTitle={t`This server reported no tools.`}
      label={t`Tools of ${title}`}
      origin={() =>
        source.kind === 'plugin'
          ? t`${title} server, from ${ph({ plugin: source.plugin })}`
          : t`${title} server`
      }
    />
  );
}
