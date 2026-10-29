import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AgentEntry } from '@clio/core/v3';
import { Button } from '@/components/ui/button';
import { useRepository } from '@/hooks/use-repository';
import { useInstalledAgents, usePluginCatalog } from '@/hooks/use-session-agent';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';
import { queryKeys } from '@/lib/query-keys';
import { InfoIcon } from '@/lib/icon-vocabulary';
import { AgentPreviewDialog, AgentRow } from './agent-library-row';
import { InstalledPluginList } from './installed-plugin-list';
import { LocalMarketplaceDetails, SavedAgentFile } from './private-local-details';

/** Browse host-local content even when no plugin marketplace has been created yet. */
export function PrivateLocalLibrary({ onBackup }: { onBackup: () => void }) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const catalog = usePluginCatalog();
  const agents = useInstalledAgents();
  const [previewing, setPreviewing] = useState<AgentEntry>();
  const [detailsOpen, setDetailsOpen] = useState(false);
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
      <section aria-label="Saved items" className="min-w-0">
        {agents.isPending ? <p role="status">Loading agents…</p> : null}
        {agents.error ? <p role="alert">{agents.error.message}</p> : null}
        <ul className="min-w-0">
          {mine.map((agent) => (
            <AgentRow
              key={agent.ref}
              agent={agent}
              agents={agents.data ?? []}
              onPreview={() => setPreviewing(agent)}
              onViewSource={() => setSourceAgent(agent)}
              metadata="Agent"
            />
          ))}
        </ul>
        {plugins.length || catalog.isPending || catalog.error ? (
          <InstalledPluginList
            flat
            hideFilter
            hideHeading
            plugins={plugins}
            pending={catalog.isPending}
            error={catalog.error?.message}
          />
        ) : null}
        {!agents.isPending &&
        !catalog.isPending &&
        !agents.error &&
        !catalog.error &&
        !mine.length &&
        !plugins.length ? (
          <p className="py-2 text-muted-foreground">Nothing saved here yet.</p>
        ) : null}
      </section>
      <div className="flex justify-end border-t border-border/60 pt-1">
        <Button
          size="xs"
          variant="ghost"
          className="text-muted-foreground"
          onClick={() => setDetailsOpen(true)}
        >
          <InfoIcon aria-hidden="true" /> Marketplace details
        </Button>
      </div>
      {previewing ? (
        <AgentPreviewDialog agent={previewing} onClose={() => setPreviewing(undefined)} />
      ) : null}
      {detailsOpen ? (
        <LocalMarketplaceDetails
          library={local.data}
          error={local.error?.message}
          pending={local.isPending}
          onRetry={() => void local.refetch()}
          onClose={() => setDetailsOpen(false)}
          onBackup={
            plugins.length
              ? () => {
                  setDetailsOpen(false);
                  onBackup();
                }
              : undefined
          }
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
