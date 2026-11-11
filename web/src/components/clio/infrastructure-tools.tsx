import type {
  McpServerDefinition,
  PluginEntry,
  ToolCatalogItem,
  ToolPermission,
} from '@clio/core/v3';
import { useQueries } from '@tanstack/react-query';
import { SearchIcon } from 'lucide-react';
import { useMemo, useRef, useState, type RefObject } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { useSeenInView } from '@/hooks/use-seen-in-view';
import { usePluginCatalog } from '@/hooks/use-session-agent';
import { connectionScope } from '@/lib/connection-scope';
import { useConnectionSettings } from '@/providers/connection-provider';
import { vocab } from '@/lib/brand-vocabulary';
import { CatalogToolset } from './catalog-toolset';
import { effectivePermission } from './plugin-tool-settings-text';
import { toolSourceCounts, type ToolSource } from './catalog-tool-bundles';
import { InfraFilterMenu, InfraSearchField } from './infrastructure-filter-menu';
import { InfraTabActions } from './infrastructure-tab-actions';
import { IconButton } from './primitives/icon-button';
import { SegmentedControl } from './primitives/segmented-control';
import { StateView } from './primitives/state-view';

type ToolScope = 'session' | 'agent';

const SCOPE_OPTIONS = [
  { value: 'session', label: 'This session' },
  { value: 'agent', label: 'All agent tools' },
] as const;

interface ToolPermissions {
  permissions: ReadonlyMap<string, ToolPermission>;
  /** Tools whose plugin's settings have not been read yet. */
  checking: ReadonlySet<string>;
}

/** The plugin (by ref) whose tool settings hold each tool, by tool name. */
function toolOwners(
  tools: readonly ToolCatalogItem[],
  servers: readonly McpServerDefinition[],
  plugins: readonly PluginEntry[],
): ReadonlyMap<string, string> {
  const owners = new Map<string, string>();
  for (const tool of tools) {
    const server = tool.server_id ?? undefined;
    const serverPlugin = server && servers.find((entry) => entry.id === server)?.plugin;
    const owner =
      plugins.find((plugin) => plugin.tools.includes(tool.name)) ??
      (server ? plugins.find((plugin) => plugin.mcp_servers.includes(server)) : undefined) ??
      (serverPlugin ? plugins.find((plugin) => plugin.id === serverPlugin) : undefined);
    if (owner) owners.set(tool.name, owner.ref);
  }
  return owners;
}

/**
 * Each tool's permission as Settings › Tools shows it in the agent's first
 * approval mode, by tool name. A plugin's settings are read once one of its
 * tools comes near view (`data-tool-name` rows inside `container`). Shares
 * Settings' queries, so either page fills the other's cache.
 */
function useToolPermissions(
  tools: readonly ToolCatalogItem[],
  servers: readonly McpServerDefinition[],
  container: RefObject<HTMLElement | null>,
  layout: string,
): ToolPermissions {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const scope = connectionScope(settings);
  const catalog = usePluginCatalog().data?.plugins;
  const owners = useMemo(
    () => toolOwners(tools, servers, catalog ?? []),
    [catalog, servers, tools],
  );
  const plugins = useMemo(
    () => (catalog ?? []).filter((plugin) => [...owners.values()].includes(plugin.ref)),
    [catalog, owners],
  );
  const seen = useSeenInView(container, 'data-tool-name', layout);
  const wanted = useMemo(
    () => new Set([...owners].flatMap(([name, ref]) => (seen.has(name) ? [ref] : []))),
    [owners, seen],
  );
  const results = useQueries({
    queries: plugins.map((plugin) => ({
      queryKey: ['tool-settings', scope, plugin.ref],
      queryFn: ({ signal }: { signal: AbortSignal }) => repository.toolSettings(plugin.ref, signal),
      enabled: wanted.has(plugin.ref),
    })),
  });
  const permissions = new Map<string, ToolPermission>();
  const unread = new Set<string>();
  results.forEach(({ data, isPending }, index) => {
    if (isPending) unread.add(plugins[index].ref);
    if (!data) return;
    const mode = data.approval_modes[0] ?? 'ask';
    for (const tool of data.tools) {
      permissions.set(tool.name, effectivePermission(tool, mode).value);
    }
  });
  const checking = new Set([...owners].flatMap(([name, ref]) => (unread.has(ref) ? [name] : [])));
  return { permissions, checking };
}

/** Keep actual session availability distinct from browsing the agent catalog. */
export function InfrastructureTools({
  sessionId,
  sessionScoped,
  pending,
  tools,
  servers,
  onScope,
}: {
  sessionId?: string;
  sessionScoped: boolean;
  pending: boolean;
  tools: ToolCatalogItem[];
  servers: McpServerDefinition[];
  onScope: (scope: ToolScope) => void;
}) {
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<ToolSource>('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  // Rows (`data-tool-name`) are replaced when the list or its filters change.
  const layout = `${pending}\n${source}\n${query}\n${tools.map((tool) => tool.name).join('\n')}`;
  const { permissions, checking } = useToolPermissions(tools, servers, container, layout);
  const counts = useMemo(() => toolSourceCounts(tools, servers, query), [query, servers, tools]);
  const clearFilters = () => {
    setQuery('');
    setSource('all');
  };
  return (
    <>
      <InfraTabActions>
        {sessionId ? (
          <SegmentedControl
            label="Tool scope"
            onValueChange={onScope}
            options={SCOPE_OPTIONS}
            value={sessionScoped ? 'session' : 'agent'}
          />
        ) : null}
        {tools.length ? (
          <InfraFilterMenu
            label="Tool source"
            onValueChange={setSource}
            options={[
              { value: 'all', label: 'All', count: counts.all },
              { value: 'builtin', label: 'Built in', count: counts.builtin },
              { value: 'mcp', label: 'MCP', count: counts.mcp },
            ]}
            value={source}
          />
        ) : null}
        {searchOpen || query ? (
          <InfraSearchField
            autoFocus={searchOpen}
            className="w-[180px]"
            label="Search tools"
            onEscape={() => setSearchOpen(false)}
            onValueChange={setQuery}
            placeholder="Search tools"
            value={query}
          />
        ) : (
          <IconButton
            icon={<SearchIcon />}
            label="Search tools"
            onClick={() => setSearchOpen(true)}
          />
        )}
      </InfraTabActions>
      {pending ? (
        <StateView kind="loading" size="row" title="Loading tool catalog" />
      ) : tools.length ? (
        <div className="contents" ref={container}>
          <CatalogToolset
            checking={checking}
            onClearFilters={clearFilters}
            permissions={permissions}
            query={query}
            servers={servers}
            source={source}
            tools={tools}
          />
        </div>
      ) : (
        <StateView
          action={
            sessionScoped
              ? { label: 'Browse all agent tools', onClick: () => onScope('agent') }
              : undefined
          }
          kind="empty"
          size="row"
          title={
            sessionScoped
              ? `This session has not recorded an effective ${vocab.agent} toolset yet.`
              : `${vocab.agent} has not reported any tools.`
          }
        />
      )}
    </>
  );
}
