import { queryKeys } from '@/lib/query-keys';
import { INFRASTRUCTURE_POLL_MS } from '@/lib/runtime-limits';
import type {
  McpServerDefinition,
  RelayStatus,
  ServiceIntegrationHealth,
  ToolCatalogItem,
} from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRightIcon,
  BotIcon,
  BookOpenCheckIcon,
  CableIcon,
  ChevronLeftIcon,
  NetworkIcon,
  ServerIcon,
  WrenchIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ClioStatus, type ClioStatusValue } from '@/components/clio/status';
import { humanizeProtocolValue } from '@/components/clio/presentation-labels';
import { RelayConnectionDialog } from '@/components/clio/relay-settings';
import { TechnicalDetails } from '@/components/clio/technical-details';
import { WebSearchSetup } from '@/components/clio/web-search-setup';
import { ManagedServices } from '@/components/clio/managed-services';
import { Frame, FrameFooter, FramePanel } from '@/components/reui/frame';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CatalogToolset } from '@/components/clio/catalog-toolset';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { capitalize, vocab } from '@/lib/brand-vocabulary';
import { webSearchMcpArgs } from '@/lib/web-search-service';
import {
  returnRouteFromState,
  sessionIdFromRoute,
  workspaceIdFromRoute,
} from '@/lib/workspace-route-memory';
export function InfrastructurePage() {
  const desktop = inTauri();
  const location = useLocation();
  const { section } = useParams();
  const currentSection: InfrastructureSection = isInfrastructureSection(section)
    ? section
    : 'tools';
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const workspaceRoute = returnRouteFromState(location.state, settings.endpoint);
  const workspaceId = workspaceIdFromRoute(workspaceRoute);
  const sessionId = sessionIdFromRoute(workspaceRoute);
  const [relayOpen, setRelayOpen] = useState(false);
  const [webSearchOpen, setWebSearchOpen] = useState(false);
  const health = useQuery({
    enabled: currentSection === 'agent',
    queryKey: queryKeys.key('service-health', settings.endpoint),
    queryFn: ({ signal }) => repository.serviceHealth(signal),
    refetchInterval: INFRASTRUCTURE_POLL_MS,
  });
  const relay = useQuery({
    enabled: currentSection === 'services',
    queryKey: queryKeys.key('relay-status', settings.endpoint),
    queryFn: ({ signal }) => repository.relayStatus(signal),
    refetchInterval: INFRASTRUCTURE_POLL_MS,
  });
  const servers = useQuery({
    enabled: currentSection === 'tools' || currentSection === 'services',
    queryKey: queryKeys.key(
      'mcp-servers',
      settings.endpoint,
      workspaceId || 'infrastructure',
      sessionId || 'service',
    ),
    queryFn: ({ signal }) => repository.mcpServers(workspaceId, signal, { sessionId }),
    refetchInterval: INFRASTRUCTURE_POLL_MS,
  });
  const tools = useQuery({
    enabled: currentSection === 'tools',
    queryKey: queryKeys.key('tools', settings.endpoint, 'complete-catalog'),
    queryFn: async ({ signal }) => {
      const [builtins, live] = await Promise.all([
        repository.catalogTools(signal),
        repository.tools(signal),
      ]);
      return mergeToolCatalogs(builtins, live);
    },
    refetchInterval: INFRASTRUCTURE_POLL_MS,
  });
  const webSearchConfiguration = useQuery({
    enabled: currentSection === 'services',
    queryKey: queryKeys.key('mcp-configuration', settings.endpoint, 'web'),
    queryFn: ({ signal }) => repository.mcpConfiguration('web', signal),
  });
  const error =
    currentSection === 'agent'
      ? health.error
      : currentSection === 'tools'
        ? (tools.error ?? servers.error)
        : (relay.error ?? servers.error ?? webSearchConfiguration.error);
  const foundationIssues =
    health.data?.integrations.filter(
      (integration) =>
        integration.required !== false && integrationStatus(integration.status) !== 'healthy',
    ).length ?? 0;
  const webSearch = servers.data?.find(isWebSearchServer);
  const webSearchReady =
    webSearchConfiguration.data?.status === 'ready' || webSearch?.status === 'ready';
  const webSearchConfigured = webSearchConfiguration.data?.configured ?? Boolean(webSearch);
  const connectDetectedWebSearch = useMutation({
    mutationFn: (remoteUrl: string) =>
      repository.configureMcpServer('web', {
        name: 'CLIO Web Search',
        transport: 'stdio',
        command: 'uvx',
        args: webSearchMcpArgs(remoteUrl),
      }),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('mcp-servers', settings.endpoint),
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.key('tools', settings.endpoint) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.key('agents', settings.endpoint) }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('mcp-configuration', settings.endpoint, 'web'),
        }),
      ]);
      if (result.status === 'ready') {
        toast.success('CLIO Web Search connected');
      } else {
        toast.warning('CLIO Web Search was attached but is not responding yet');
      }
    },
    onError: (connectionError) =>
      toast.error('CLIO Web Search could not be connected', {
        description: connectionError.message,
      }),
  });
  const relayConnect = useMutation({
    mutationFn: (input: Parameters<typeof repository.configureRelay>[0]) =>
      repository.configureRelay(input),
    onSuccess: async () => {
      setRelayOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('relay-status', settings.endpoint),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('service-health', settings.endpoint),
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.key('tools', settings.endpoint) }),
      ]);
      toast.success('CLIO Relay connected');
    },
    onError: (connectionError) => toast.error(connectionError.message),
  });

  const sectionDefinition = INFRASTRUCTURE_SECTIONS.find((item) => item.id === currentSection)!;
  return (
    <main className="clio-scrollbar h-dvh min-h-0 overflow-y-auto bg-background p-4 sm:p-6 lg:p-10">
      <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[220px_minmax(0,1fr)]">
        <nav
          aria-label="Infrastructure sections"
          className="grid content-start gap-1 md:sticky md:top-8"
        >
          <Button asChild className="mb-4 justify-start" variant="ghost">
            <Link to={workspaceRoute}>
              <ChevronLeftIcon aria-hidden="true" /> {capitalize(vocab.workspace)}
            </Link>
          </Button>
          {INFRASTRUCTURE_SECTIONS.map(({ id, icon: SectionIcon, label }) => (
            <Button
              asChild
              className="justify-start"
              key={id}
              variant={id === currentSection ? 'secondary' : 'ghost'}
            >
              <Link
                aria-current={id === currentSection ? 'page' : undefined}
                state={location.state}
                to={`/infrastructure/${id}`}
              >
                <SectionIcon aria-hidden="true" /> {label}
              </Link>
            </Button>
          ))}
        </nav>

        <section className="min-w-0 pb-16">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
                Infrastructure
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="text-4xl font-semibold tracking-tight">{sectionDefinition.label}</h1>
                {currentSection === 'tools' && tools.data ? (
                  <Badge variant="secondary">
                    {tools.data.filter((tool) => !tool.server_id).length} built in
                  </Badge>
                ) : null}
              </div>
              <p className="mt-2 max-w-3xl text-muted-foreground">
                {currentSection === 'agent'
                  ? clioServiceDescription(health.data, foundationIssues)
                  : sectionDefinition.description}
              </p>
            </div>
            {currentSection === 'agent' ? (
              <ClioStatus
                label={
                  health.isPending
                    ? 'Checking'
                    : health.data?.healthy && !foundationIssues
                      ? 'Running'
                      : 'Needs attention'
                }
                value={
                  health.isPending
                    ? 'connecting'
                    : health.data?.healthy && !foundationIssues
                      ? 'healthy'
                      : 'degraded'
                }
              />
            ) : null}
          </header>

          {error ? (
            <Alert className="mt-6" variant="destructive">
              <NetworkIcon aria-hidden="true" />
              <AlertTitle>This section could not load completely</AlertTitle>
              <AlertDescription>
                The connected {vocab.agent} service did not return all of the requested
                information.
                <TechnicalDetails className="mt-2 text-xs" title="Technical details">
                  <p className="mt-1 break-words font-mono">{error.message}</p>
                </TechnicalDetails>
              </AlertDescription>
            </Alert>
          ) : null}

          {currentSection === 'tools' ? (
            <div className="mt-6">
              {tools.isPending ? (
                <div aria-label="Loading tool catalog" className="grid gap-3" role="status">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-[32rem] w-full" />
                </div>
              ) : tools.data?.length ? (
                <CatalogToolset servers={servers.data ?? []} tools={tools.data} />
              ) : (
                <p className="rounded-xl border p-6 text-sm text-muted-foreground">
                  {capitalize(vocab.agent)} has not reported any tools.
                </p>
              )}
            </div>
          ) : null}

          {currentSection === 'services' ? (
            <>
              <ManagedServices
                onConnectWebSearch={(remoteUrl) => connectDetectedWebSearch.mutate(remoteUrl)}
                webSearchConnected={webSearchReady}
                webSearchConnecting={connectDetectedWebSearch.isPending}
              />
              {!desktop ? (
                <section aria-label="Add services" className="mt-6 grid gap-4 md:grid-cols-2">
                  <SetupCard
                    action={
                      webSearchReady
                        ? 'View tools'
                        : webSearchConfigured
                          ? 'Repair connection'
                          : 'Connect web search'
                    }
                    description="Search the web, read PDFs, and preserve scholarly sources with CLIO Web Search."
                    icon={BookOpenCheckIcon}
                    onAction={() => setWebSearchOpen(true)}
                    status={
                      webSearchReady ? 'healthy' : webSearchConfigured ? 'degraded' : 'unavailable'
                    }
                    statusLabel={
                      webSearchReady
                        ? 'Connected'
                        : webSearchConfigured
                          ? 'Needs attention'
                          : 'Not connected'
                    }
                    title="Research and documents"
                    to={webSearchReady ? '/infrastructure/tools' : undefined}
                  />
                  <SetupCard
                    action={relay.data?.configured ? 'Edit connection' : 'Connect Relay'}
                    description="Run and follow work on lab computers or clusters through CLIO Relay."
                    detail={relay.data?.reachable ? undefined : relayDegradationDetail(relay.data)}
                    icon={NetworkIcon}
                    onAction={() => setRelayOpen(true)}
                    status={
                      relay.data?.reachable
                        ? 'healthy'
                        : relay.data?.configured
                          ? 'degraded'
                          : 'unavailable'
                    }
                    statusLabel={
                      relay.data?.reachable
                        ? 'Connected'
                        : relay.data?.configured
                          ? 'Needs attention'
                          : 'Not connected'
                    }
                    title="Remote computers"
                  />
                </section>
              ) : null}
            </>
          ) : null}

          {currentSection === 'agent' ? (
            <div className="mt-6 border-y">
              <div className="divide-y">
                {(health.data?.integrations ?? []).map((integration) => (
                  <FoundationRow integration={integration} key={integration.name} />
                ))}
              </div>
              {!health.isPending && !health.data?.integrations.length ? (
                <p className="p-5 text-sm text-muted-foreground">
                  No supporting-component details were reported.
                </p>
              ) : null}
            </div>
          ) : null}

          <WebSearchSetup onOpenChange={setWebSearchOpen} open={webSearchOpen} />
          {relayOpen ? (
            <RelayConnectionDialog
              error={relayConnect.error?.message}
              onOpenChange={setRelayOpen}
              onSubmit={(input) => relayConnect.mutate(input)}
              open
              pending={relayConnect.isPending}
              value={relay.data}
            />
          ) : null}
        </section>
      </div>
    </main>
  );
}

