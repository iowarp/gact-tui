import { queryKeys } from '@/lib/query-keys';
import { INFRASTRUCTURE_POLL_MS, MCP_PREPARING_POLL_MS } from '@/lib/runtime-limits';
import { anyServerPreparing } from '@/lib/mcp-preparation';
import type { McpServerDefinition } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { NetworkIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { IconButton } from '@/components/clio/primitives/icon-button';
import { ListRow } from '@/components/clio/primitives/list-row';
import { StatusIndicator, type StatusTone } from '@/components/clio/primitives/status-indicator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useRepository } from '@/hooks/use-repository';
import { vocab } from '@/lib/brand-vocabulary';
import { cn } from '@/lib/utils';
import { useConnectionSettings } from '@/providers/connection-provider';
import { workspaceIdFromRoute } from '@/lib/workspace-route-memory';
import { serviceTitle } from '@/lib/mcp-service-presentation';
import { mcpServerPreparation } from '@/lib/mcp-preparation';
import { HISTORY_MODE_DETAIL, HISTORY_MODE_LABEL, isHistoryMode } from '@/lib/context-mode';

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
  const workspaceId = workspaceIdFromRoute(from);
  const health = useQuery({
    queryKey: queryKeys.key('service-health', settings.endpoint),
    queryFn: ({ signal }) => repository.serviceHealth(signal),
    refetchInterval: INFRASTRUCTURE_POLL_MS,
  });
  const servers = useQuery({
    queryKey: queryKeys.key('mcp-servers', settings.endpoint, workspaceId || 'infrastructure'),
    queryFn: ({ signal }) => repository.mcpServers(workspaceId, signal),
    refetchInterval: (query) =>
      anyServerPreparing(query.state.data) ? MCP_PREPARING_POLL_MS : INFRASTRUCTURE_POLL_MS,
  });

  const items = useMemo<InfrastructureItem[]>(() => {
    const integrationWarnings =
      health.data?.integrations.filter(
        (integration) =>
          integration.required !== false &&
          !['ready', 'healthy', 'live', 'skipped'].includes(integration.status),
      ).length ?? 0;
    const agentState: InfrastructureItem = health.isPending
      ? {
          id: 'agent-service',
          label: vocab.agent,
          state: 'checking',
          stateLabel: 'Checking',
        }
      : health.error || !health.data?.healthy
        ? {
            id: 'agent-service',
            label: vocab.agent,
            state: 'failed',
            stateLabel: 'Unavailable',
            detail: health.error?.message,
          }
        : isHistoryMode(health.data)
          ? {
              id: 'agent-service',
              label: vocab.agent,
              state: 'degraded',
              stateLabel: HISTORY_MODE_LABEL,
              detail: HISTORY_MODE_DETAIL,
            }
          : integrationWarnings
            ? {
                id: 'agent-service',
                label: vocab.agent,
                state: 'degraded',
                stateLabel: 'Warning',
                detail: `${integrationWarnings} supporting ${integrationWarnings === 1 ? 'service needs' : 'services need'} attention`,
              }
            : {
                id: 'agent-service',
                label: vocab.agent,
                state: 'healthy',
                stateLabel: 'Ready',
              };

    const serviceItems = servers.isPending
      ? [
          {
            id: 'tool-services',
            label: 'MCP tools',
            state: 'checking' as const,
            stateLabel: 'Checking',
          },
        ]
      : servers.error
        ? [
            {
              id: 'tool-services',
              label: 'MCP tools',
              state: 'failed' as const,
              stateLabel: 'Unavailable',
              detail: servers.error.message,
            },
          ]
        : consolidateServiceItems((servers.data ?? []).map(serverItem));

    return [agentState, ...serviceItems];
  }, [health.data, health.error, health.isPending, servers.data, servers.error, servers.isPending]);

  const overall = aggregateInfrastructureState(items);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <IconButton
          className={cn(OVERALL_TONE[overall.state])}
          icon={<NetworkIcon />}
          label={`Infrastructure: ${overall.stateLabel}`}
          shortcut="infrastructure"
          shortcutPlacement="above"
          tooltipSide="top"
        />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-0 p-0" side="top">
        <div className="flex h-9 min-w-0 items-center gap-2 border-b border-border px-3">
          <p className="text-[13px] font-semibold">Infrastructure</p>
          <p className="min-w-0 flex-1 truncate text-right text-[12px] text-muted-foreground">
            {overall.detail || infrastructureSummary(items)}
          </p>
        </div>
        <div className="max-h-56 overflow-y-auto p-1.5">
          {items.map((item) => (
            <Link
              aria-label={`${item.label}: ${item.stateLabel}`}
              className="block rounded-[6px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
              key={item.id}
              onClick={() => setOpen(false)}
              state={{ endpoint, from }}
              title={item.detail ? `${item.stateLabel}: ${item.detail}` : item.stateLabel}
              to="/infrastructure"
            >
              <ListRow
                className="cursor-pointer"
                description={item.stateLabel}
                status={
                  <StatusIndicator
                    display="column"
                    label={item.stateLabel}
                    tone={ITEM_TONE[item.state]}
                  />
                }
                title={item.label}
              />
            </Link>
          ))}
        </div>
        <div className="border-t border-border p-1.5">
          <Link
            className="flex h-7 items-center rounded-[6px] px-1.5 text-[13px] text-primary outline-none hover:bg-hover focus-visible:ring-1 focus-visible:ring-ring"
            onClick={() => setOpen(false)}
            state={{ endpoint, from }}
            to="/infrastructure"
          >
            Open Infrastructure
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const OVERALL_TONE: Record<InfrastructureState, string | undefined> = {
  checking: undefined,
  healthy: undefined,
  degraded: 'text-warning hover:text-warning',
  failed: 'text-destructive hover:text-destructive',
  unavailable: undefined,
};

const ITEM_TONE: Record<InfrastructureState, StatusTone> = {
  checking: 'running',
  healthy: 'success',
  degraded: 'warning',
  failed: 'error',
  unavailable: 'idle',
};

/**
 * Severity comes from the typed fields the service owns; `status` is free-form
 * prose and is shown verbatim rather than pattern-matched into a severity.
 */
function serverItem(server: McpServerDefinition): InfrastructureItem {
  const label = serviceTitle(server);
  if (server.status === 'ready') {
    return { id: server.id, label, state: 'healthy', stateLabel: 'Ready' };
  }
  const preparation = mcpServerPreparation(server);
  if (preparation) {
    return {
      id: server.id,
      label,
      state: preparation.state === 'preparing' ? 'checking' : 'failed',
      stateLabel: preparation.label,
      detail: preparation.sentence,
    };
  }
  if (server.error) {
    return {
      id: server.id,
      label,
      state: 'failed',
      stateLabel: server.status,
      detail: server.error,
    };
  }
  return { id: server.id, label, state: 'unavailable', stateLabel: server.status };
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
  const historyMode = items.find(
    (item) => item.id === 'agent-service' && item.stateLabel === HISTORY_MODE_LABEL,
  );
  if (historyMode) {
    return { ...historyMode, id: 'infrastructure', label: 'Infrastructure' };
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

function infrastructureSummary(items: readonly InfrastructureItem[]): string {
  const active = items.filter((item) => item.state !== 'unavailable');
  if (!active.length) return 'No optional services are connected.';
  const attention = active.filter((item) => ['failed', 'degraded'].includes(item.state));
  if (!attention.length) return `${vocab.agent} and connected services are ready.`;
  return attention.map((item) => `${item.label}: ${item.stateLabel}`).join('; ');
}
