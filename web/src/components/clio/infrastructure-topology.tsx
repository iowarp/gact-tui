import type { InfrastructureInventory, InfrastructureTarget } from '@clio/core/v3';
import {
  CpuIcon,
  GlobeIcon,
  LaptopIcon,
  MonitorIcon,
  PackageIcon,
  PlugIcon,
  ServerIcon,
} from 'lucide-react';
import { memo, useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { vocab } from '@/lib/brand-vocabulary';
import {
  computerConnectionLabel,
  infrastructureServiceName,
} from '@/lib/infrastructure-service-labels';
import { managedServiceStatus } from '@/lib/managed-service-status';
import type { SshHost } from '@/lib/ssh-hosts';
import { cn } from '@/lib/utils';
import { BrandIcon } from './brand-icon';
import { AGENT_COMPUTER } from './managed-service-target-utils';

type NodeTone = 'ok' | 'self' | 'active' | 'attention' | 'failed' | 'idle';

type NodeAction =
  | { kind: 'link'; to: string; label: string; hint: string }
  | { kind: 'reconnect'; host: SshHost; label: string; hint: string };

interface MapNode {
  id: string;
  column: 0 | 1 | 2 | 3;
  /** Vertical slot; halves center a node between its children. */
  row: number;
  icon: ReactNode;
  title: string;
  /** The node's state in words, for its hover name and accessible name. */
  detail: string;
  /** A shorter visible line when the edge already says the route ("Sign-in needed"). */
  brief?: string;
  tone: NodeTone;
  action?: NodeAction;
}

interface MapEdge {
  from: string;
  to: string;
  label?: string;
  dashed?: boolean;
  tone?: 'attention' | 'failed';
}

/** Column positions as percentages of the map width: client, agent, computers, services. */
const COLUMNS = [
  { left: 0, width: 17 },
  { left: 21, width: 20 },
  { left: 45.5, width: 20.5 },
  { left: 71, width: 29 },
] as const;
const ROW = 50;
const NODE_HEIGHT = 38;
const PAD = 12;

const NODE_TONE: Record<NodeTone, string> = {
  ok: 'border-border bg-background [&_[data-slot=map-icon]]:text-muted-foreground',
  self: 'border-primary bg-primary/10 [&_[data-slot=map-icon]]:text-primary',
  active: 'border-dashed border-muted-foreground/50 bg-muted/40',
  attention: 'border-dashed border-warning bg-warning/5 [&_[data-slot=map-icon]]:text-warning',
  failed: 'border-destructive bg-destructive/5 [&_[data-slot=map-icon]]:text-destructive',
  idle: 'border-dashed border-border bg-background [&_[data-slot=map-icon]]:text-faint',
};

const EDGE_TONE = {
  attention: 'stroke-warning',
  failed: 'stroke-destructive',
} as const;

/**
 * This client, the connected agent, the computers it manages and the services
 * on each, as one left-to-right map. Every node says its state in words and
 * opens what it names; a computer that needs sign-in reconnects from its node.
 */
export function InfrastructureTopology({
  data,
  agentLabel,
  agentRoute = 'Direct',
  client,
  onReconnect,
  reconnecting = false,
  className,
}: {
  data: InfrastructureInventory;
  agentLabel: string;
  /** How this client reaches the agent, labelled on their edge. */
  agentRoute?: 'Direct' | 'SSH';
  /** Where this client runs ("Desktop app", "Browser"). */
  client: string;
  onReconnect?: (host: SshHost) => Promise<unknown>;
  reconnecting?: boolean;
  className?: string;
}) {
  const canReconnect = Boolean(onReconnect);
  const map = useMemo(
    () => topologyLayout(data, agentLabel, agentRoute, client, canReconnect),
    [data, agentLabel, agentRoute, client, canReconnect],
  );
  const height = PAD * 2 + (map.rows - 1) * ROW + NODE_HEIGHT;
  const nodes = new Map(map.nodes.map((node) => [node.id, node]));
  return (
    <section
      aria-label="Connection map"
      className={cn(
        'bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:14px_14px] px-3 py-2',
        className,
      )}
    >
      <div className="relative min-w-0" style={{ height }}>
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 size-full overflow-visible"
        >
          {map.edges.map((edge) => {
            const from = nodes.get(edge.from);
            const to = nodes.get(edge.to);
            if (!from || !to) return null;
            const x1 = COLUMNS[from.column].left + COLUMNS[from.column].width;
            const x2 = COLUMNS[to.column].left;
            const y1 = centerY(from.row);
            const y2 = centerY(to.row);
            return (
              <g
                key={`${edge.from}>${edge.to}`}
                className={cn(
                  'fill-none stroke-muted-foreground/55',
                  edge.tone && EDGE_TONE[edge.tone],
                )}
              >
                <svg
                  height="100%"
                  overflow="visible"
                  preserveAspectRatio="none"
                  viewBox={`0 0 100 ${height}`}
                  width={`${x2 - x1}%`}
                  x={`${x1}%`}
                >
                  <path
                    d={`M0 ${y1} C50 ${y1} 50 ${y2} 99 ${y2}`}
                    strokeDasharray={edge.dashed ? '4 3' : undefined}
                    strokeWidth={1.25}
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
                <svg overflow="visible" x={`${x2}%`} y={y2}>
                  <path d="M-6 -3.5 L-1.5 0 L-6 3.5" strokeWidth={1.25} />
                </svg>
                {edge.label ? (
                  <text
                    className="fill-muted-foreground stroke-none text-[10px]"
                    textAnchor="middle"
                    x={`${(x1 + x2) / 2}%`}
                    y={(y1 + y2) / 2 - 5}
                  >
                    {edge.label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
        <div
          aria-label="Connections from this client to the agent and managed computers"
          className="absolute inset-0"
          role="list"
        >
          {map.nodes.map((node) => (
            <MapNodeView
              key={node.id}
              node={node}
              onReconnect={onReconnect}
              reconnecting={reconnecting}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

const MapNodeView = memo(function MapNodeView({
  node,
  onReconnect,
  reconnecting,
}: {
  node: MapNode;
  onReconnect?: (host: SshHost) => Promise<unknown>;
  reconnecting: boolean;
}) {
  const column = COLUMNS[node.column];
  const className = cn(
    'flex h-[38px] w-full min-w-0 items-center gap-2 rounded-[7px] border px-2.5 text-left outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring',
    node.action && 'hover:bg-hover disabled:opacity-60',
    NODE_TONE[node.tone],
  );
  const body = (
    <>
      <span
        aria-hidden="true"
        className="grid size-4 shrink-0 place-items-center text-muted-foreground [&_svg]:size-3.5"
        data-slot="map-icon"
      >
        {node.icon}
      </span>
      <span className="flex min-w-0 flex-col leading-[1.25]">
        <span className="truncate text-[12px] font-semibold text-foreground">{node.title}</span>
        <span className="truncate text-[11px] text-muted-foreground">
          {node.brief ?? node.detail}
        </span>
      </span>
    </>
  );
  const action = node.action;
  const name = `${node.title}, ${node.detail}`;
  const trigger =
    action?.kind === 'link' ? (
      <Link aria-label={`${action.label}, ${node.detail}`} className={className} to={action.to}>
        {body}
      </Link>
    ) : action?.kind === 'reconnect' ? (
      <button
        aria-label={`${action.label}, ${node.detail}`}
        className={className}
        disabled={reconnecting}
        type="button"
        onClick={() => void onReconnect?.(action.host).catch(() => undefined)}
      >
        {body}
      </button>
    ) : (
      // A node with no action still takes focus so its state is reachable by keyboard.
      <div aria-label={name} className={className} role="group" tabIndex={0}>
        {body}
      </div>
    );
  return (
    <div
      className="absolute"
      role="listitem"
      style={{ left: `${column.left}%`, top: PAD + node.row * ROW, width: `${column.width}%` }}
    >
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent className="flex-col items-start gap-0.5" side="bottom" sideOffset={4}>
          <span className="font-semibold">{node.title}</span>
          <span>{action ? `${node.detail}. ${action.hint}` : node.detail}</span>
        </TooltipContent>
      </Tooltip>
    </div>
  );
});

function centerY(row: number): number {
  return PAD + row * ROW + NODE_HEIGHT / 2;
}

/** One band per computer, its services stacked beside it; the agent sits in the middle. */
function topologyLayout(
  data: InfrastructureInventory,
  agentLabel: string,
  agentRoute: 'Direct' | 'SSH',
  client: string,
  canReconnect: boolean,
): { nodes: MapNode[]; edges: MapEdge[]; rows: number } {
  const nodes: MapNode[] = [];
  const edges: MapEdge[] = [];
  const local = data.targets.find((target) => target.kind === 'local');
  const localId = local?.id ?? 'local';
  const remote = data.targets.filter((target) => target.kind !== 'local');
  const servicesOn = (targetId: string) =>
    data.services.filter((service) => service.target_id === targetId);
  const bands: { target?: InfrastructureTarget; id: string }[] = [];
  if (servicesOn(localId).length) bands.push({ target: local, id: localId });
  for (const target of remote) bands.push({ target, id: target.id });

  let row = 0;
  const labelled = new Set<string>();
  for (const band of bands) {
    const services = servicesOn(band.id);
    const span = Math.max(1, services.length);
    const hostId = `host:${band.id}`;
    const host = band.target;
    const isLocal = !host || host.kind === 'local';
    const state = isLocal ? undefined : hostState(host);
    const hostName = isLocal ? AGENT_COMPUTER : host.label;
    nodes.push({
      id: hostId,
      column: 2,
      row: row + (span - 1) / 2,
      icon: isLocal ? <MonitorIcon /> : <ServerIcon />,
      title: hostName,
      detail: isLocal ? 'Local' : state!.detail,
      brief: state?.brief,
      tone: state?.tone ?? 'ok',
      action:
        state?.reconnect && canReconnect && host?.ssh
          ? {
              kind: 'reconnect',
              host: sshHostFromTarget(host),
              label: `Reconnect ${host.label}`,
              hint: 'Enter to reconnect.',
            }
          : {
              kind: 'link',
              to: `/infrastructure/services?target=${encodeURIComponent(band.id)}`,
              label: `Services on ${hostName}`,
              hint: 'Enter to open its services.',
            },
    });
    const route = host?.kind === 'ssh' ? 'SSH' : host?.kind === 'direct' ? 'Direct' : undefined;
    edges.push({
      from: 'agent',
      to: hostId,
      label: route && !labelled.has(route) ? route : undefined,
      dashed: state?.reconnect,
      tone: state?.reconnect ? 'attention' : state?.tone === 'failed' ? 'failed' : undefined,
    });
    if (route) labelled.add(route);
    services.forEach((service, index) => {
      const status = managedServiceStatus(service);
      const port =
        status.kind === 'running' && service.connection_url
          ? urlPort(service.connection_url)
          : undefined;
      const name = infrastructureServiceName(service.service_id);
      const id = `service:${service.id}`;
      nodes.push({
        id,
        column: 3,
        row: row + index,
        icon: serviceIcon(service.service_id),
        title: name,
        detail: port ? `${status.label}, port ${port}` : status.label,
        tone:
          status.value === 'healthy'
            ? 'ok'
            : status.value === 'running'
              ? 'active'
              : status.value === 'degraded'
                ? 'attention'
                : 'idle',
        action: {
          kind: 'link',
          to: `/infrastructure/services?target=${encodeURIComponent(band.id)}&service=${encodeURIComponent(service.service_id)}`,
          label: `Manage ${name} on ${hostName}`,
          hint: 'Enter to manage it.',
        },
      });
      edges.push({ from: hostId, to: id, dashed: state?.reconnect });
    });
    row += span;
  }
  if (!remote.length) {
    nodes.push({
      id: 'add-computer',
      column: 2,
      row,
      icon: <ServerIcon />,
      title: 'Remote computers',
      detail: 'None added',
      tone: 'idle',
      action: {
        kind: 'link',
        to: '/infrastructure/agent',
        label: 'Add a computer',
        hint: 'Enter to add one.',
      },
    });
    edges.push({ from: 'agent', to: 'add-computer', dashed: true });
    row += 1;
  }
  const middle = (row - 1) / 2;
  nodes.unshift(
    {
      id: 'client',
      column: 0,
      row: middle,
      icon: <LaptopIcon />,
      title: 'This client',
      detail: client,
      tone: 'ok',
    },
    {
      id: 'agent',
      column: 1,
      row: middle,
      icon: <BrandIcon className="size-3.5" />,
      title: `Connected ${vocab.agent}`,
      detail: agentLabel,
      tone: 'self',
      action: {
        kind: 'link',
        to: `/infrastructure/services?target=${encodeURIComponent(localId)}`,
        label: `Manage services on connected ${vocab.agent} ${agentLabel}`,
        hint: 'Enter to open its services.',
      },
    },
  );
  edges.unshift({ from: 'client', to: 'agent', label: agentRoute });
  return { nodes, edges, rows: row };
}

/** A computer's connection in words, and whether it needs sign-in or a reconnect. */
function hostState(host: InfrastructureTarget): {
  detail: string;
  brief: string;
  tone: NodeTone;
  reconnect: boolean;
} {
  const words = computerConnectionLabel(host.transport_state);
  const jump = host.ssh?.jump_hosts[0];
  const detail = jump ? `via ${jump}, ${words}` : host.kind === 'direct' ? words : `SSH: ${words}`;
  const state = { detail, brief: words };
  switch (host.transport_state) {
    case 'connected':
      return { ...state, tone: 'ok', reconnect: false };
    case 'reconnecting':
      return { ...state, tone: 'active', reconnect: false };
    case 'reauthentication_required':
    case 'disconnected':
      return { ...state, tone: 'attention', reconnect: true };
    default:
      return { ...state, tone: 'idle', reconnect: false };
  }
}

/** The saved route a reconnect re-registers, as the Computers tab sends it. */
function sshHostFromTarget(host: InfrastructureTarget): SshHost {
  return {
    id: host.id,
    label: host.label,
    profile: host.ssh?.profile,
    host: host.ssh?.host,
    user: host.ssh?.user,
    port: host.ssh?.port ?? 22,
    jumpHosts: host.ssh?.jump_hosts,
    identityFile: host.ssh?.identity_file,
    platform: host.ssh?.platform,
    installRoot: host.install_root,
  };
}

function serviceIcon(serviceId: string): ReactNode {
  const engine = serviceId.split('@', 1)[0];
  if (engine === 'vllm' || engine === 'llama_cpp' || engine === 'ollama') return <CpuIcon />;
  if (engine === 'searxng' || engine === 'web_search') return <GlobeIcon />;
  if (engine === 'relay') return <PlugIcon />;
  return <PackageIcon />;
}

function urlPort(url: string): string | undefined {
  try {
    return new URL(url).port || undefined;
  } catch {
    return undefined;
  }
}