function mergeToolCatalogs(
  builtins: ToolCatalogItem[],
  live: ToolCatalogItem[],
): ToolCatalogItem[] {
  const merged = new Map<string, ToolCatalogItem>();
  for (const tool of builtins) merged.set(tool.name, tool);
  for (const tool of live) {
    const baseline = merged.get(tool.name);
    merged.set(tool.name, baseline ? { ...baseline, ...tool } : tool);
  }
  return [...merged.values()];
}

type InfrastructureSection = 'agent' | 'tools' | 'services';

const INFRASTRUCTURE_SECTIONS = [
  {
    id: 'agent',
    label: vocab.agent,
    icon: BotIcon,
    description: `Confirm that ${vocab.agent} itself and the components it depends on are ready.`,
  },
  {
    id: 'tools',
    label: 'Tools',
    icon: WrenchIcon,
    description: `Inspect every ${vocab.agent} and MCP tool, including its accepted inputs and returned data.`,
  },
  {
    id: 'services',
    label: 'Services',
    icon: CableIcon,
    description: `Install, connect, operate, and verify the services that give ${vocab.agent} more capabilities.`,
  },
] as const;

function isInfrastructureSection(value: string | undefined): value is InfrastructureSection {
  return value === 'agent' || value === 'tools' || value === 'services';
}

