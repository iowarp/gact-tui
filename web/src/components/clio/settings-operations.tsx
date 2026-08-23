import type { RuntimeMetrics, ServiceIntegrationHealth } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import {
  ActivityIcon,
  BrainCircuitIcon,
  GaugeIcon,
  HeartPulseIcon,
  WebhookIcon,
} from 'lucide-react';
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from '@/components/reui/frame';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ClioInteractiveRow } from './interactive-row';
import { ClioStatus } from './status';
import { humanizeToolName } from './tool-presentation';

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <header>
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Settings</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
    </header>
  );
}

function statusValue(status: string) {
  if (['ready', 'healthy', 'live'].includes(status)) return 'healthy';
  if (['degraded', 'warning', 'reconnecting'].includes(status)) return 'degraded';
  return 'unavailable';
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
  sandbox: 'Protected execution',
  sandbox_conformance: 'Execution protection coverage',
  child_reaper: 'Process cleanup',
  child_processes: 'Background processes',
  child_parentage: 'Background process ownership',
};

function integrationTitle(name: string) {
  return integrationTitles[name] ?? humanizeToolName(name);
}

function metricTitle(name: string) {
  return humanizeToolName(
    name
      .replace(/^tool:/, '')
      .replace(/^remote_(?:scientific_)?/, '')
      .replace(/^(jarvis|spack|plot)_\1_/, '$1_'),
  );
}

function number(value: number) {
  return new Intl.NumberFormat().format(value);
}

