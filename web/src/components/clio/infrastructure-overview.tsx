import type { InfrastructureInventory, McpUserConfiguration } from '@clio/core/v3';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRightIcon, BotIcon, CpuIcon, GlobeIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useRepository } from '@/hooks/use-repository';
import { useSavedServers } from '@/hooks/use-saved-servers';
import { useConnectionSettings } from '@/providers/connection-provider';
import { Button } from '@/components/ui/button';
import { ManagedServiceHostSelector } from './managed-service-host-selector';
import { ManagedServiceHostFacts } from './managed-service-host-facts';
import { displayHostPath } from '@/lib/host-path-display';
import { vocab } from '@/lib/brand-vocabulary';
import { InfrastructureTopology } from './infrastructure-topology';
import { remoteUrlFromSpec } from './web-search-configuration';
import { infrastructureServiceName } from '@/lib/infrastructure-service-labels';
import { ClioStatus, type ClioStatusValue } from './status';
import { managedServiceStatus } from '@/lib/managed-service-status';
import { TechnicalDetails } from './technical-details';

/** Read actual capabilities from the same inspection/cache used by Services. */
export function InfrastructureHostInspection({ targetId }: { targetId: string }) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const query = useQuery({
    queryKey: ['managed-service-catalog', settings.endpoint, targetId],
    queryFn: ({ signal }) => repository.managedServiceCatalog(targetId, signal),
    retry: false,
    staleTime: 30_000,
  });
  return (
    <section className="py-2" aria-label="Computer capabilities">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Computer capabilities</h2>
        <Button
          size="sm"
          variant="outline"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {query.isFetching ? 'Inspecting…' : 'Inspect again'}
        </Button>
      </div>
      {query.error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          Could not inspect this computer. Check its connection, then try again.
        </p>
      ) : null}
      {query.error ? (
        <TechnicalDetails className="mt-2 text-xs" title="Inspection details">
          <pre className="clio-scrollbar max-h-48 overflow-auto whitespace-pre-wrap break-words">
            {query.error.message}
          </pre>
        </TechnicalDetails>
      ) : null}
      {query.data ? (
        <>
          <ManagedServiceHostFacts facts={query.data.facts} />
          <details className="mt-3 text-xs text-muted-foreground">
            <summary className="cursor-pointer">Computer identity & paths</summary>
            {query.data.facts.hostname ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Computer: {query.data.facts.hostname}
              </p>
            ) : null}
            {query.data.facts.home ? (
              <p className="mt-1 break-all text-xs text-muted-foreground">
                Home: {displayHostPath(query.data.facts.home)}
              </p>
            ) : null}
          </details>
        </>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          {query.error ? 'Use Inspect again to retry.' : 'Reading this computer’s capabilities…'}
        </p>
      )}
    </section>
  );
}

