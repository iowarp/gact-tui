import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AgentEntry, PluginEntry } from '@clio/core/v3';
import { useRepository } from '@/hooks/use-repository';
import { useInstalledAgents, usePluginCatalog } from '@/hooks/use-session-agent';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';
import { queryKeys } from '@/lib/query-keys';
import { AgentPreviewDialog, AgentRow } from './agent-library-row';
import { InstalledPluginList } from './installed-plugin-list';
import { ItemList } from './primitives/item-row';
import { StateView } from './primitives/state-view';
import { LocalMarketplaceDetails, SavedAgentFile } from './private-local-details';
import { t } from '@lingui/core/macro';

/** Browse host-local content even when no plugin marketplace has been created yet. */
export function PrivateLocalLibrary({
  detailsOpen,
  onDetailsClose,
  onExplore,
  selected,
}: {
  detailsOpen: boolean;
  onDetailsClose: () => void;
  /** Explore one of your plugins beside the list. */
  onExplore?: (plugin: PluginEntry) => void;
  selected?: string;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const catalog = usePluginCatalog();
  const agents = useInstalledAgents();
  const [previewing, setPreviewing] = useState<AgentEntry>();
  const [sourceAgent, setSourceAgent] = useState<AgentEntry>();
  const local = useQuery({
    // Saving/deleting an agent invalidates this same namespace, including its source files.
    queryKey: queryKeys.key(
      'agents',
      settings.endpoint,
      'local-sources',
      connectionScope(settings),
    ),
    queryFn: ({ signal }) => repository.localLibrary(signal),
    retry: false,
    enabled: detailsOpen || Boolean(sourceAgent),
  });
  const mine = agents.data?.filter((row) => row.kind === 'user') ?? [];
  const plugins = catalog.data?.plugins.filter((row) => row.marketplace === 'private-local') ?? [];
  return (
    <div className="grid min-w-0 gap-2">
      <section aria-label={t`Saved items`} className="min-w-0">
        {agents.isPending ? (
          <StateView kind="loading" size="row" title={t`Loading agents…`} />
        ) : null}
        {agents.error ? <StateView kind="error" size="row" title={agents.error.message} /> : null}
        {mine.length ? (
          <ItemList label={t`Your agents`}>
            {mine.map((agent) => (
              <AgentRow
                key={agent.ref}
                agent={agent}
                agents={agents.data ?? []}
                onPreview={() => setPreviewing(agent)}
                onViewSource={() => setSourceAgent(agent)}
                metadata={t`Agent`}
              />
            ))}
          </ItemList>
        ) : null}
        {plugins.length || catalog.isPending || catalog.error ? (
          <InstalledPluginList
            label={t`Your plugins`}
            plugins={plugins}
            pending={catalog.isPending}
            error={catalog.error?.message}
            onExplore={onExplore}
            selected={selected}
          />
        ) : null}
        {!agents.isPending &&
        !catalog.isPending &&
        !agents.error &&
        !catalog.error &&
        !mine.length &&
        !plugins.length ? (
          <StateView kind="empty" size="row" title={t`Nothing saved here yet.`} />
        ) : null}
      </section>
      {previewing ? (
        <AgentPreviewDialog agent={previewing} onClose={() => setPreviewing(undefined)} />
      ) : null}
      {detailsOpen ? (
        <LocalMarketplaceDetails
          library={local.data}
          error={local.error?.message}
          pending={local.isPending}
          onRetry={() => void local.refetch()}
          onClose={onDetailsClose}
        />
      ) : null}
      {sourceAgent ? (
        <SavedAgentFile
          agent={sourceAgent}
          source={local.data?.agents.find((source) => source.ref === sourceAgent.ref)}
          pending={local.isPending}
          error={local.error?.message}
          onRetry={() => void local.refetch()}
          onClose={() => setSourceAgent(undefined)}
        />
      ) : null}
    </div>
  );
}