function SetupCard({
  action,
  description,
  detail,
  icon: Icon,
  onAction,
  status,
  statusLabel,
  title,
  to,
}: {
  action: string;
  description: string;
  /**
   * The service's own account of why it is not ready. A status word is a
   * severity; this is the part that tells the reader what to do about it.
   */
  detail?: string;
  icon: typeof CableIcon;
  onAction: () => void;
  status: ClioStatusValue;
  statusLabel: string;
  title: string;
  to?: string;
}) {
  return (
    <Frame spacing="sm">
      <FramePanel>
        <div className="flex items-start justify-between gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
            <Icon aria-hidden="true" className="size-4" />
          </span>
          <ClioStatus label={statusLabel} value={status} />
        </div>
        <h2 className="mt-4 font-medium">{title}</h2>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
        {detail ? (
          <p className="mt-2 text-sm leading-5 text-warning-foreground" role="status">
            {detail}
          </p>
        ) : null}
      </FramePanel>
      <FrameFooter className="items-end">
        {to ? (
          <Button asChild size="sm" variant="outline">
            <Link to={to}>
              {action} <ArrowRightIcon aria-hidden="true" />
            </Link>
          </Button>
        ) : (
          <Button onClick={onAction} size="sm" variant="outline">
            {action} <ArrowRightIcon aria-hidden="true" />
          </Button>
        )}
      </FrameFooter>
    </Frame>
  );
}

