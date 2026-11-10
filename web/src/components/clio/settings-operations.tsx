import { queryKeys } from '@/lib/query-keys';
import { OPERATIONS_POLL_MS } from '@/lib/runtime-limits';
import type { ServiceIntegrationHealth } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { ChevronDownIcon, HeartPulseIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { DetailPane, ListDetailLayout } from './primitives/detail-pane';
import { ItemList, ItemRow } from './primitives/item-row';
import { StateView } from './primitives/state-view';
import { StatusIndicator, type StatusTone } from './primitives/status-indicator';
import { SettingsLoadError, UnofferedParts } from './settings-health-load-error';
import { notOffered } from './settings-health-reason';
import { HooksGroup, MetricsGroup, StorageGroup } from './settings-health-views';
import { SettingsGroupLabel } from './settings-row';
import { SettingsSectionHeading } from './settings-section-heading';
import { humanizeToolName } from './tool-presentation';

function statusValue(status: string) {
  if (['ready', 'healthy', 'live'].includes(status)) return 'healthy';
  if (['degraded', 'warning', 'reconnecting'].includes(status)) return 'degraded';
  return 'unavailable';
}

function statusOf(status: string): { tone: StatusTone; label: string } {
  const value = statusValue(status);
  if (value === 'healthy') return { tone: 'success', label: 'Ready' };
  if (value === 'degraded') return { tone: 'warning', label: 'Needs attention' };
  return { tone: 'error', label: 'Unavailable' };
}

const integrationTitles: Record<string, string> = {
  lm_provider: 'Language model provider',
  arc: 'Conversation memory',
  clio_core_ram_cap: 'Memory working limit',
  clio_core_liveness: 'Memory service connection',
  clio_core_daemon_memory: 'Memory service process',
  cte_cold_tier_disk: 'Stored memory capacity',
  file_policy: 'File access policy',
  gateway: 'Tools',
  api: 'Workspace service',
  clio_core: 'Memory storage',
  clio_core_attach: 'Memory service attachment',
  cte_store_location: 'Stored memory location',
  cte_metadata_log: 'Stored memory log',
  sandbox: 'Protected execution',
  sandbox_conformance: 'Execution protection coverage',
  child_reaper: 'Process cleanup',
  child_processes: 'Background processes',
  child_parentage: 'Background process ownership',
  compaction_prompt: 'Compaction instructions',
  browser: 'Browser',
  ripgrep: 'File search',
  managed_packages: 'Managed packages',
  store_migrations: 'Stored data upgrades',
  arc_store_format: 'Stored data format',
};

function integrationTitle(name: string) {
  const title = integrationTitles[name] ?? humanizeToolName(name);
  // An unknown identifier still reads as words, never as snake_case.
  return /_/u.test(title)
    ? title.charAt(0).toUpperCase() + title.slice(1).replaceAll('_', ' ')
    : title;
}

function integrationCopy(integration: ServiceIntegrationHealth) {
  const fallbackSummary = integration.summary ?? integration.detail ?? 'No detail reported.';
  if (integration.name === 'arc' && statusValue(integration.status) === 'degraded') {
    return {
      summary:
        'Conversation memory is using a limited local store. Some retention and cross-session recall features may be unavailable.',
      nextAction: 'Use the standard memory service when you need complete retention and recall.',
      fallbackSummary,
    };
  }
  if (integration.name === 'child_parentage' && statusValue(integration.status) === 'degraded') {
    return {
      summary:
        'Some background work is no longer attached to this service and may continue after the service stops.',
      nextAction: 'Review and stop orphaned background work, then restart the affected task.',
      fallbackSummary,
    };
  }
  return {
    summary: fallbackSummary,
    nextAction: integration.next_action,
    fallbackSummary,
  };
}

function recordedAction(integration: ServiceIntegrationHealth) {
  return integration.next_action && integration.next_action !== 'No action required.'
    ? integration.next_action
    : undefined;
}

/** One integration's summary, what to do next and the reported technical details. */
function IntegrationDetail({
  integration,
  onClose,
}: {
  integration: ServiceIntegrationHealth;
  onClose: () => void;
}) {
  const copy = integrationCopy(integration);
  const recorded = recordedAction(integration);
  const status = statusOf(integration.status);
  const hasTechnicalDetails =
    copy.summary !== copy.fallbackSummary ||
    copy.nextAction !== recorded ||
    Boolean(integration.endpoint);
  const next = copy.nextAction && copy.nextAction !== 'No action required.' ? copy.nextAction : '';
  return (
    <DetailPane
      icon={<HeartPulseIcon />}
      onClose={onClose}
      title={integrationTitle(integration.name)}
    >
      <div className="grid gap-3 pt-1 leading-5">
        <StatusIndicator label={status.label} tone={status.tone} />
        <p className="text-muted-foreground">{copy.summary}</p>
        {next ? (
          <div>
            <SettingsGroupLabel className="mt-0">What to do next</SettingsGroupLabel>
            <p>{next}</p>
          </div>
        ) : null}
        {hasTechnicalDetails ? (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button className="group -ml-2" size="sm" variant="ghost">
                Technical details
                <ChevronDownIcon
                  aria-hidden="true"
                  className="motion-safe:transition-transform group-data-[state=open]:rotate-180"
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1 grid gap-1.5 border-l border-border pl-3 text-xs text-muted-foreground">
              <p>{copy.fallbackSummary}</p>
              {recorded ? <p>Recorded next action: {recorded}</p> : null}
              {integration.endpoint ? (
                <p className="font-mono break-all">{integration.endpoint}</p>
              ) : null}
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </div>
    </DetailPane>
  );
}

function IntegrationList({
  integrations,
  openName,
  setOpenName,
}: {
  integrations: readonly ServiceIntegrationHealth[];
  openName?: string;
  setOpenName: (update: (current?: string) => string | undefined) => void;
}) {
  return (
    <>
      {integrations.length ? (
        <ItemList label="Integrations">
          {integrations.map((integration) => {
            const copy = integrationCopy(integration);
            const status = statusOf(integration.status);
            const next = recordedAction(integration) ?? copy.nextAction;
            const meta =
              next && next !== 'No action required.'
                ? next
                : (integration.summary ?? integration.detail);
            const toggle = () =>
              setOpenName((current) =>
                current === integration.name ? undefined : integration.name,
              );
            return (
              <ItemRow
                aria-expanded={openName === integration.name}
                className="cursor-pointer"
                icon={<HeartPulseIcon />}
                key={integration.name}
                meta={meta ? <span title={meta}>{meta}</span> : undefined}
                onClick={toggle}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  toggle();
                }}
                role="button"
                selected={openName === integration.name}
                status={<StatusIndicator label={status.label} tone={status.tone} />}
                statusWidth={140}
                tabIndex={0}
                title={integrationTitle(integration.name)}
              />
            );
          })}
        </ItemList>
      ) : (
        <StateView kind="empty" size="row" title="No integrations reported" />
      )}
    </>
  );
}

function QueryState({
  error,
  pending,
  title,
  noun,
  loading,
  retry,
  retrying,
}: {
  error: Error | null;
  pending: boolean;
  title: string;
  noun: string;
  loading: string;
  retry: () => void;
  retrying: boolean;
}) {
  if (error)
    return (
      <SettingsLoadError
        error={error}
        noun={noun}
        onRetry={retry}
        retrying={retrying}
        title={title}
      />
    );
  return pending ? <StateView kind="loading" size="row" title={loading} /> : null;
}

const PARTS = ['health details', 'storage statistics', 'activity metrics', 'hook inspection'];

/** A feature the service does not offer will not appear by polling. */
const pollUnlessNotOffered = (query: { state: { error: Error | null } }) =>
  notOffered(query.state.error) ? false : OPERATIONS_POLL_MS;

/** Health, storage, metrics and hooks of the connected service as groups on one flat page. */
export function SystemSettings() {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const [openName, setOpenName] = useState<string>();
  const health = useQuery({
    queryKey: queryKeys.key('service-health', settings.endpoint),
    queryFn: ({ signal }) => repository.serviceHealth(signal),
    refetchInterval: pollUnlessNotOffered,
  });
  const metrics = useQuery({
    queryKey: queryKeys.key('runtime-metrics', settings.endpoint),
    queryFn: ({ signal }) => repository.runtimeMetrics(signal),
    refetchInterval: pollUnlessNotOffered,
  });
  const memory = useQuery({
    queryKey: queryKeys.key('memory-statistics', settings.endpoint),
    queryFn: ({ signal }) => repository.memoryStatistics(signal),
    refetchInterval: pollUnlessNotOffered,
  });
  const hooks = useQuery({
    queryKey: queryKeys.key('hook-inspection', settings.endpoint),
    queryFn: ({ signal }) => repository.hooks(signal),
    refetchInterval: pollUnlessNotOffered,
  });
  const integrations = health.data?.integrations ?? [];
  const open = integrations.find((integration) => integration.name === openName);
  const ready = integrations.filter((row) => statusValue(row.status) === 'healthy').length;
  // One list-width column, so the rows, counts and integrations share the ItemList edge.
  const list = (
    <UnofferedParts order={PARTS}>
      <div className="@container min-w-0">
        {notOffered(health.error) ? null : (
          <SettingsGroupLabel
            className="mt-2"
            actions={
              integrations.length ? (
                <span className="tabular-nums">
                  {ready} of {integrations.length} ready
                </span>
              ) : undefined
            }
            info="Each service the agent depends on. Open one for what to do next."
          >
            Integrations
          </SettingsGroupLabel>
        )}
        {health.data ? (
          <IntegrationList
            integrations={integrations}
            openName={openName}
            setOpenName={setOpenName}
          />
        ) : null}
        <QueryState
          error={health.error}
          loading="Checking service health…"
          pending={health.isPending}
          retry={() => void health.refetch()}
          retrying={health.isFetching}
          noun="health details"
          title="Health details unavailable."
        />
        {notOffered(memory.error) ? null : (
          <SettingsGroupLabel info="What the agent's memory store holds and how often its cache answers.">
            Storage
          </SettingsGroupLabel>
        )}
        {memory.data ? <StorageGroup memory={memory.data} /> : null}
        <QueryState
          error={memory.error}
          loading="Loading memory statistics…"
          pending={memory.isPending}
          retry={() => void memory.refetch()}
          retrying={memory.isFetching}
          noun="storage statistics"
          title="Storage statistics unavailable."
        />
        {notOffered(metrics.error) ? null : (
          <SettingsGroupLabel info="Totals since the agent started.">Metrics</SettingsGroupLabel>
        )}
        {metrics.data ? <MetricsGroup metrics={metrics.data} /> : null}
        <QueryState
          error={metrics.error}
          loading="Loading activity…"
          pending={metrics.isPending}
          retry={() => void metrics.refetch()}
          retrying={metrics.isFetching}
          noun="activity metrics"
          title="Activity metrics unavailable."
        />
        {notOffered(hooks.error) ? null : (
          <SettingsGroupLabel info="Automation that runs before or after tools, and what it recently did.">
            Hooks
          </SettingsGroupLabel>
        )}
        {hooks.data ? <HooksGroup hooks={hooks.data} /> : null}
        <QueryState
          error={hooks.error}
          loading="Loading hooks…"
          pending={hooks.isPending}
          retry={() => void hooks.refetch()}
          retrying={hooks.isFetching}
          noun="hook inspection"
          title="Hook inspection unavailable."
        />
      </div>
    </UnofferedParts>
  );
  return (
    <div className="min-w-0">
      <SettingsSectionHeading
        info="Review service health, storage, activity and automation hooks. Status comes from your connected service."
        title="Health"
      />
      <ListDetailLayout
        detail={
          open ? (
            <IntegrationDetail
              integration={open}
              key={open.name}
              onClose={() => setOpenName(undefined)}
            />
          ) : undefined
        }
        list={list}
      />
    </div>
  );
}
