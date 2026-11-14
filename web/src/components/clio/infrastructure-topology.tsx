import type { InfrastructureInventory, InfrastructureTarget } from '@clio/core/v3';
import { CpuIcon, LaptopIcon, MonitorIcon, PackageIcon, PlugIcon, ServerIcon } from 'lucide-react';
import { memo, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { t, ph } from '@lingui/core/macro';

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
  { left: 0, width: 18 },
  { left: 23, width: 20 },
  { left: 47, width: 23.5 },
  { left: 75, width: 25 },
] as const;
/** The space between rows; a row is one node height plus this. */
const ROW_GAP = 12;
/** A node's height while every title fits on one line. */
const NODE_HEIGHT = 38;
/** A node's border and breathing room around its text, when a title wraps. */
const NODE_CHROME = 8;
const PAD = 12;

interface MapFit {
  /** Every node's height: the tallest node's text decides it, so rows stay even. */
  nodeHeight: number;
  width: number;
  /** Each edge label's drawn length, so a label too long for its gap moves above the nodes. */
  labels: Record<string, number>;
}

function sameFit(a: MapFit, b: MapFit): boolean {
  if (a.nodeHeight !== b.nodeHeight || a.width !== b.width) return false;
  const keys = Object.keys(b.labels);
  return (
    keys.length === Object.keys(a.labels).length &&
    keys.every((key) => Math.abs((a.labels[key] ?? -1) - b.labels[key]) < 0.5)
  );
}

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
  const frame = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<MapFit>({ nodeHeight: NODE_HEIGHT, width: 0, labels: {} });
  // Titles wrap to two lines in wide locales; every row grows to the tallest node's text.
  useLayoutEffect(() => {
    const element = frame.current;
    if (!element) return;
    let live = true;
    const measure = () => {
      if (!live) return;
      let tallest = 0;
      for (const text of element.querySelectorAll<HTMLElement>('[data-slot="map-text"]')) {
        tallest = Math.max(tallest, text.offsetHeight);
      }
      const labels: Record<string, number> = {};
      for (const text of element.querySelectorAll<SVGTextElement>('text[data-edge]')) {
        labels[text.dataset.edge!] = text.getComputedTextLength();
      }
      const next = {
        nodeHeight: Math.max(NODE_HEIGHT, Math.ceil(tallest) + NODE_CHROME),
        width: element.clientWidth,
        labels,
      };
      setFit((current) => (sameFit(current, next) ? current : next));
    };
    measure();
    void document.fonts?.ready.then(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [map]);
  const { nodeHeight } = fit;
  const row = nodeHeight + ROW_GAP;
  const centerY = (slot: number) => PAD + slot * row + nodeHeight / 2;
  const height = PAD * 2 + (map.rows - 1) * row + nodeHeight;
  const nodes = new Map(map.nodes.map((node) => [node.id, node]));
  return (
    <section
      aria-label={t`Connection map`}
      className={cn(
        'bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:14px_14px] px-3 py-2',
        className,
      )}
    >
      <div ref={frame} className="relative min-w-0" style={{ height }}>
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
            const key = `${edge.from}>${edge.to}`;
            // The label sits over the line in the gap, as drawn, while it fits there;
            // a longer one ("Απευθείας") moves above the nodes so it never runs under one.
            const length = fit.labels[key];
            const inGap = !length || !fit.width || length + 6 <= ((x2 - x1) / 100) * fit.width;
            const labelY = inGap ? (y1 + y2) / 2 - 5 : Math.min(y1, y2) - nodeHeight / 2 - 4;
            return (
              <g
                key={key}
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
                    className="fill-muted-foreground stroke-none text-[0.625rem]"
                    data-edge={key}
                    textAnchor="middle"
                    x={`${(x1 + x2) / 2}%`}
                    y={labelY}
                  >
                    {edge.label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
        <div
          aria-label={t`Connections from this client to the agent and managed computers`}
          className="absolute inset-0"
          role="list"
        >
          {map.nodes.map((node) => (
            <MapNodeView
              key={node.id}
              height={nodeHeight}
              node={node}
              top={PAD + node.row * row}
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
  top,
  height,
  onReconnect,
  reconnecting,
}: {
  node: MapNode;
  top: number;
  height: number;
  onReconnect?: (host: SshHost) => Promise<unknown>;
  reconnecting: boolean;
}) {
  const column = COLUMNS[node.column];
  const className = cn(
    'flex size-full min-w-0 items-center gap-2 rounded-[7px] border px-2.5 text-left outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring',
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
      <span className="flex min-w-0 flex-col leading-tight" data-slot="map-text">
        <span className="line-clamp-2 text-meta font-semibold break-words text-foreground">
          {node.title}
        </span>
        <span className="line-clamp-2 text-caption break-words text-muted-foreground">
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
      style={{ left: `${column.left}%`, top, width: `${column.width}%`, height }}
    >
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent className="flex-col items-start gap-0.5 px-[9px] py-1.5" side="bottom" sideOffset={4}>
          <span className="font-semibold">{node.title}</span>
          <span>{action ? `${node.detail}. ${action.hint}` : node.detail}</span>
        </TooltipContent>
      </Tooltip>
    </div>
  );
});

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
      detail: isLocal ? t`Local` : state!.detail,
      brief: state?.brief,
      tone: state?.tone ?? 'ok',
      action:
        state?.reconnect && canReconnect && host?.ssh
          ? {
              kind: 'reconnect',
              host: sshHostFromTarget(host),
              label: t`Reconnect ${ph({ label: host.label })}`,
              hint: t`Enter to reconnect.`,
            }
          : {
              kind: 'link',
              to: `/infrastructure/services?target=${encodeURIComponent(band.id)}`,
              label: t`Services on ${hostName}`,
              hint: t`Enter to open its services.`,
            },
    });
    const route = host?.kind === 'ssh' ? 'SSH' : host?.kind === 'direct' ? 'Direct' : undefined;
    edges.push({
      from: 'agent',
      to: hostId,
      label:
        route && !labelled.has(route)
          ? route === 'Direct'
            ? t({ message: 'Direct', context: 'network route' })
            : route
          : undefined,
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
        detail: port ? t`${ph({ status: status.label })}, port ${port}` : status.label,
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
          label: t`Manage ${name} on ${hostName}`,
          hint: t`Enter to manage it.`,
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
      title: t`Remote computers`,
      detail: t`None added`,
      tone: 'idle',
      action: {
        kind: 'link',
        to: '/infrastructure/agent',
        label: t`Add a computer`,
        hint: t`Enter to add one.`,
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
      title: t`This client`,
      detail: client,
      tone: 'ok',
    },
    {
      id: 'agent',
      column: 1,
      row: middle,
      icon: <BrandIcon className="size-3.5" />,
      title: t`Connected ${ph({ agent: vocab.agent })}`,
      detail: agentLabel,
      tone: 'self',
      action: {
        kind: 'link',
        to: `/infrastructure/services?target=${encodeURIComponent(localId)}`,
        label: t`Manage services on connected ${ph({ agent: vocab.agent })} ${agentLabel}`,
        hint: t`Enter to open its services.`,
      },
    },
  );
  edges.unshift({
    from: 'client',
    to: 'agent',
    label: agentRoute === 'Direct' ? t({ message: 'Direct', context: 'network route' }) : 'SSH',
  });
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
  const detail = jump
    ? t`via ${jump}, ${words}`
    : host.kind === 'direct'
      ? words
      : t`SSH: ${words}`;
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