function FoundationRow({ integration }: { integration: ServiceIntegrationHealth }) {
  const status = integrationStatus(integration.status);
  const summary = foundationSummary(integration);
  const action = foundationAction(integration);
  return (
    <details className="group px-1 py-3">
      <summary className="flex cursor-pointer list-none items-center gap-3">
        <ServerIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {foundationTitle(integration.name)}
        </span>
        <ClioStatus
          label={
            isOptionalIntegration(integration) && status !== 'healthy'
              ? 'Optional'
              : integrationStatusLabel(status)
          }
          value={isOptionalIntegration(integration) && status !== 'healthy' ? 'unavailable' : status}
        />
      </summary>
      <div className="mt-3 border-t pt-3 text-xs leading-5 text-muted-foreground">
        <p>{summary}</p>
        {action ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-foreground">
            <p>{action.description}</p>
            <Button asChild size="sm" variant="outline">
              <Link to={action.to}>
                {action.label} <ArrowRightIcon aria-hidden="true" />
              </Link>
            </Button>
          </div>
        ) : null}
        {integration.summary || integration.detail || integration.config_source ? (
          <TechnicalDetails className="mt-2" title="Technical details">
            <div className="mt-2 grid gap-1 break-words font-mono text-[10px]">
              {integration.summary || integration.detail ? (
                <p>{integration.summary || integration.detail}</p>
              ) : null}
              {integration.config_source ? <p>{integration.config_source}</p> : null}
            </div>
          </TechnicalDetails>
        ) : null}
      </div>
    </details>
  );
}

function integrationStatus(status: string): ClioStatusValue {
  if (['ready', 'healthy', 'live', 'skipped'].includes(status)) return 'healthy';
  if (['degraded', 'warning', 'reconnecting'].includes(status)) return 'degraded';
  return 'unavailable';
}

function integrationStatusLabel(status: ClioStatusValue): string {
  if (status === 'healthy') return 'Ready';
  if (status === 'degraded') return 'Needs attention';
  return 'Unavailable';
}

function isOptionalIntegration(integration: ServiceIntegrationHealth): boolean {
  // OS confinement is a safety requirement even when an older backend reports
  // the advisory file-policy fallback as a legal optional configuration.
  return integration.required === false && integration.name !== 'sandbox';
}

