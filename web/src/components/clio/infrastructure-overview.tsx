import type { InfrastructureInventory, McpUserConfiguration, SavedServer } from '@clio/core/v3';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronRightIcon,
  CpuIcon,
  GlobeIcon,
  HardDriveIcon,
  HistoryIcon,
  ServerIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSavedServers } from '@/hooks/use-saved-servers';
import { useConnectionSettings } from '@/providers/connection-provider';
import { Button } from '@/components/ui/button';
import { vocab } from '@/lib/brand-vocabulary';
import { RefreshIcon } from '@/lib/icon-vocabulary';
import { infrastructureServiceName } from '@/lib/infrastructure-service-labels';
import { managedServiceStatus } from '@/lib/managed-service-status';
import type { SshHost } from '@/lib/ssh-hosts';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { cn } from '@/lib/utils';
import { BrandIcon } from './brand-icon';
import { agentIdentity } from './connection-names';
import { InfraList, InfraRow, type InfraStatus } from './infrastructure-row';
import { InfraTabActions } from './infrastructure-tab-actions';
import { InfrastructureTopology } from './infrastructure-topology';
import { IconButton, NamedTooltip } from './primitives/icon-button';
import type { StatusTone } from './primitives/status-indicator';
import { StateView } from './primitives/state-view';
import type { ClioStatusValue } from './status';
import { remoteUrlFromSpec } from './web-search-configuration';

const MORE = [
  { to: '/infrastructure/agent', label: 'Manage computers', icon: ServerIcon },
  { to: '/infrastructure/models', label: 'Models & storage', icon: HardDriveIcon },
  { to: '/infrastructure/activity', label: 'View activity', icon: HistoryIcon },
] as const;

/** Where the agent, inference and web research stand, then the map of what connects to what. */
export function InfrastructureOverview({
  data,
  targetId,
  webSearch,
  webSearchConnected = false,
  onManageWebSearch,
  onReconnect,
  reconnecting = false,
  reconnectError,
}: {
  data: InfrastructureInventory;
  /** The selected computer; Inspect again re-reads its capabilities too. */
  targetId: string;
  webSearch?: McpUserConfiguration;
  webSearchConnected?: boolean;
  onManageWebSearch?: () => void;
  /** Reconnect a computer that needs sign-in, from its node on the map. */
  onReconnect?: (host: SshHost) => Promise<unknown>;
  reconnecting?: boolean;
  reconnectError?: string;
}) {
  const { settings } = useConnectionSettings();
  const { servers } = useSavedServers();
  const queryClient = useQueryClient();
  const inspect = useMutation({
    mutationFn: () =>
      Promise.all([
        queryClient.refetchQueries({
          queryKey: ['infrastructure-inventory', settings.endpoint],
          exact: true,
        }),
        queryClient.refetchQueries({
          queryKey: ['managed-service-catalog', settings.endpoint, targetId],
          exact: true,
        }),
        servers.refetch(),
      ]),
  });
  const research = webResearchRow(data, webSearch, webSearchConnected);
  const inference = inferenceRow(servers.data, Boolean(servers.error));
  const agent = agentDetail(settings.label, settings.endpoint, settings.location);
  return (
    <div className="@container/overview flex min-w-0 flex-1 flex-col pt-1">
      <InfraTabActions>
        <IconButton
          aria-busy={inspect.isPending || undefined}
          disabled={inspect.isPending}
          icon={<RefreshIcon className={cn(inspect.isPending && 'motion-safe:animate-spin')} />}
          label="Inspect again"
          onClick={() => inspect.mutate()}
        />
      </InfraTabActions>
      <InfraList label="Your setup" meta={110} status={112}>
        <InfraRow
          description={named('Sessions and tools run here.')}
          icon={<BrandIcon className="size-4" />}
          meta={agent}
          primaryAction={<OpenLink label="Open Agent" to="/infrastructure/agent" />}
          status={{ tone: 'success', label: 'Connected' }}
          title={named('Agent')}
        />
        <InfraRow
          description={named('Connect an API or a model server on any host.')}
          icon={<CpuIcon />}
          meta={inference.meta}
          primaryAction={<OpenLink label="Open Inference" to="/infrastructure/services" />}
          status={inference.status}
          title={named('Inference')}
        />
        <InfraRow
          description={named(research.description)}
          details={
            research.reason ? (
              <p className="truncate text-[11px] text-muted-foreground" title={research.reason}>
                {research.reason}
              </p>
            ) : undefined
          }
          icon={<GlobeIcon />}
          meta={research.meta}
          primaryAction={
            research.to || !onManageWebSearch ? (
              <OpenLink label={research.action} to={research.to ?? '/infrastructure/services'} />
            ) : (
              <IconButton
                icon={<ChevronRightIcon />}
                label={research.action}
                size="sm"
                onClick={onManageWebSearch}
              />
            )
          }
          status={{ tone: statusTone(research.state), label: research.status }}
          title={named('Web research')}
        />
      </InfraList>
      {servers.error ? (
        <StateView
          kind="error"
          size="row"
          title="Saved model servers could not load"
          detail={servers.error.message}
          action={{ label: 'Retry', onClick: () => void servers.refetch() }}
        />
      ) : null}
      {reconnectError ? (
        <StateView
          kind="error"
          size="row"
          title="Could not connect this computer"
          detail={reconnectError}
        />
      ) : null}
      <nav
        aria-label="More infrastructure"
        className="flex min-w-0 items-center gap-1 overflow-hidden px-0.5 pt-2 pb-1"
      >
        {MORE.map(({ to, label, icon: Icon }) => (
          <Button
            asChild
            className="min-w-0 shrink font-normal text-muted-foreground hover:text-foreground"
            key={to}
            size="xs"
            variant="ghost"
          >
            <Link title={label} to={to}>
              <Icon aria-hidden="true" />
              <span className="truncate">{label}</span>
            </Link>
          </Button>
        ))}
      </nav>
      <InfrastructureTopology
        agentLabel={agent}
        agentRoute={
          settings.infrastructure?.targetId && settings.infrastructure.targetId !== 'local'
            ? 'SSH'
            : 'Direct'
        }
        className="mt-1.5 hidden flex-col border-t border-border @[520px]/overview:flex"
        client={inTauri() ? 'Desktop app' : 'Browser'}
        data={data}
        reconnecting={reconnecting}
        onReconnect={onReconnect}
      />
    </div>
  );
}

