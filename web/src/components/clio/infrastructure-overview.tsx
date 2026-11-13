import type { InfrastructureInventory, SavedServer } from '@clio/core/v3';
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
import type { SshHost } from '@/lib/ssh-hosts';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { cn } from '@/lib/utils';
import { BrandIcon } from './brand-icon';
import { agentIdentity } from './connection-names';
import { InfraList, InfraRow, type InfraStatus } from './infrastructure-row';
import { InfraTabActions } from './infrastructure-tab-actions';
import { InfrastructureTopology } from './infrastructure-topology';
import { IconButton, NamedTooltip } from './primitives/icon-button';
import { StateView } from './primitives/state-view';
import { ph, t } from '@lingui/core/macro';

const MORE = [
  {
    to: '/infrastructure/agent',
    label: t`Manage computers`,
    short: t`Computers`,
    icon: ServerIcon,
  },
  {
    to: '/infrastructure/models',
    label: t`Models & storage`,
    short: t`Models`,
    icon: HardDriveIcon,
  },
  {
    to: '/infrastructure/activity',
    label: t`View activity`,
    short: t`Activity`,
    icon: HistoryIcon,
  },
] as const;

/** Where the agent and inference stand, where web search is set up, then the map of what connects to what. */
export function InfrastructureOverview({
  data,
  targetId,
  onReconnect,
  reconnecting = false,
  reconnectError,
}: {
  data: InfrastructureInventory;
  /** The selected computer; Inspect again re-reads its capabilities too. */
  targetId: string;
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
  const inference = inferenceRow(servers.data, Boolean(servers.error));
  const agent = agentDetail(settings.label, settings.endpoint, settings.location);
  return (
    <div className="@container/overview flex min-w-0 flex-1 flex-col pt-1">
      <InfraTabActions>
        <IconButton
          aria-busy={inspect.isPending || undefined}
          disabled={inspect.isPending}
          icon={<RefreshIcon className={cn(inspect.isPending && 'motion-safe:animate-spin')} />}
          label={t`Inspect again`}
          onClick={() => inspect.mutate()}
        />
      </InfraTabActions>
      <InfraList label={t`Your setup`} meta={110} status={112}>
        <InfraRow
          description={named(t`Sessions and tools run here.`)}
          icon={<BrandIcon className="size-4" />}
          meta={agent}
          primaryAction={<OpenLink label={t`Open Agent`} to="/infrastructure/agent" />}
          status={{ tone: 'success', label: t`Connected` }}
          title={named(t`Agent`)}
        />
        <InfraRow
          description={named(t`Connect an API or a model server on any host.`)}
          icon={<CpuIcon />}
          meta={inference.meta}
          primaryAction={<OpenLink label={t`Open Inference`} to="/infrastructure/services" />}
          status={inference.status}
          title={named(t`Inference`)}
        />
        <InfraRow
          description={named(t`Built in. Choose its sources and keys in Settings.`)}
          icon={<GlobeIcon />}
          primaryAction={
            <OpenLink label={t`Open web search settings`} to="/settings/web-search" />
          }
          status={{ tone: 'idle', label: t`Built in` }}
          title={named(t`Web search`)}
        />
      </InfraList>
      {servers.error ? (
        <StateView
          kind="error"
          size="row"
          title={t`Saved model servers could not load`}
          detail={servers.error.message}
          action={{ label: t`Retry`, onClick: () => void servers.refetch() }}
        />
      ) : null}
      {reconnectError ? (
        <StateView
          kind="error"
          size="row"
          title={t`Could not connect this computer`}
          detail={reconnectError}
        />
      ) : null}
      <nav
        aria-label={t`More infrastructure`}
        className="flex min-w-0 items-center gap-1.5 overflow-hidden px-0.5 pt-2 pb-1"
      >
        {MORE.map(({ to, label, short, icon: Icon }) => (
          <Button
            asChild
            className="min-w-0 shrink gap-1.5 text-foreground [&_svg]:size-3.5"
            key={to}
            size="compact"
            variant="ghost"
          >
            {/* A phone-width overview names each link by its place, so none is clipped. */}
            <Link aria-label={label} title={label} to={to}>
              <Icon aria-hidden="true" />
              <span className="truncate @max-[440px]/overview:hidden">{label}</span>
              <span className="hidden truncate @max-[440px]/overview:inline">{short}</span>
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
        client={inTauri() ? t`Desktop app` : t`Browser`}
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

/** Saved model servers summarised: how many answered their last check, and which. */
function inferenceRow(
  servers: SavedServer[] | undefined,
  failed: boolean,
): { status: InfraStatus; meta?: string } {
  if (failed) return { status: { tone: 'error', label: t`Could not load` } };
  if (!servers) return { status: { tone: 'running', label: t`Loading` } };
  if (!servers.length) return { status: { tone: 'idle', label: t`None connected` } };
  const reachable = servers.filter((server) => server.check?.reachable);
  const meta = [...new Set((reachable.length ? reachable : servers).map((row) => row.label))].join(
    ', ',
  );
  if (reachable.length)
    return {
      status: { tone: 'success', label: t`${ph({ count: reachable.length })} connected` },
      meta,
    };
  if (servers.some((server) => server.check))
    return { status: { tone: 'warning', label: t`Not reachable` }, meta };
  return { status: { tone: 'idle', label: t`Not checked` }, meta };
}

/** The agent row names the computer it runs on: its given name, or its host, never a URL. */
function agentDetail(label: string | undefined, endpoint: string, location?: string): string {
  const identity = agentIdentity(endpoint, label, location);
  return identity.kind === 'local' && identity.name === `${vocab.agent} local`
    ? t`This computer`
    : identity.name;
}
