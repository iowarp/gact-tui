import type { McpServerDefinition, ServiceIntegrationHealth } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import {
  CableIcon,
  ChevronLeftIcon,
  Globe2Icon,
  NetworkIcon,
  PlusIcon,
  ServerIcon,
  WrenchIcon,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { ClioStatus, type ClioStatusValue } from '@/components/clio/status';
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from '@/components/reui/frame';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { returnRouteFromState } from '@/lib/workspace-route-memory';

export function InfrastructurePage() {
  const location = useLocation();
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const health = useQuery({
    queryKey: ['service-health', settings.endpoint],
    queryFn: ({ signal }) => repository.serviceHealth(signal),
    refetchInterval: 20_000,
  });
  const relay = useQuery({
    queryKey: ['relay-status', settings.endpoint],
    queryFn: ({ signal }) => repository.relayStatus(signal),
    refetchInterval: 20_000,
  });
  const servers = useQuery({
    queryKey: ['mcp-servers', settings.endpoint, 'infrastructure'],
    queryFn: ({ signal }) => repository.mcpServers(undefined, signal),
    refetchInterval: 20_000,
  });
  const error = health.error ?? relay.error ?? servers.error;

  return (
    <main className="min-h-dvh bg-background p-4 sm:p-6 lg:p-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
              Connected systems
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight">Infrastructure</h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              See the services that extend this agent, what they provide, and where attention is
              needed.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to={returnRouteFromState(location.state)}>
              <ChevronLeftIcon aria-hidden="true" /> Workspace
            </Link>
          </Button>
        </header>

        {error ? (
          <Alert className="mt-6" variant="destructive">
            <NetworkIcon aria-hidden="true" />
            <AlertTitle>Some infrastructure details are unavailable</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : null}

        <section aria-label="Infrastructure overview" className="mt-8 grid gap-4 md:grid-cols-3">
          <OverviewCard
            description={health.data?.overall_status || 'Checking the connected agent service.'}
            icon={ServerIcon}
            label="Agent service"
            pending={health.isPending}
            status={health.data?.healthy ? 'healthy' : 'degraded'}
            statusLabel={health.data?.healthy ? 'Available' : 'Needs attention'}
          />
          <OverviewCard
            description={
              relayDescription(relay.data)
            }
            icon={NetworkIcon}
            label="Remote execution"
            pending={relay.isPending}
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
          />
          <OverviewCard
            description={`${servers.data?.filter((server) => server.status === 'ready').length ?? 0} of ${servers.data?.length ?? 0} connected services are ready.`}
            icon={WrenchIcon}
            label="Tools and data"
            pending={servers.isPending}
            status={
              !servers.data?.length
                ? 'unavailable'
                : servers.data.every((server) => server.status === 'ready')
                  ? 'healthy'
                  : 'degraded'
            }
            statusLabel={
              !servers.data?.length
                ? 'None connected'
                : servers.data.every((server) => server.status === 'ready')
                  ? 'Ready'
                  : 'Needs attention'
            }
          />
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <Frame spacing="sm">
            <FrameHeader>
              <FrameTitle className="flex items-center gap-2">
                <NetworkIcon aria-hidden="true" className="size-4 text-primary" /> Remote work
              </FrameTitle>
              <FrameDescription>
                Dispatch and observe work through the configured relay service.
              </FrameDescription>
            </FrameHeader>
            <FramePanel>
              <ClioStatus
                detail={relayDescription(relay.data)}
                label={
                  relay.data?.reachable
                    ? 'Relay connected'
                    : relay.data?.configured
                      ? 'Relay needs attention'
                      : 'Relay not connected'
                }
                value={
                  relay.data?.reachable
                    ? 'healthy'
                    : relay.data?.configured
                      ? 'degraded'
                      : 'unavailable'
                }
              />
              {relay.data?.host ? (
                <p
                  className="mt-3 truncate font-mono text-xs text-muted-foreground"
                  title={relay.data.host}
                >
                  {relay.data.host}
                </p>
              ) : null}
              {relay.data?.detail || relay.data?.reason ? (
                <details className="mt-3 text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Technical details</summary>
                  <p className="mt-2 break-words font-mono">
                    {relay.data.detail || relay.data.reason}
                  </p>
                </details>
              ) : null}
            </FramePanel>
            <FrameFooter className="justify-end">
              <Button asChild size="sm" variant="outline">
                <Link to="/settings/relays">Manage relay</Link>
              </Button>
            </FrameFooter>
          </Frame>

          <Frame spacing="sm">
            <FrameHeader>
              <FrameTitle className="flex items-center gap-2">
                <Globe2Icon aria-hidden="true" className="size-4 text-primary" /> Tools, search, and
                data services
              </FrameTitle>
              <FrameDescription>
                Connected services available to this agent and their live readiness.
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
                  No tool, search, or data services are connected yet.
                </p>
              )}
            </FramePanel>
            <FrameFooter className="justify-end">
              <Button asChild size="sm">
                <Link to="/settings/tools">
                  <PlusIcon aria-hidden="true" /> Add or manage services
                </Link>
              </Button>
            </FrameFooter>
          </Frame>
        </section>

        {health.data?.integrations.length ? (
          <Frame className="mt-6" spacing="sm">
            <FrameHeader>
              <FrameTitle>Agent foundations</FrameTitle>
              <FrameDescription>
                Runtime services reported by the connected agent. Technical details remain inside
                each item.
              </FrameDescription>
            </FrameHeader>
            <FramePanel className="grid gap-2 sm:grid-cols-2">
              {health.data.integrations.map((integration) => (
                <FoundationRow integration={integration} key={integration.name} />
              ))}
            </FramePanel>
          </Frame>
        ) : null}
      </div>
    </main>
  );
}

