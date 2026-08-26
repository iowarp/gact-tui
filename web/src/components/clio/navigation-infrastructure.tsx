import type { McpServerDefinition } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  CircleAlertIcon,
  CircleDashedIcon,
  LoaderCircleIcon,
  XCircleIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { useRepository } from '@/hooks/use-repository';
import { cn } from '@/lib/utils';
import { useConnectionSettings } from '@/providers/connection-provider';
import { humanizeToolName } from './tool-presentation';

type InfrastructureState = 'checking' | 'healthy' | 'degraded' | 'failed' | 'unavailable';

interface InfrastructureItem {
  id: string;
  label: string;
  state: InfrastructureState;
  stateLabel: string;
  detail?: string;
}

interface NavigationInfrastructureProps {
  endpoint: string;
  from: string;
}

export function NavigationInfrastructure({ endpoint, from }: NavigationInfrastructureProps) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const [open, setOpen] = useState(false);
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

  const items = useMemo<InfrastructureItem[]>(() => {
    const integrationWarnings =
      health.data?.integrations.filter(
        (integration) => !['ready', 'healthy', 'live'].includes(integration.status),
      ).length ?? 0;
    const agentState: InfrastructureItem = health.isPending
      ? {
          id: 'agent-service',
          label: 'Agent service',
          state: 'checking',
          stateLabel: 'Checking',
        }
      : health.error || !health.data?.healthy
        ? {
            id: 'agent-service',
            label: 'Agent service',
            state: 'failed',
            stateLabel: 'Unavailable',
            detail: health.error?.message,
          }
        : integrationWarnings
          ? {
              id: 'agent-service',
              label: 'Agent service',
              state: 'degraded',
              stateLabel: 'Warning',
              detail: `${integrationWarnings} supporting ${integrationWarnings === 1 ? 'service needs' : 'services need'} attention`,
            }
          : {
              id: 'agent-service',
              label: 'Agent service',
              state: 'healthy',
              stateLabel: 'Ready',
            };

    const relayState: InfrastructureItem = relay.isPending
      ? {
          id: 'remote-work',
          label: 'Remote work',
          state: 'checking',
          stateLabel: 'Checking',
        }
      : relay.error
        ? {
            id: 'remote-work',
            label: 'Remote work',
            state: 'failed',
            stateLabel: 'Unavailable',
            detail: relay.error.message,
          }
        : relay.data?.reachable
          ? {
              id: 'remote-work',
              label: 'Remote work',
              state: 'healthy',
              stateLabel: 'Ready',
            }
          : relay.data?.configured
            ? {
                id: 'remote-work',
                label: 'Remote work',
                state: 'degraded',
                stateLabel: 'Warning',
                detail: relay.data.detail || relay.data.reason,
              }
            : {
                id: 'remote-work',
                label: 'Remote work',
                state: 'unavailable',
                stateLabel: 'Not connected',
              };

    const serviceItems = servers.isPending
      ? [
          {
            id: 'tool-services',
            label: 'Tools and data',
            state: 'checking' as const,
            stateLabel: 'Checking',
          },
        ]
      : servers.error
        ? [
            {
              id: 'tool-services',
              label: 'Tools and data',
              state: 'failed' as const,
              stateLabel: 'Unavailable',
              detail: servers.error.message,
            },
          ]
        : consolidateServiceItems((servers.data ?? []).map(serverItem));

    return [agentState, relayState, ...serviceItems];
  }, [
    health.data,
    health.error,
    health.isPending,
    relay.data,
    relay.error,
    relay.isPending,
    servers.data,
    servers.error,
    servers.isPending,
  ]);

  const overall = aggregateInfrastructureState(items);

  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <SidebarMenuItem>
        <SidebarMenuButton asChild tooltip={`Infrastructure — ${overall.stateLabel}`}>
          <Link
            aria-label={`Infrastructure: ${overall.stateLabel}`}
            state={{ endpoint, from }}
            to="/infrastructure"
          >
            <InfrastructureStateIcon state={overall.state} />
            <span>Infrastructure</span>
          </Link>
        </SidebarMenuButton>
        <SidebarMenuAction
          aria-expanded={open}
          aria-label={open ? 'Hide infrastructure status' : 'Show infrastructure status'}
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          <ChevronDownIcon
            aria-hidden="true"
            className={cn('transition-transform', open && 'rotate-180')}
          />
        </SidebarMenuAction>
        <CollapsibleContent>
          <SidebarMenuSub className="max-h-48 overflow-y-auto">
            {items.map((item) => (
              <SidebarMenuSubItem key={item.id}>
                <SidebarMenuSubButton asChild size="sm">
                  <Link
                    aria-label={`${item.label}: ${item.stateLabel}`}
                    state={{ endpoint, from }}
                    title={item.detail ? `${item.stateLabel}: ${item.detail}` : item.stateLabel}
                    to="/infrastructure"
                  >
                    <InfrastructureStateIcon state={item.state} />
                    <span>{item.label}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                      {item.stateLabel}
                    </span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

function serverItem(server: McpServerDefinition): InfrastructureItem {
  const label = serviceTitle(server);
  if (server.status === 'ready') {
    return { id: server.id, label, state: 'healthy', stateLabel: 'Ready' };
  }
  if (/pending|connecting|installing|starting/iu.test(server.status)) {
    return { id: server.id, label, state: 'checking', stateLabel: 'Starting' };
  }
  if (/fail|error|unreachable|disconnected/iu.test(server.status)) {
    return {
      id: server.id,
      label,
      state: 'failed',
      stateLabel: 'Failed',
      detail: server.error,
    };
  }
  return {
    id: server.id,
    label,
    state: 'degraded',
    stateLabel: humanizeToolName(server.status),
    detail: server.error,
  };
}

function consolidateServiceItems(items: InfrastructureItem[]): InfrastructureItem[] {
  const groups = new Map<string, InfrastructureItem[]>();
  for (const item of items) {
    const group = groups.get(item.label) ?? [];
    group.push(item);
    groups.set(item.label, group);
  }

  return Array.from(groups.values(), (group) => {
    if (group.length === 1) return group[0];
    const state = worstInfrastructureState(group);
    const matchingState = group.every((item) => item.state === state);
    return {
      id: group.map((item) => item.id).join(':'),
      label: group[0].label,
      state,
      stateLabel: matchingState
        ? `${group.length} ${stateLabel(state).toLocaleLowerCase()}`
        : 'Mixed state',
      detail: `${group.length} configured connections. Open Infrastructure to inspect each connection.`,
    };
  });
}

function worstInfrastructureState(items: readonly InfrastructureItem[]): InfrastructureState {
  const priority: InfrastructureState[] = [
    'failed',
    'checking',
    'degraded',
    'healthy',
    'unavailable',
  ];
  return priority.find((state) => items.some((item) => item.state === state)) ?? 'unavailable';
}

function stateLabel(state: InfrastructureState): string {
  return {
    checking: 'Checking',
    healthy: 'Ready',
    degraded: 'Warning',
    failed: 'Failed',
    unavailable: 'Unavailable',
  }[state];
}

function serviceTitle(server: McpServerDefinition): string {
  const names: Record<string, string> = {
    fs: 'Workspace files',
    filesystem: 'Workspace files',
    shell: 'Command execution',
    'clio-web-search': 'Web search',
  };
  const known = names[server.id] || names[server.name];
  if (known) return known;
  const configuredTitle = server.spec.title ?? server.spec.display_name;
  if (typeof configuredTitle === 'string' && configuredTitle.trim()) return configuredTitle;
  return humanizeToolName(server.name || server.id);
}

function aggregateInfrastructureState(items: readonly InfrastructureItem[]): InfrastructureItem {
  if (items.some((item) => item.state === 'failed')) {
    return {
      id: 'infrastructure',
      label: 'Infrastructure',
      state: 'failed',
      stateLabel: 'Needs attention',
    };
  }
  if (items.some((item) => item.state === 'checking')) {
    return {
      id: 'infrastructure',
      label: 'Infrastructure',
      state: 'checking',
      stateLabel: 'Checking',
    };
  }
  if (items.some((item) => item.state === 'degraded')) {
    return {
      id: 'infrastructure',
      label: 'Infrastructure',
      state: 'degraded',
      stateLabel: 'Warning',
    };
  }
  if (items.length > 0 && items.every((item) => item.state === 'unavailable')) {
    return {
      id: 'infrastructure',
      label: 'Infrastructure',
      state: 'unavailable',
      stateLabel: 'Unavailable',
    };
  }
  return { id: 'infrastructure', label: 'Infrastructure', state: 'healthy', stateLabel: 'Ready' };
}

function InfrastructureStateIcon({ state }: { state: InfrastructureState }) {
  const presentation = {
    checking: {
      icon: LoaderCircleIcon,
      label: 'Checking',
      className: 'text-info motion-safe:animate-spin',
    },
    healthy: { icon: CheckCircle2Icon, label: 'Ready', className: 'text-success' },
    degraded: { icon: CircleAlertIcon, label: 'Warning', className: 'text-warning' },
    failed: { icon: XCircleIcon, label: 'Failed', className: 'text-destructive' },
    unavailable: {
      icon: CircleDashedIcon,
      label: 'Unavailable',
      className: 'text-muted-foreground',
    },
  }[state];
  const Icon = presentation.icon;
  return (
    <>
      <Icon aria-hidden="true" className={presentation.className} />
      <span className="sr-only">{presentation.label}</span>
    </>
  );
}