function duration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function ErrorState({ title, message }: { title: string; message: string }) {
  return (
    <Alert variant="destructive">
      <ActivityIcon aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

function HealthTab({ integrations }: { integrations: readonly ServiceIntegrationHealth[] }) {
  return (
    <Accordion className="rounded-xl border px-4" type="multiple">
      {integrations.map((integration) => (
        <AccordionItem key={integration.name} value={integration.name}>
          <AccordionTrigger>
            <span className="flex min-w-0 items-center gap-3 text-left">
              <HeartPulseIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
              <span className="truncate font-medium">{integrationTitle(integration.name)}</span>
              <ClioStatus
                className="ml-auto mr-2 shrink-0"
                label={integration.status.replaceAll('_', ' ')}
                value={statusValue(integration.status)}
              />
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-3 pl-7 text-sm leading-6 text-muted-foreground">
            <p>{integration.summary ?? integration.detail ?? 'No detail reported.'}</p>
            {integration.next_action && integration.next_action !== 'No action required.' ? (
              <Alert>
                <AlertTitle>What to do next</AlertTitle>
                <AlertDescription>{integration.next_action}</AlertDescription>
              </Alert>
            ) : null}
            {integration.endpoint ? (
              <p className="break-all font-mono text-xs">{integration.endpoint}</p>
            ) : null}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

function MetricsTab({ metrics }: { metrics: RuntimeMetrics }) {
  const latencyRows = Object.entries(metrics.latencies)
    .sort((left, right) => right[1].p95_ms - left[1].p95_ms)
    .slice(0, 12);
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Sessions" value={number(metrics.sessions.total)} />
        <Metric label="Messages" value={number(metrics.messages.total)} />
        <Metric
          label="Tokens"
          value={number(metrics.tokens.input_total + metrics.tokens.output_total)}
        />
        <Metric label="Uptime" value={duration(metrics.uptime_s)} />
      </div>
      <Frame spacing="sm">
        <FrameHeader>
          <FrameTitle>Slowest reported activity</FrameTitle>
          <FrameDescription>Ranked by 95th-percentile duration.</FrameDescription>
        </FrameHeader>
        <FramePanel className="grid gap-1 p-2">
          {latencyRows.map(([name, latency]) => (
            <ClioInteractiveRow key={name}>
              <div className="flex items-center gap-3">
                <GaugeIcon aria-hidden="true" className="size-4 text-primary" />
                <p className="min-w-0 flex-1 truncate text-sm font-medium">{metricTitle(name)}</p>
                <span className="font-mono text-xs text-muted-foreground">
                  p95 {(latency.p95_ms / 1000).toFixed(1)}s, {number(latency.count)} calls
                </span>
              </div>
            </ClioInteractiveRow>
          ))}
        </FramePanel>
      </Frame>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Frame spacing="sm">
      <FramePanel>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      </FramePanel>
    </Frame>
  );
}

export function SystemSettings() {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const health = useQuery({
    queryKey: ['service-health', settings.endpoint],
    queryFn: ({ signal }) => repository.serviceHealth(signal),
    refetchInterval: 30_000,
  });
  const metrics = useQuery({
    queryKey: ['runtime-metrics', settings.endpoint],
    queryFn: ({ signal }) => repository.runtimeMetrics(signal),
    refetchInterval: 30_000,
  });
  const memory = useQuery({
    queryKey: ['memory-statistics', settings.endpoint],
    queryFn: ({ signal }) => repository.memoryStatistics(signal),
    refetchInterval: 30_000,
  });
  const hooks = useQuery({
    queryKey: ['hook-inspection', settings.endpoint],
    queryFn: ({ signal }) => repository.hooks(signal),
    refetchInterval: 30_000,
  });
  return (
    <div className="grid gap-6">
      <SectionHeading
        description="Inspect service health, activity, retained memory, and automation hooks without reading protocol logs. Every value is reported by the connected service."
        title="System"
      />
      <Tabs defaultValue="health">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="health">Health</TabsTrigger>
          <TabsTrigger value="metrics">Activity</TabsTrigger>
          <TabsTrigger value="memory">Memory</TabsTrigger>
          <TabsTrigger value="hooks">Hooks</TabsTrigger>
        </TabsList>
        <TabsContent className="mt-4" value="health">
          {health.data ? <HealthTab integrations={health.data.integrations} /> : null}
          {health.error ? (
            <ErrorState message={health.error.message} title="Health details unavailable" />
          ) : null}
        </TabsContent>
        <TabsContent className="mt-4" value="metrics">
          {metrics.data ? <MetricsTab metrics={metrics.data} /> : null}
          {metrics.error ? (
            <ErrorState message={metrics.error.message} title="Activity metrics unavailable" />
          ) : null}
        </TabsContent>
        <TabsContent className="mt-4" value="memory">
          {memory.data ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Metric
                label="Remembered conversations"
                value={number(memory.data.global.conversations_total)}
              />
              <Metric
                label="Remembered tool invocations"
                value={number(memory.data.global.invocations_total)}
              />
              <Frame className="sm:col-span-2" spacing="sm">
                <FramePanel>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 font-medium">
                      <BrainCircuitIcon aria-hidden="true" className="size-4 text-primary" /> Cache
                      effectiveness
                    </span>
                    <span>{Math.round(memory.data.cache.hit_rate * 100)}%</span>
                  </div>
                  <Progress className="mt-3" value={memory.data.cache.hit_rate * 100} />
                  <p className="mt-2 text-xs text-muted-foreground">
                    {number(memory.data.cache.hits)} hits, {number(memory.data.cache.misses)} misses
                  </p>
                </FramePanel>
              </Frame>
            </div>
          ) : null}
          {memory.error ? (
            <ErrorState message={memory.error.message} title="Memory statistics unavailable" />
          ) : null}
        </TabsContent>
        <TabsContent className="mt-4" value="hooks">
          {hooks.data ? (
            <Frame spacing="lg">
              <FrameHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <FrameTitle>Automation hooks</FrameTitle>
                    <FrameDescription>
                      {hooks.data.hooks.length} loaded, {hooks.data.recent_invocations.length}{' '}
                      recent invocations
                    </FrameDescription>
                  </div>
                  <ClioStatus
                    label={hooks.data.enabled ? 'Enabled' : 'Disabled'}
                    value={hooks.data.enabled ? 'healthy' : 'unavailable'}
                  />
                </div>
              </FrameHeader>
              <FramePanel className="grid gap-2 p-2">
                {hooks.data.hooks.map((hook, index) => (
                  <ClioInteractiveRow key={String(hook.id ?? index)}>
                    <div className="flex items-center gap-3">
                      <WebhookIcon aria-hidden="true" className="size-4 text-primary" />
                      <p className="font-medium">{String(hook.title ?? hook.id ?? 'Hook')}</p>
                      <Badge className="ml-auto" variant="outline">
                        {String(hook.scope ?? hook.source ?? hooks.data.backend)}
                      </Badge>
                    </div>
                  </ClioInteractiveRow>
                ))}
                {!hooks.data.hooks.length ? (
                  <p className="p-5 text-sm text-muted-foreground">No hooks are loaded.</p>
                ) : null}
              </FramePanel>
            </Frame>
          ) : null}
          {hooks.error ? (
            <ErrorState message={hooks.error.message} title="Hook inspection unavailable" />
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