function OverviewCard({
  description,
  icon: Icon,
  label,
  pending,
  status,
  statusLabel,
}: {
  description: string;
  icon: typeof CableIcon;
  label: string;
  pending: boolean;
  status: ClioStatusValue;
  statusLabel: string;
}) {
  return (
    <Frame spacing="sm">
      <FramePanel>
        <div className="flex items-start justify-between gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
            <Icon aria-hidden="true" className="size-4" />
          </span>
          <ClioStatus
            label={pending ? 'Checking' : statusLabel}
            value={pending ? 'connecting' : status}
          />
        </div>
        <h2 className="mt-4 font-medium">{label}</h2>
        <p className="mt-1 line-clamp-3 text-sm leading-5 text-muted-foreground">{description}</p>
      </FramePanel>
    </Frame>
  );
}

function ServiceRow({ server }: { server: McpServerDefinition }) {
  const ready = server.status === 'ready';
  return (
    <div className="flex min-w-0 items-center gap-3 px-4 py-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        <CableIcon aria-hidden="true" className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{serviceTitle(server)}</p>
        <p className="truncate text-xs text-muted-foreground">
          {server.tools_count} {server.tools_count === 1 ? 'capability' : 'capabilities'}
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
  return (
    <details className="group rounded-xl border bg-card px-3 py-2.5">
      <summary className="flex cursor-pointer list-none items-center gap-3">
        <ServerIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {foundationTitle(integration.name)}
        </span>
        <ClioStatus label={integration.status.replaceAll('_', ' ')} value={status} />
      </summary>
      <div className="mt-3 border-t pt-3 text-xs leading-5 text-muted-foreground">
        <p>{integration.summary || integration.detail || 'No additional detail was reported.'}</p>
        {integration.next_action ? (
          <p className="mt-2 text-foreground">{integration.next_action}</p>
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
    fs: 'Workspace files',
    filesystem: 'Workspace files',
    shell: 'Command execution',
    'clio-web-search': 'Web search',
  };
  if (names[server.id] || names[server.name]) return names[server.id] || names[server.name]!;
  const fromSpec = server.spec.title ?? server.spec.display_name;
  if (typeof fromSpec === 'string' && fromSpec.trim()) return fromSpec;
  return server.name || server.id;
}

function relayDescription(
  relay:
    | {
        configured: boolean;
        reachable?: boolean;
        detail?: string;
        reason?: string;
      }
    | undefined,
): string {
  if (!relay) return 'Checking remote execution availability.';
  if (relay.reachable) return 'Remote execution is connected and ready.';
  if (!relay.configured) return 'No remote execution service is connected.';
  const raw = `${relay.detail || ''} ${relay.reason || ''}`.toLowerCase();
  if (raw.includes('incomplete') || raw.includes('not_configured')) {
    return 'Remote execution is partially configured, but its tools are not ready.';
  }
  return 'Remote execution is configured but currently unavailable.';
}