/** A row's pinned arrow: opens the tab that manages it, named on hover. */
function OpenLink({ label, to }: { label: string; to: string }) {
  return (
    <NamedTooltip label={label}>
      <Button
        asChild
        className="rounded-[5px] text-muted-foreground hover:bg-hover hover:text-foreground"
        size="icon-xs"
        variant="ghost"
      >
        <Link aria-label={label} to={to}>
          <ChevronRightIcon aria-hidden="true" className="size-3.5" />
        </Link>
      </Button>
    </NamedTooltip>
  );
}

/** Row text that keeps its full wording on hover when it is cut short. */
function named(text: string) {
  return <span title={text}>{text}</span>;
}

function statusTone(value: ClioStatusValue): StatusTone {
  switch (value) {
    case 'healthy':
      return 'success';
    case 'degraded':
      return 'warning';
    case 'running':
      return 'running';
    case 'failed':
      return 'error';
    default:
      return 'idle';
  }
}

/** Saved model servers summarised: how many answered their last check, and which. */
function inferenceRow(
  servers: SavedServer[] | undefined,
  failed: boolean,
): { status: InfraStatus; meta?: string } {
  if (failed) return { status: { tone: 'error', label: 'Could not load' } };
  if (!servers) return { status: { tone: 'running', label: 'Loading' } };
  if (!servers.length) return { status: { tone: 'idle', label: 'None connected' } };
  const reachable = servers.filter((server) => server.check?.reachable);
  const meta = [...new Set((reachable.length ? reachable : servers).map((row) => row.label))].join(
    ', ',
  );
  if (reachable.length)
    return { status: { tone: 'success', label: `${reachable.length} connected` }, meta };
  if (servers.some((server) => server.check))
    return { status: { tone: 'warning', label: 'Not reachable' }, meta };
  return { status: { tone: 'idle', label: 'Not checked' }, meta };
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
  description: string;
  meta?: string;
  reason?: string;
  action: string;
  status: string;
  state: ClioStatusValue;
  to?: string;
} {
  const description = 'Add source reading and research tools to your agent.';
  if (connected) {
    const url = remoteUrlFromSpec(webSearch?.spec);
    return {
      description: 'Source reading and research tools are connected.',
      meta: url ? hostName(url, data) : undefined,
      action: 'Manage web research',
      status: 'Connected',
      state: 'healthy',
    };
  }
  if (webSearch?.configured)
    return {
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
      description: `Built-in search engine: ${name}`,
      meta: data.targets.find((target) => target.id === builtIn.target_id)?.label || 'Local',
      reason: status.reason,
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
    description: 'No research service connected',
    action: 'Connect web research',
    status: 'Not connected',
    state: 'unavailable',
  };
}

/** The computer a service URL points at, by its saved name when there is one, never the URL. */
function hostName(url: string, data: InfrastructureInventory): string | undefined {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return undefined;
  }
  if (!host) return undefined;
  if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) return 'This computer';
  return data.targets.find((target) => target.ssh?.host === host)?.label || host;
}

/** The agent row names the computer it runs on: its given name, or its host, never a URL. */
function agentDetail(label: string | undefined, endpoint: string, location?: string): string {
  const identity = agentIdentity(endpoint, label, location);
  return identity.kind === 'local' && identity.name === `${vocab.agent} local`
    ? 'This computer'
    : identity.name;
}
