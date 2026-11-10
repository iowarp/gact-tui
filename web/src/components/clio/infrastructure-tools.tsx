import type { McpServerDefinition, ToolCatalogItem, ToolPermission } from '@clio/core/v3';
import { useQueries } from '@tanstack/react-query';
import { SearchIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useRepository } from '@/hooks/use-repository';
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

/**
 * Each tool's permission as Settings › Tools shows it in the agent's first
 * approval mode, by tool name. Shares Settings' queries, so either page fills
 * the other's cache.
 */
const NO_PERMISSIONS: ReadonlyMap<string, ToolPermission> = new Map();

function useToolPermissions(): ReadonlyMap<string, ToolPermission> {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const scope = connectionScope(settings);
  const plugins = usePluginCatalog().data?.plugins ?? [];
  return useQueries({
    queries: plugins.map((plugin) => ({
      queryKey: ['tool-settings', scope, plugin.ref],
      queryFn: ({ signal }: { signal: AbortSignal }) => repository.toolSettings(plugin.ref, signal),
    })),
    combine: (results) => {
      // All at once: a half-loaded join would mix permissions with "Available".
      if (results.some((result) => result.isPending)) return NO_PERMISSIONS;
      const permissions = new Map<string, ToolPermission>();
      for (const { data } of results) {
        if (!data) continue;
        const mode = data.approval_modes[0] ?? 'ask';
        for (const tool of data.tools) {
          permissions.set(tool.name, effectivePermission(tool, mode).value);
        }
      }
      return permissions;
    },
  });
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
  const permissions = useToolPermissions();
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
        <CatalogToolset
          onClearFilters={clearFilters}
          permissions={permissions}
          query={query}
          servers={servers}
          source={source}
          tools={tools}
        />
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
