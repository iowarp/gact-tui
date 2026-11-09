import {
  INFRASTRUCTURE_SECTIONS,
  isInfrastructureSection,
  type InfrastructureSection,
} from '@/lib/application-destinations';
import { queryKeys } from '@/lib/query-keys';
import { INFRASTRUCTURE_POLL_MS, MCP_PREPARING_POLL_MS } from '@/lib/runtime-limits';
import { anyServerPreparing } from '@/lib/mcp-preparation';
import type { EffectiveAgentTool, McpServerDefinition, ToolCatalogItem } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeftIcon, NetworkIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { WebSearchSetup } from '@/components/clio/web-search-setup';
import { InfrastructureServicesSection } from '@/components/clio/infrastructure-services-section';
import { InfrastructureInventory } from '@/components/clio/infrastructure-inventory';
import { NamedTooltip } from '@/components/clio/primitives/icon-button';
import { NavTabs } from '@/components/clio/primitives/nav-tabs';
import { StateView } from '@/components/clio/primitives/state-view';
import { useShortcut } from '@/lib/shortcuts/hooks';
import { Button } from '@/components/ui/button';
import { InfrastructureTools } from '@/components/clio/infrastructure-tools';
import { InfraTabActionsProvider } from '@/components/clio/infrastructure-tab-actions';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { vocab } from '@/lib/brand-vocabulary';
import { WEB_MCP_COMMAND, WEB_MCP_ENV, webSearchMcpArgs } from '@/lib/web-search-service';
import {
  returnRouteFromState,
  sessionIdFromRoute,
  workspaceIdFromRoute,
} from '@/lib/workspace-route-memory';
import { InfrastructureAgentHosts } from '@/components/clio/infrastructure-agent-hosts';
export function InfrastructurePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const mainRef = useRef<HTMLElement>(null);
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
    refetchInterval: (query) =>
      anyServerPreparing(query.state.data) ? MCP_PREPARING_POLL_MS : INFRASTRUCTURE_POLL_MS,
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
  const retrySection = () => {
    for (const query of [health, servers, tools, effectiveToolset, webSearchConfiguration]) {
      if (query.error) void query.refetch();
    }
  };
  const displayedTools = sessionToolScope
    ? effectiveToolset.data
      ? effectiveToolCatalog(effectiveToolset.data.tools, tools.data ?? [], servers.data ?? [])
      : []
    : (tools.data ?? []);
  const toolsPending =
    tools.isPending || servers.isPending || (sessionToolScope && effectiveToolset.isPending);
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
  const sectionTabs = INFRASTRUCTURE_SECTIONS.map(({ id, icon, label }) => ({
    id,
    icon,
    label,
    to: `/infrastructure/${id}`,
    state: location.state,
  }));
  const moveSection = (step: number) => {
    const index = INFRASTRUCTURE_SECTIONS.findIndex((item) => item.id === currentSection);
    const count = INFRASTRUCTURE_SECTIONS.length;
    const next = INFRASTRUCTURE_SECTIONS[(index + step + count) % count]!;
    navigate(`/infrastructure/${next.id}`, { state: location.state });
  };
  useShortcut('previous-tab', () => moveSection(-1), { region: mainRef });
  useShortcut('next-tab', () => moveSection(1), { region: mainRef });
  const [tabActions, setTabActions] = useState<HTMLElement | null>(null);
  return (
    <main
      className="clio-scrollbar h-full min-h-0 overflow-y-auto bg-background"
      ref={mainRef}
      tabIndex={-1}
    >
      <div className="sticky top-0 z-10 flex h-11 min-w-0 items-center gap-2 border-b border-border bg-background/95 px-2 whitespace-nowrap backdrop-blur sm:px-3">
        <NamedTooltip label={`Back to ${vocab.workspace}`}>
          <Button asChild className="text-muted-foreground" size="icon-sm" variant="ghost">
            <Link aria-label={`Back to ${vocab.workspace}`} to={workspaceRoute}>
              <ChevronLeftIcon aria-hidden="true" />
            </Link>
          </Button>
        </NamedTooltip>
        <h1 className="sr-only">Infrastructure: {sectionDefinition.label}</h1>
        <NavTabs active={currentSection} label="Infrastructure sections" tabs={sectionTabs} />
        <span
          className="ml-auto flex min-w-0 shrink-0 items-center gap-1.5"
          data-slot="infrastructure-tab-actions"
          ref={setTabActions}
        />
      </div>
      <InfraTabActionsProvider value={tabActions}>
        <div className="mx-auto max-w-5xl px-2 sm:px-3">
          <section aria-label={sectionDefinition.label} className="min-w-0 pt-1.5 pb-12">
            {error ? (
              <StateView
                className="mt-6 rounded-md border"
                kind="error"
                size="row"
                icon={NetworkIcon}
                title="This section could not load completely"
                detail={error.message}
                action={{ label: 'Retry', onClick: retrySection }}
              />
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
              <InfrastructureServicesSection
                webSearch={{
                  connection: webSearchConfiguration.data,
                  connected: webSearchReady,
                  configured: webSearchConfigured,
                  connecting: connectDetectedWebSearch.isPending,
                  disconnecting: disconnectWebSearch.isPending,
                  onConnect: (remoteUrl) => connectDetectedWebSearch.mutate(remoteUrl),
                  onDisconnect: () => disconnectWebSearch.mutate(),
                }}
              />
            ) : null}

            {currentSection === 'agent' ? <InfrastructureAgentHosts health={health} /> : null}

            <WebSearchSetup onOpenChange={setWebSearchOpen} open={webSearchOpen} />
          </section>
        </div>
      </InfraTabActionsProvider>
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

function isWebSearchServer(server: McpServerDefinition): boolean {
  const identity = `${server.id} ${server.name}`.toLowerCase();
  return identity.includes('web-search') || identity.includes('web search') || identity === 'web';
}
