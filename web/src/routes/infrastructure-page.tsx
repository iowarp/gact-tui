import { queryKeys } from '@/lib/query-keys';
import { INFRASTRUCTURE_POLL_MS } from '@/lib/runtime-limits';
import type {
  EffectiveAgentTool,
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
import { WEB_MCP_COMMAND, WEB_MCP_ENV, webSearchMcpArgs } from '@/lib/web-search-service';
import {
  returnRouteFromState,
  sessionIdFromRoute,
  workspaceIdFromRoute,
} from '@/lib/workspace-route-memory';
import {
  foundationSummary,
  foundationTitle,
  integrationStatus,
  integrationStatusLabel,
} from './infrastructure-foundation';
import { SandboxFoundationRow } from './infrastructure-sandbox-row';
export function InfrastructurePage() {
  const desktop = inTauri();
  const location = useLocation();
  const { section } = useParams();
  const currentSection: InfrastructureSection = isInfrastructureSection(section)
    ? section
    : 'services';
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
  const effectiveToolset = useQuery({
    enabled: currentSection === 'tools' && Boolean(sessionId),
    queryKey: queryKeys.key('session-toolset', settings.endpoint, sessionId),
    queryFn: async ({ signal }) =>
      sessionId ? ((await repository.effectiveAgentToolset(sessionId, signal)) ?? null) : null,
    refetchInterval: INFRASTRUCTURE_POLL_MS,
  });
  const webSearchConfiguration = useQuery({
    enabled: currentSection === 'services',
    queryKey: queryKeys.key('mcp-configuration', settings.endpoint, 'web'),
    queryFn: ({ signal }) => repository.mcpConfiguration('web', signal),
    refetchInterval: INFRASTRUCTURE_POLL_MS,
  });
  const error =
    currentSection === 'agent'
      ? health.error
      : currentSection === 'tools'
        ? (effectiveToolset.error ?? tools.error ?? servers.error)
        : (relay.error ?? servers.error ?? webSearchConfiguration.error);
  const displayedTools = sessionId
    ? effectiveToolset.data
      ? effectiveToolCatalog(effectiveToolset.data.tools, tools.data ?? [], servers.data ?? [])
      : []
    : (tools.data ?? []);
  const toolsPending =
    tools.isPending || servers.isPending || (Boolean(sessionId) && effectiveToolset.isPending);
  const foundationIssues =
    health.data?.integrations.filter(
      (integration) =>
        integration.required !== false && integrationStatus(integration.status) !== 'healthy',
    ).length ?? 0;
  const webSearch = servers.data?.find(isWebSearchServer);
  const webSearchReady =
    webSearchConfiguration.data?.status === 'ready' || webSearch?.status === 'ready';
  const webSearchConfigured = webSearchConfiguration.data?.configured ?? Boolean(webSearch);
  const refreshWebSearchQueries = async () => {
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
  };
  const connectDetectedWebSearch = useMutation({
    mutationFn: (remoteUrl: string) =>
      repository.configureMcpServer('web', {
        name: 'CLIO Web Search',
        transport: 'stdio',
        command: WEB_MCP_COMMAND,
        args: webSearchMcpArgs(remoteUrl),
        env: WEB_MCP_ENV,
        always_load: true,
      }),
    onSuccess: async (result) => {
      queryClient.setQueryData(
        queryKeys.key('mcp-configuration', settings.endpoint, 'web'),
        result,
      );
      await refreshWebSearchQueries();
      if (result.status === 'ready') {
        toast.success(`CLIO Web Search connected with ${result.tools_count} tools`);
      } else {
        toast.error('CLIO Web Search could not complete the connection', {
          description: result.error ?? 'The service is saved, but its tools did not respond.',
        });
      }
    },
    onError: (connectionError) =>
      toast.error('CLIO Web Search could not be connected', {
        description: connectionError.message,
      }),
  });
  const disconnectWebSearch = useMutation({
    mutationFn: () => repository.removeMcpConfiguration('web'),
    onSuccess: async (result) => {
      queryClient.setQueryData(
        queryKeys.key('mcp-configuration', settings.endpoint, 'web'),
        result,
      );
      await refreshWebSearchQueries();
      toast.success('CLIO Web Search disconnected', {
        description: 'The deployment is still running and can be connected again at any time.',
      });
    },
    onError: (connectionError) =>
      toast.error('CLIO Web Search could not be disconnected', {
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
    <main className="clio-scrollbar h-full min-h-0 overflow-y-auto bg-background p-4 sm:p-6 lg:p-10">
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
                {currentSection === 'tools' && !toolsPending ? (
                  <Badge variant="secondary">{displayedTools.length} available</Badge>
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
                The connected {vocab.agent} service did not return all of the requested information.
                <TechnicalDetails className="mt-2 text-xs" title="Technical details">
                  <p className="mt-1 break-words font-mono">{error.message}</p>
                </TechnicalDetails>
              </AlertDescription>
            </Alert>
          ) : null}

          {currentSection === 'tools' ? (
            <div className="mt-6">
              {toolsPending ? (
                <div aria-label="Loading tool catalog" className="grid gap-3" role="status">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-[32rem] w-full" />
                </div>
              ) : displayedTools.length ? (
                <CatalogToolset servers={servers.data ?? []} tools={displayedTools} />
              ) : (
                <p className="rounded-xl border p-6 text-sm text-muted-foreground">
                  {sessionId
                    ? `This session has not recorded an effective ${vocab.agent} toolset yet.`
                    : `${vocab.agent} has not reported any tools.`}
                </p>
              )}
            </div>
          ) : null}

          {currentSection === 'services' ? (
            <>
              <ManagedServices
                connectedAgentLabel={settings.label}
                connectedAgentTunnel={settings.tunnel}
                onConnectWebSearch={(remoteUrl) => connectDetectedWebSearch.mutate(remoteUrl)}
                onDisconnectWebSearch={() => disconnectWebSearch.mutate()}
                webSearchConnected={webSearchReady}
                webSearchConnection={webSearchConfiguration.data}
                webSearchConnecting={connectDetectedWebSearch.isPending}
                webSearchDisconnecting={disconnectWebSearch.isPending}
                relayStatus={relay.data}
              />
              {!desktop ? (
                <section aria-label="Add services" className="mt-6 grid gap-4 md:grid-cols-2">
                  <SetupCard
                    action={
                      webSearchReady && webSearchConfiguration.data?.configured
                        ? disconnectWebSearch.isPending
                          ? 'Disconnecting…'
                          : 'Disconnect'
                        : webSearchReady
                          ? 'View tools'
                          : webSearchConfigured
                            ? 'Repair connection'
                            : 'Connect web search'
                    }
                    description="Search the web, read PDFs, and preserve scholarly sources with CLIO Web Search."
                    icon={BookOpenCheckIcon}
                    onAction={() =>
                      webSearchReady && webSearchConfiguration.data?.configured
                        ? disconnectWebSearch.mutate()
                        : setWebSearchOpen(true)
                    }
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
                    to={
                      webSearchReady && !webSearchConfiguration.data?.configured
                        ? '/infrastructure/tools'
                        : undefined
                    }
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

/**
 * Project the global catalog onto the toolset the selected session actually received.
 *
 * The effective-toolset trace is authoritative for availability. Catalog rows only
 * enrich those recorded tools with contracts and labels; they must never make a tool
 * appear available to a session that did not mount it.
 */
function effectiveToolCatalog(
  effectiveTools: readonly EffectiveAgentTool[],
  catalog: readonly ToolCatalogItem[],
  servers: readonly McpServerDefinition[],
): ToolCatalogItem[] {
  const catalogByName = new Map(catalog.map((tool) => [tool.name, tool]));
  const serverBySource = new Map<string, McpServerDefinition>();
  for (const server of servers) {
    serverBySource.set(server.id.toLocaleLowerCase(), server);
    serverBySource.set(server.name.toLocaleLowerCase(), server);
  }

  const projected = new Map<string, ToolCatalogItem>();
  for (const effective of effectiveTools) {
    const baseline = catalogByName.get(effective.name);
    const server = serverBySource.get(effective.source.toLocaleLowerCase());
    projected.set(effective.name, {
      id: baseline?.id ?? effective.name,
      name: effective.name,
      title: effective.title || baseline?.title,
      description: baseline?.description,
      server_id: server?.id ?? baseline?.server_id,
      source: effective.source || baseline?.source,
      status: baseline?.status ?? 'available',
      enabled: true,
      owner: baseline?.owner,
      tags: baseline?.tags ?? [],
      visible_to: baseline?.visible_to ?? [],
      input_schema: baseline?.input_schema ?? {},
      output_schema: baseline?.output_schema ?? {},
      domain: baseline?.domain,
    });
  }
  return [...projected.values()];
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
    description: `Inspect the tools available to the selected session. Provider contracts are shown when reported.`,
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
  // Protected execution alone offers a fix (Set up / Restart) instead of
  // only explaining the problem, backed by the dedicated sandbox endpoint —
  // every other row stays the plain /v1/health projection below.
  if (integration.name === 'sandbox') return <SandboxFoundationRow integration={integration} />;
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
        <ClioStatus label={integrationStatusLabel(status)} value={status} />
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

function clioServiceDescription(
  health: { healthy: boolean } | undefined,
  foundationIssues: number,
): string {
  if (!health) return `Checking ${vocab.agent}.`;
  if (!health.healthy) return `${vocab.agent} needs attention.`;
  if (foundationIssues === 1) return 'Running with 1 supporting service needing attention.';
  if (foundationIssues > 1) {
    return `Running with ${foundationIssues} supporting services needing attention.`;
  }
  return `${vocab.agent} is running normally.`;
}

function foundationAction(
  integration: ServiceIntegrationHealth,
): { description: string; label: string; to: string } | undefined {
  if (integrationStatus(integration.status) === 'healthy') return undefined;
  // The server is the sole authority on whether an integration's absence
  // blocks usage — no client-side name-based override. `sandbox` never
  // reaches here: it renders through SandboxFoundationRow instead.
  if (integration.required === false) return undefined;
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
