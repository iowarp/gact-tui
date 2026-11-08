import type { McpServerDefinition, ToolCatalogItem } from '@clio/core/v3';
import { SearchIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { vocab } from '@/lib/brand-vocabulary';
import { CatalogToolset } from './catalog-toolset';
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
