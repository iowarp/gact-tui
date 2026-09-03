import { queryKeys } from '@/lib/query-keys';
import { INFRASTRUCTURE_POLL_MS } from '@/lib/runtime-limits';
import type { McpServerDefinition, ServiceIntegrationHealth } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRightIcon,
  BookOpenCheckIcon,
  CableIcon,
  ChevronLeftIcon,
  Globe2Icon,
  HardDriveIcon,
  NetworkIcon,
  PlusIcon,
  ServerIcon,
  TerminalSquareIcon,
  WrenchIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { ClioStatus, type ClioStatusValue } from '@/components/clio/status';
import { RelayConnectionDialog } from '@/components/clio/relay-settings';
import { WebSearchSetup } from '@/components/clio/web-search-setup';
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from '@/components/reui/frame';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { returnRouteFromState, workspaceIdFromRoute } from '@/lib/workspace-route-memory';

export function InfrastructurePage() {
  const location = useLocation();
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const workspaceRoute = returnRouteFromState(location.state, settings.endpoint);
  const workspaceId = workspaceIdFromRoute(workspaceRoute);
  const [relayOpen, setRelayOpen] = useState(false);
  const [webSearchOpen, setWebSearchOpen] = useState(false);
  const health = useQuery({
    queryKey: queryKeys.key('service-health', settings.endpoint),
    queryFn: ({ signal }) => repository.serviceHealth(signal),
    refetchInterval: INFRASTRUCTURE_POLL_MS,
  });
  const relay = useQuery({
    queryKey: queryKeys.key('relay-status', settings.endpoint),
    queryFn: ({ signal }) => repository.relayStatus(signal),
    refetchInterval: INFRASTRUCTURE_POLL_MS,
  });
  const servers = useQuery({
    queryKey: queryKeys.key('mcp-servers', settings.endpoint, workspaceId || 'infrastructure'),
    queryFn: ({ signal }) => repository.mcpServers(workspaceId, signal),
    refetchInterval: INFRASTRUCTURE_POLL_MS,
  });
  const error = health.error ?? relay.error ?? servers.error;
  const foundationIssues =
    health.data?.integrations.filter(
      (integration) => integrationStatus(integration.status) !== 'healthy',
    ).length ?? 0;
  const webSearch = servers.data?.find(isWebSearchServer);
  const webSearchReady = webSearch?.status === 'ready';
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

  return (
    <main className="min-h-dvh bg-background p-4 sm:p-6 lg:p-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Set up</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight">Agent capabilities</h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Add research tools or remote computers, then see what this agent can use.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to={workspaceRoute}>
              <ChevronLeftIcon aria-hidden="true" /> Workspace
            </Link>
          </Button>
        </header>

        {error ? (
          <Alert className="mt-6" variant="destructive">
            <NetworkIcon aria-hidden="true" />
            <AlertTitle>Some infrastructure details are unavailable</AlertTitle>
            <AlertDescription>
              The connected service returned details this workspace could not read. The remaining
              live infrastructure is still shown below.
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer">Technical details</summary>
                <p className="mt-1 break-words font-mono">{error.message}</p>
              </details>
            </AlertDescription>
          </Alert>
        ) : null}

        <section aria-label="Add capabilities" className="mt-8 grid gap-4 md:grid-cols-2">
          <SetupCard
            action={webSearchReady ? 'View MCP' : webSearch ? 'Retry setup' : 'Set up web search'}
            description="Search the web, read PDFs, and preserve scholarly sources with CLIO Web Search."
            icon={BookOpenCheckIcon}
            onAction={() => setWebSearchOpen(true)}
            status={webSearchReady ? 'healthy' : webSearch ? 'degraded' : 'unavailable'}
            statusLabel={webSearchReady ? 'Ready' : webSearch ? 'Needs attention' : 'Not set up'}
            title="Research and documents"
            to={webSearchReady ? '/settings/tools' : undefined}
          />
          <SetupCard
            action={relay.data?.configured ? 'Edit connection' : 'Connect Relay'}
            description="Run and follow work on lab computers or clusters through CLIO Relay."
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
                ? 'Ready'
                : relay.data?.configured
                  ? 'Needs attention'
                  : 'Not set up'
            }
            title="Remote computers"
          />
        </section>

        <Frame className="mt-6" spacing="sm">
          <FrameHeader>
            <FrameTitle className="flex items-center gap-2">
              <WrenchIcon aria-hidden="true" className="size-4 text-primary" /> Agent tools (MCP)
            </FrameTitle>
            <FrameDescription>
              MCP services give agents specific tools. Built-in tools ship with the agent; external
              MCPs add scientific data, search, or applications.
            </FrameDescription>
          </FrameHeader>
          <FramePanel className="p-0">
            {servers.isPending ? (
              <div className="grid gap-2 p-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : servers.data?.length ? (
              <div className="divide-y">
                {servers.data.map((server) => (
                  <ServiceRow key={server.id} server={server} />
                ))}
              </div>
            ) : (
              <p className="p-5 text-sm text-muted-foreground">
                No MCP services are connected yet.
              </p>
            )}
          </FramePanel>
          <FrameFooter className="flex-row flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {servers.data?.filter((server) => server.status === 'ready').length ?? 0} of{' '}
              {servers.data?.length ?? 0} ready
            </p>
            <Button asChild size="sm" variant="outline">
              <Link to="/settings/tools">
                <PlusIcon aria-hidden="true" /> Manage MCP services
              </Link>
            </Button>
          </FrameFooter>
        </Frame>

        <Frame className="mt-6 scroll-mt-6" id="foundations" spacing="sm">
          <FrameHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <FrameTitle>Agent service</FrameTitle>
                <FrameDescription>
                  {agentServiceDescription(health.data, foundationIssues)}
                </FrameDescription>
              </div>
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
            </div>
          </FrameHeader>
          <FramePanel>
            <details>
              <summary className="cursor-pointer text-sm font-medium">Supporting services</summary>
              <p className="mt-1 text-sm text-muted-foreground">
                Runtime components used by the agent itself. Most users do not need to change these.
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {(health.data?.integrations ?? []).map((integration) => (
                  <FoundationRow integration={integration} key={integration.name} />
                ))}
              </div>
              {!health.data?.integrations.length ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  No supporting-service details were reported.
                </p>
              ) : null}
            </details>
          </FramePanel>
        </Frame>

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
      </div>
    </main>
  );
}

