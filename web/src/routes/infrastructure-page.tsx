import {
  INFRASTRUCTURE_SECTIONS,
  isInfrastructureSection,
  type InfrastructureSection,
} from '@/lib/application-destinations';
import { queryKeys } from '@/lib/query-keys';
import { INFRASTRUCTURE_POLL_MS } from '@/lib/runtime-limits';
import type {
  EffectiveAgentTool,
  McpServerDefinition,
  ServiceIntegrationHealth,
  ToolCatalogItem,
  ProvenanceConnectionInput,
} from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRightIcon,
  BookOpenCheckIcon,
  CableIcon,
  ChevronLeftIcon,
  NetworkIcon,
  ServerIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ClioStatus, type ClioStatusValue } from '@/components/clio/status';
import { TechnicalDetails } from '@/components/clio/technical-details';
import { WebSearchSetup } from '@/components/clio/web-search-setup';
import { ManagedServices } from '@/components/clio/managed-services';
import { ProvenanceConnections } from '@/components/clio/provenance-connections';
import { InfrastructureInventory } from '@/components/clio/infrastructure-inventory';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { InfrastructureTools } from '@/components/clio/infrastructure-tools';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
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
import { connectionScope } from '@/lib/connection-scope';
import { InfrastructureFoundationGroups } from './infrastructure-foundation-groups';
export function InfrastructurePage() {
  const location = useLocation();
  const { section } = useParams();
  const currentSection: InfrastructureSection = isInfrastructureSection(section)
    ? section
    : 'overview';
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const workspaceRoute = returnRouteFromState(location.state, settings.endpoint);
  const workspaceId = workspaceIdFromRoute(workspaceRoute);
  const sessionId = sessionIdFromRoute(workspaceRoute);
  const [toolScope, setToolScope] = useState<'session' | 'agent'>('session');
  const sessionToolScope = Boolean(sessionId) && toolScope === 'session';
  const [connectServiceOpen, setConnectServiceOpen] = useState(false);
  const [returnToConnectionChooser, setReturnToConnectionChooser] = useState(false);
  const provenanceScope = connectionScope(settings);
  const [connectProvenance, setConnectProvenance] = useState<{
    scope: string;
    input: ProvenanceConnectionInput;
  }>();
  const openProvenance = (input: ProvenanceConnectionInput) =>
    setConnectProvenance({ scope: provenanceScope, input });
  const [webSearchOpen, setWebSearchOpen] = useState(false);
  const health = useQuery({
    enabled: currentSection === 'agent',
    queryKey: queryKeys.key('service-health', settings.endpoint),
    queryFn: ({ signal }) => repository.serviceHealth(signal),
    refetchInterval: INFRASTRUCTURE_POLL_MS,
  });
  const servers = useQuery({
    enabled:
      currentSection === 'tools' || currentSection === 'services' || currentSection === 'overview',
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
    enabled: currentSection === 'tools' && sessionToolScope,
    queryKey: queryKeys.key('session-toolset', settings.endpoint, sessionId),
    queryFn: async ({ signal }) =>
      sessionId ? ((await repository.effectiveAgentToolset(sessionId, signal)) ?? null) : null,
    refetchInterval: INFRASTRUCTURE_POLL_MS,
  });
  const webSearchConfiguration = useQuery({
    enabled: currentSection === 'services' || currentSection === 'overview',
    queryKey: queryKeys.key('mcp-configuration', settings.endpoint, 'web'),
    queryFn: ({ signal }) => repository.mcpConfiguration('web', signal),
    refetchInterval: INFRASTRUCTURE_POLL_MS,
  });
  const error =
    currentSection === 'agent'
      ? health.error
      : currentSection === 'tools'
        ? ((sessionToolScope ? effectiveToolset.error : undefined) ?? tools.error ?? servers.error)
        : (servers.error ?? webSearchConfiguration.error);
  const displayedTools = sessionToolScope
    ? effectiveToolset.data
      ? effectiveToolCatalog(effectiveToolset.data.tools, tools.data ?? [], servers.data ?? [])
      : []
    : (tools.data ?? []);
  const toolsPending =
    tools.isPending || servers.isPending || (sessionToolScope && effectiveToolset.isPending);
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

  const sectionDefinition = INFRASTRUCTURE_SECTIONS.find((item) => item.id === currentSection)!;
  return (
    <main className="clio-scrollbar h-full min-h-0 overflow-y-auto bg-background p-4 sm:p-6 lg:p-10">
      <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[220px_minmax(0,1fr)]">
        <nav
          aria-label="Infrastructure sections"
          className="grid grid-cols-2 content-start gap-1 md:sticky md:top-8 md:grid-cols-1"
        >
          <Button
            asChild
            className="col-span-2 mb-2 justify-start md:col-span-1 md:mb-4"
            variant="ghost"
          >
            <Link to={workspaceRoute}>
              <ChevronLeftIcon aria-hidden="true" /> {capitalize(vocab.workspace)}
            </Link>
          </Button>
          {INFRASTRUCTURE_SECTIONS.map(({ id, icon: SectionIcon, label }) => (
            <Button
              asChild
              className="shrink-0 justify-start"
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
                  <Badge variant="secondary">{displayedTools.length} tools</Badge>
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

          {currentSection === 'overview' ||
          currentSection === 'models' ||
          currentSection === 'activity' ? (
            <InfrastructureInventory
              section={currentSection}
              overview={{
                webSearch: webSearchConfiguration.data,
                webSearchConnected: webSearchReady,
                onManageWebSearch: () => setWebSearchOpen(true),
              }}
            />
          ) : null}

          {currentSection === 'tools' ? (
            <InfrastructureTools
              sessionId={sessionId}
              sessionScoped={sessionToolScope}
              pending={toolsPending}
              tools={displayedTools}
              servers={servers.data ?? []}
              onScope={setToolScope}
            />
          ) : null}

          {currentSection === 'services' ? (
            <>
              <ManagedServices
                connectedAgentLabel={settings.label}
                connectedAgentLocation={settings.location}
                onConnectExistingService={() => {
                  setReturnToConnectionChooser(true);
                  setConnectServiceOpen(true);
                }}
                onConnectProvenance={(input) => {
                  setReturnToConnectionChooser(false);
                  openProvenance(input);
                }}
                onManageWebSearch={() => {
                  setReturnToConnectionChooser(false);
                  setWebSearchOpen(true);
                }}
                onConnectWebSearch={(remoteUrl) => connectDetectedWebSearch.mutate(remoteUrl)}
                onDisconnectWebSearch={() => disconnectWebSearch.mutate()}
                webSearchConnected={webSearchReady}
                webSearchConnection={webSearchConfiguration.data}
                webSearchConnecting={connectDetectedWebSearch.isPending}
                webSearchDisconnecting={disconnectWebSearch.isPending}
              />
              <ProvenanceConnections
                onBack={
                  returnToConnectionChooser
                    ? () => {
                        setConnectProvenance(undefined);
                        setConnectServiceOpen(true);
                      }
                    : undefined
                }
                connect={
                  connectProvenance?.scope === provenanceScope ? connectProvenance.input : undefined
                }
                onClose={() =>
                  setConnectProvenance((current) =>
                    current?.scope === provenanceScope ? undefined : current,
                  )
                }
              />
              <Dialog open={connectServiceOpen} onOpenChange={setConnectServiceOpen}>
                <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
                  <DialogHeader>
                    <DialogTitle>Connect an existing service</DialogTitle>
                    <DialogDescription>
                      Attach a service to {settings.label || vocab.agent}. Its deployment remains
                      under your control.
                    </DialogDescription>
                  </DialogHeader>
                  <section aria-label="Add services" className="divide-y border-y">
                    {(['flowcept', 'cmf'] as const).map((service) => (
                      <SetupCard
                        key={service}
                        title={service === 'flowcept' ? 'Flowcept' : 'HPE CMF'}
                        description={
                          service === 'flowcept'
                            ? 'Record execution provenance.'
                            : 'Track artifact lineage.'
                        }
                        icon={ServerIcon}
                        status="unavailable"
                        statusLabel="Not checked"
                        action="Connect"
                        onAction={() => {
                          setConnectServiceOpen(false);
                          openProvenance({
                            service_id: service,
                            label: service === 'flowcept' ? 'Flowcept' : 'HPE CMF',
                            url: '',
                          });
                        }}
                      />
                    ))}
                    <SetupCard
                      action={webSearchConfigured ? 'Edit connection' : 'Connect'}
                      description="Search and read sources through CLIO Web Search."
                      icon={BookOpenCheckIcon}
                      onAction={() => {
                        setConnectServiceOpen(false);
                        setWebSearchOpen(true);
                      }}
                      status={
                        webSearchReady
                          ? 'healthy'
                          : webSearchConfigured
                            ? 'degraded'
                            : 'unavailable'
                      }
                      statusLabel={
                        webSearchReady
                          ? 'Connected'
                          : webSearchConfigured
                            ? 'Needs attention'
                            : 'Not connected'
                      }
                      title="CLIO Web Search"
                    />
                  </section>
                  <Button asChild variant="outline">
                    <Link to="/settings/providers">Connect an inference provider</Link>
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-fit"
                    onClick={() => setConnectServiceOpen(false)}
                  >
                    <ChevronLeftIcon />
                    Back to services
                  </Button>
                </DialogContent>
              </Dialog>
            </>
          ) : null}

          {currentSection === 'agent' ? (
            <>
              <InfrastructureInventory section="hosts">
                <InfrastructureFoundationGroups
                  integrations={health.data?.integrations ?? []}
                  renderRow={(integration) => (
                    <FoundationRow integration={integration} key={integration.name} />
                  )}
                />
                {!health.isPending && !health.data?.integrations.length ? (
                  <p className="p-5 text-sm text-muted-foreground">
                    No supporting-component details were reported.
                  </p>
                ) : null}
              </InfrastructureInventory>
            </>
          ) : null}

          <WebSearchSetup
            onOpenChange={setWebSearchOpen}
            open={webSearchOpen}
            onBack={
              returnToConnectionChooser
                ? () => {
                    setWebSearchOpen(false);
                    setConnectServiceOpen(true);
                  }
                : undefined
            }
          />
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
    <div className="flex items-center gap-3 py-4">
      <Icon aria-hidden="true" className="size-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        {detail ? <p className="mt-1 text-xs text-warning-foreground">{detail}</p> : null}
      </div>
      <ClioStatus label={statusLabel} value={status} />
      {to ? (
        <Button asChild size="sm" variant="outline">
          <Link to={to} aria-label={`${action} ${title}`}>
            {action}
            <ArrowRightIcon />
          </Link>
        </Button>
      ) : (
        <Button onClick={onAction} size="sm" variant="outline" aria-label={`${action} ${title}`}>
          {action}
          <ArrowRightIcon />
        </Button>
      )}
    </div>
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
      <summary className="grid cursor-pointer list-none grid-cols-[1rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 sm:flex sm:gap-3">
        <ServerIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 text-sm font-medium sm:flex-1">
          {foundationTitle(integration.name)}
        </span>
        <div className="col-start-2 shrink-0 justify-self-start sm:ml-auto">
          <ClioStatus label={integrationStatusLabel(status)} value={status} />
        </div>
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
  if (foundationIssues > 0)
    return 'Running. Review the errors and warnings for each computer below.';
  return `${vocab.agent} is running. Open a computer’s details for health and repair actions.`;
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
  if (integration.name === 'lm_provider') {
    return {
      description:
        'Sign-in is stored locally. Check the provider connection and its available models.',
      label: 'Provider setup',
      to: '/settings/providers',
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

function isWebSearchServer(server: McpServerDefinition): boolean {
  const identity = `${server.id} ${server.name}`.toLowerCase();
  return identity.includes('web-search') || identity.includes('web search') || identity === 'web';
}