/** A map first, clear routes to each role, and computer diagnostics on demand. */
export function InfrastructureOverview({
  data,
  targetId,
  onTarget,
  webSearch,
  webSearchConnected = false,
  onManageWebSearch,
}: {
  data: InfrastructureInventory;
  targetId: string;
  onTarget: (id: string) => void;
  webSearch?: McpUserConfiguration;
  webSearchConnected?: boolean;
  onManageWebSearch?: () => void;
}) {
  const { settings } = useConnectionSettings();
  const { servers } = useSavedServers();
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const research = webResearchRow(data, webSearch, webSearchConnected);
  const rows: {
    label: string;
    icon: typeof BotIcon;
    detail: string;
    description: string;
    action: string;
    status?: string;
    state: ClioStatusValue;
    to?: string;
    onClick?: () => void;
  }[] = [
    {
      label: 'Agent',
      icon: BotIcon,
      detail: settings.label || vocab.agent,
      description: 'Sessions and tools run here.',
      action: 'Inspect agent',
      status: 'Connected',
      state: 'healthy',
      to: '/infrastructure/agent',
    },
    {
      label: 'Inference',
      icon: CpuIcon,
      detail: servers.data?.length
        ? `${servers.data.length} saved model ${servers.data.length === 1 ? 'server' : 'servers'}`
        : 'Providers and model servers',
      description: 'Connect an API or a model server on any host.',
      action: 'Model providers',
      status: undefined,
      state: 'unavailable',
      to: '/settings/providers',
    },
    {
      label: 'Web research',
      icon: GlobeIcon,
      ...research,
      onClick: research.to ? undefined : onManageWebSearch,
      to: research.to ?? (onManageWebSearch ? undefined : '/infrastructure/services'),
    },
  ];
  return (
    <div className="mt-6 space-y-5">
      <InfrastructureTopology
        data={data}
        agentLabel={settings.label || vocab.agent}
        endpoint={settings.endpoint}
      />
      <section aria-label="Manage your setup">
        <p className="text-xs text-muted-foreground">
          Each service can use a different host. Your agent connection stays the same.
        </p>
        <div className="mt-3 divide-y border-y">
          {rows.map(
            ({ label, icon: Icon, detail, description, action, to, onClick, status, state }) => (
              <div
                key={label}
                className="grid items-center gap-3 py-3 sm:grid-cols-[9rem_minmax(0,1fr)_auto]"
              >
                <div className="flex items-center gap-3 font-medium">
                  <Icon className="size-4 text-primary" />
                  {label}
                </div>
                <div className="min-w-0">
                  <p className="break-words text-sm" title={detail}>
                    {detail}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{description}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-self-end">
                  {status ? <ClioStatus label={status} value={state} /> : null}
                  {to ? (
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="w-fit justify-self-start sm:justify-self-end"
                    >
                      <Link to={to}>
                        {action}
                        <ArrowRightIcon />
                      </Link>
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-fit justify-self-start sm:justify-self-end"
                      onClick={onClick}
                    >
                      {action}
                      <ArrowRightIcon />
                    </Button>
                  )}
                </div>
              </div>
            ),
          )}
        </div>
      </section>
      {servers.data?.length ? (
        <details className="border-b pb-4">
          <summary className="cursor-pointer text-sm font-medium">
            Saved model servers · {servers.data.length}
          </summary>
          <div className="mt-3 divide-y">
            {servers.data.map((server) => (
              <div key={server.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <span className="font-medium">{server.label}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {server.address}
                </span>
                <span className="text-xs text-muted-foreground">
                  {server.check
                    ? server.check.reachable
                      ? 'Reachable'
                      : 'Not reachable'
                    : 'Not checked'}
                </span>
              </div>
            ))}
          </div>
        </details>
      ) : null}
      {servers.error ? (
        <p role="alert" className="text-sm text-destructive">
          Saved model servers could not load: {servers.error.message}
        </p>
      ) : null}
      <details
        className="border-b pb-4"
        open={inspectionOpen}
        onToggle={(event) => setInspectionOpen(event.currentTarget.open)}
      >
        <summary className="cursor-pointer text-sm font-medium">Computer details</summary>
        <section className="mt-4 space-y-3" aria-label="Computer inspection">
          <ManagedServiceHostSelector
            targets={data.targets}
            targetId={targetId}
            onSelect={onTarget}
          />
          {inspectionOpen ? <InfrastructureHostInspection targetId={targetId} /> : null}
        </section>
      </details>
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link to="/infrastructure/agent">Manage computers</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/infrastructure/models">Download models & manage storage</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link to="/infrastructure/activity">
            View activity
            <ArrowRightIcon />
          </Link>
        </Button>
      </div>
    </div>
  );
}

/**
 * Web research reads the same records as Services: a connected research service
 * first, then the agent's built-in search engine and what its record says it is.
 */
function webResearchRow(
  data: InfrastructureInventory,
  webSearch: McpUserConfiguration | undefined,
  connected: boolean,
): {
  detail: string;
  description: string;
  action: string;
  status: string;
  state: ClioStatusValue;
  to?: string;
} {
  const description = 'Add source reading and research tools to your agent.';
  if (connected)
    return {
      detail: remoteUrlFromSpec(webSearch?.spec) || 'Connected',
      description,
      action: 'Manage web research',
      status: 'Connected',
      state: 'healthy',
    };
  if (webSearch?.configured)
    return {
      detail: 'Needs attention',
      description,
      action: 'Manage web research',
      status: 'Needs attention',
      state: 'degraded',
    };
  const builtIn = data.services.find(
    (row) => row.target_id === 'local' && row.service_id === 'searxng',
  );
  if (builtIn) {
    const status = managedServiceStatus(builtIn);
    const name = infrastructureServiceName(builtIn.service_id);
    return {
      detail: `Built-in search engine · ${name}`,
      description: status.reason ?? description,
      action:
        status.action === 'install'
          ? `Install ${name}`
          : status.action === 'start'
            ? `Start ${name}`
            : 'Manage web research',
      status: status.label,
      state: status.value,
      to: status.action ? '/infrastructure/services?target=local&service=searxng' : undefined,
    };
  }
  return {
    detail: 'No research service connected',
    description,
    action: 'Connect web research',
    status: 'Not connected',
    state: 'unavailable',
  };
}