function SetupCard({
  action,
  description,
  icon: Icon,
  onAction,
  status,
  statusLabel,
  title,
  to,
}: {
  action: string;
  description: string;
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

function ServiceRow({ server }: { server: McpServerDefinition }) {
  const ready = server.status === 'ready';
  return (
    <div className="flex min-w-0 items-center gap-3 px-4 py-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        <ServiceIcon server={server} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium">{serviceTitle(server)}</p>
          <Badge variant="outline">{serviceOwnership(server)}</Badge>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {serviceDescription(server)} · {server.tools_count}{' '}
          {server.tools_count === 1 ? 'tool' : 'tools'}
        </p>
      </div>
      <ClioStatus
        detail={server.error}
        label={ready ? 'Ready' : server.status.replaceAll('_', ' ')}
        value={ready ? 'healthy' : 'degraded'}
      />
    </div>
  );
}

function FoundationRow({ integration }: { integration: ServiceIntegrationHealth }) {
  const status = integrationStatus(integration.status);
  const summary = foundationSummary(integration);
  const action = foundationAction(integration);
  return (
    <details className="group rounded-xl border bg-card px-3 py-2.5">
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
          <details className="mt-2">
            <summary className="cursor-pointer text-muted-foreground">Technical details</summary>
            <div className="mt-2 grid gap-1 break-words font-mono text-[10px]">
              {integration.summary || integration.detail ? (
                <p>{integration.summary || integration.detail}</p>
              ) : null}
              {integration.config_source ? <p>{integration.config_source}</p> : null}
            </div>
          </details>
        ) : null}
      </div>
    </details>
  );
}

function integrationStatus(status: string): ClioStatusValue {
  if (['ready', 'healthy', 'live'].includes(status)) return 'healthy';
  if (['degraded', 'warning', 'reconnecting'].includes(status)) return 'degraded';
  return 'unavailable';
}

function integrationStatusLabel(status: ClioStatusValue): string {
  if (status === 'healthy') return 'Ready';
  if (status === 'degraded') return 'Needs attention';
  return 'Unavailable';
}

function agentServiceDescription(
  health: { healthy: boolean } | undefined,
  foundationIssues: number,
): string {
  if (!health) return 'Checking the connected agent service.';
  if (!health.healthy) return 'The connected agent service needs attention.';
  if (foundationIssues === 1) return 'Running with 1 supporting service needing attention.';
  if (foundationIssues > 1) {
    return `Running with ${foundationIssues} supporting services needing attention.`;
  }
  return 'The connected agent service is running normally.';
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

function serviceTitle(server: McpServerDefinition): string {
  const names: Record<string, string> = {
    fs: 'Files',
    filesystem: 'Files',
    shell: 'Commands',
    'clio-web-search': 'CLIO Web Search',
  };
  if (names[server.id] || names[server.name]) return names[server.id] || names[server.name]!;
  const fromSpec = server.spec.title ?? server.spec.display_name;
  if (typeof fromSpec === 'string' && fromSpec.trim()) return fromSpec;
  return server.name || server.id;
}

function serviceOwnership(server: McpServerDefinition): string {
  if (server.transport === 'in_process') return 'Built-in MCP';
  if (server.source === 'agent_blueprint') return 'Blueprint MCP';
  return 'External MCP';
}

function serviceDescription(server: McpServerDefinition): string {
  const descriptions: Record<string, string> = {
    fs: 'Read and edit files allowed by this workspace',
    filesystem: 'Read and edit files allowed by this workspace',
    shell: 'Run commands inside the workspace’s permitted folders',
    'clio-web-search': 'Search the web and convert scientific documents',
  };
  if (isWebSearchServer(server)) return descriptions['clio-web-search'];
  return (
    descriptions[server.id] ||
    descriptions[server.name] ||
    (server.transport === 'in_process'
      ? 'Provided by the connected agent'
      : 'Adds tools from a connected service')
  );
}

function ServiceIcon({ server }: { server: McpServerDefinition }) {
  if (['fs', 'filesystem'].includes(server.id) || ['fs', 'filesystem'].includes(server.name)) {
    return <HardDriveIcon aria-hidden="true" className="size-4" />;
  }
  if (server.id === 'shell' || server.name === 'shell') {
    return <TerminalSquareIcon aria-hidden="true" className="size-4" />;
  }
  if (isWebSearchServer(server)) return <Globe2Icon aria-hidden="true" className="size-4" />;
  return <CableIcon aria-hidden="true" className="size-4" />;
}

function isWebSearchServer(server: McpServerDefinition): boolean {
  const identity = `${server.id} ${server.name}`.toLowerCase();
  return identity.includes('web-search') || identity.includes('web search') || identity === 'web';
}