function clioServiceDescription(
  health: { healthy: boolean } | undefined,
  foundationIssues: number,
): string {
  if (!health) return `Checking ${vocab.agent}.`;
  if (!health.healthy) return `${capitalize(vocab.agent)} needs attention.`;
  if (foundationIssues === 1) return 'Running with 1 supporting service needing attention.';
  if (foundationIssues > 1) {
    return `Running with ${foundationIssues} supporting services needing attention.`;
  }
  return `${capitalize(vocab.agent)} is running normally.`;
}

function foundationSummary(integration: ServiceIntegrationHealth): string {
  const ready: Record<string, string> = {
    api: 'The workspace service is available.',
    arc: 'Conversation memory is available.',
    gateway: 'Connected tools are available to agents.',
    file_policy: 'Workspace file access rules are active.',
    lm_provider: 'The selected language model is ready.',
    sandbox: 'Protected command and file execution is active.',
    clio_core: 'The full conversation-memory service is available.',
    sandbox_conformance: 'Agent processes are using the configured execution protection.',
    child_reaper: 'Background processes will be cleaned up with the agent service.',
    child_processes: 'No unexpected background work is running.',
    child_parentage: 'Background work remains attached to this agent service.',
  };
  const degraded: Record<string, string> = {
    arc: 'Conversation memory is using a limited local fallback.',
    sandbox: `Extra operating-system confinement is not enabled. ${vocab.agent} still applies ${vocab.workspace} access rules and records out-of-${vocab.workspace} attempts.`,
    child_parentage: 'Some background processes are no longer attached to this agent service.',
  };
  if (integrationStatus(integration.status) === 'healthy') {
    return ready[integration.name] ?? 'This supporting service is ready.';
  }
  return degraded[integration.name] ?? 'This supporting service needs attention.';
}

function foundationAction(
  integration: ServiceIntegrationHealth,
): { description: string; label: string; to: string } | undefined {
  if (integrationStatus(integration.status) === 'healthy') return undefined;
  if (isOptionalIntegration(integration)) return undefined;
  if (integration.name === 'arc') {
    return {
      description: 'Use the full conversation-memory service to restore complete agent behavior.',
      label: 'Memory settings',
      to: '/settings/memory',
    };
  }
  if (integration.name === 'child_parentage') {
    return {
      description: 'Restart or clean up detached background work on the connected agent.',
      label: 'System settings',
      to: '/settings/system',
    };
  }
  return {
    description: 'Review the technical details before using work that depends on this service.',
    label: 'System settings',
    to: '/settings/system',
  };
}

function foundationTitle(name: string): string {
  const names: Record<string, string> = {
    api: 'Workspace service',
    arc: 'Conversation memory',
    gateway: 'Tool gateway',
    file_policy: 'Workspace file access',
    lm_provider: 'Language model provider',
    sandbox: 'Protected execution',
    clio_core: 'Memory storage',
    clio_core_ram_cap: 'Memory working limit',
    clio_core_liveness: 'Memory service connection',
    clio_core_daemon_memory: 'Memory service process',
    cte_cold_tier_disk: 'Stored memory capacity',
    sandbox_conformance: 'Execution protection coverage',
    child_reaper: 'Process cleanup',
    child_processes: 'Background processes',
    child_parentage: 'Background process ownership',
  };
  return names[name] || name.replaceAll('_', ' ').replace(/^./u, (value) => value.toUpperCase());
}

/**
 * Why the relay is not reachable, as the relay put it.
 *
 * Prose detail first, then the typed reason humanized. Both come from the
 * service; neither is inferred here. A configured relay that reports nothing at
 * all yields nothing rather than a manufactured explanation.
 */
function relayDegradationDetail(status: RelayStatus | undefined): string | undefined {
  if (!status?.configured) return undefined;
  if (status.detail?.trim()) return status.detail;
  if (!status.reason?.trim()) return undefined;
  return humanizeProtocolValue(status.reason);
}

function isWebSearchServer(server: McpServerDefinition): boolean {
  const identity = `${server.id} ${server.name}`.toLowerCase();
  return identity.includes('web-search') || identity.includes('web search') || identity === 'web';
}
