import type { HookInspection, MemoryStatistics, RuntimeMetrics } from '@clio/core/v3';
import { GaugeIcon, WebhookIcon, ZapIcon } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { ItemList, ItemRow } from './primitives/item-row';
import { StateView } from './primitives/state-view';
import { StatusIndicator, type StatusTone } from './primitives/status-indicator';
import { SettingsGroupLabel, SettingsRow } from './settings-row';
import { humanizeToolName } from './tool-presentation';

function metricTitle(name: string) {
  return toolLabel(
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

function metricDuration(milliseconds: number) {
  const seconds = Math.max(0, milliseconds / 1000);
  if (seconds < 10) return `${seconds.toFixed(1)}s`;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

function metricContext(name: string) {
  if (name.includes('remote_scientific_')) return 'Scientific remote connection';
  if (name.includes('remote_')) return 'Remote connection';
  return undefined;
}

function ValueRow({ title, value, note }: { title: string; value: string; note?: string }) {
  return (
    <SettingsRow fullWidth inlineControl note={note} title={title}>
      <span className="text-[0.8125rem] text-foreground tabular-nums">{value}</span>
    </SettingsRow>
  );
}

/** Totals as value rows, then the slowest reported calls as item rows. */
export function MetricsGroup({ metrics }: { metrics: RuntimeMetrics }) {
  const latencyRows = Object.entries(metrics.latencies)
    .sort((left, right) => right[1].p95_ms - left[1].p95_ms)
    .slice(0, 12);
  return (
    <>
      <ValueRow
        note={`${number(metrics.sessions.active)} active`}
        title="Sessions"
        value={number(metrics.sessions.total)}
      />
      <ValueRow title="Messages" value={number(metrics.messages.total)} />
      <ValueRow
        title="Tokens"
        value={number(metrics.tokens.input_total + metrics.tokens.output_total)}
      />
      <ValueRow title="Uptime" value={duration(metrics.uptime_s)} />
      <SettingsGroupLabel info="The duration within which 95% of reported calls completed, slowest first.">
        Slowest reported activity
      </SettingsGroupLabel>
      {latencyRows.length ? (
        <ItemList label="Slowest reported activity">
          {latencyRows.map(([name, latency]) => {
            const context = metricContext(name);
            return (
              <ItemRow
                icon={<GaugeIcon />}
                key={name}
                meta={
                  <>
                    {context ? <span className="mr-2.5">{context}</span> : null}
                    <span>{number(latency.count)} reported calls</span>
                  </>
                }
                status={
                  <span className="truncate text-xs text-muted-foreground tabular-nums">
                    95% within {metricDuration(latency.p95_ms)}
                  </span>
                }
                statusWidth={136}
                title={<span title={name}>{metricTitle(name)}</span>}
              />
            );
          })}
        </ItemList>
      ) : (
        <StateView kind="empty" size="row" title="No activity reported yet" />
      )}
    </>
  );
}

/** Remembered totals and how well the memory cache answers. */
export function StorageGroup({ memory }: { memory: MemoryStatistics }) {
  const cacheSamples = memory.cache.hits + memory.cache.misses;
  return (
    <>
      <ValueRow
        title="Remembered conversations"
        value={number(memory.global.conversations_total)}
      />
      <ValueRow
        title="Remembered tool invocations"
        value={number(memory.global.invocations_total)}
      />
      <SettingsRow
        fullWidth
        inlineControl
        note={
          cacheSamples
            ? `${number(memory.cache.hits)} hits and ${number(memory.cache.misses)} misses`
            : 'No cache activity has been reported yet.'
        }
        title="Cache effectiveness"
      >
        {cacheSamples ? (
          <Progress
            aria-label="Cache effectiveness"
            className="w-28"
            value={memory.cache.hit_rate * 100}
          />
        ) : null}
        <span className="text-[0.8125rem] text-foreground tabular-nums">
          {cacheSamples ? `${Math.round(memory.cache.hit_rate * 100)}%` : 'Unavailable'}
        </span>
      </SettingsRow>
    </>
  );
}

function text(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
}

function when(value: unknown) {
  const date = new Date(String(value ?? ''));
  return Number.isNaN(date.getTime()) ? undefined : date.toLocaleString();
}

function outcome(value: unknown): { tone: StatusTone; label: string } {
  const word = String(value ?? '').toLowerCase();
  if (['ok', 'success', 'succeeded', 'allowed', 'completed'].includes(word))
    return { tone: 'success', label: 'Succeeded' };
  if (['blocked', 'denied'].includes(word)) return { tone: 'warning', label: 'Blocked' };
  if (['error', 'failed', 'failure'].includes(word)) return { tone: 'error', label: 'Failed' };
  return { tone: 'idle', label: word ? humanizeToolName(word) : 'Not reported' };
}

const EVENT_LABELS: Record<string, string> = {
  pre_tool: 'Before a tool runs',
  post_tool: 'After a tool runs',
};

function eventLabel(value: unknown) {
  const event = text(value);
  return event ? (EVENT_LABELS[event] ?? humanizeToolName(event)) : undefined;
}

/** A readable name for a tool id ("workspace.read" → "Workspace read"); the id stays in the hover title. */
function toolLabel(id: string) {
  const words = id
    .replace(/^tool:/u, '')
    .split(/[._:/\s-]+/u)
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return words ? words[0]!.toUpperCase() + words.slice(1) : id;
}

/** Loaded hooks and what they recently did. */
export function HooksGroup({ hooks }: { hooks: HookInspection }) {
  const titles = new Map(
    hooks.hooks.map((hook) => [text(hook.id), text(hook.title) ?? text(hook.id) ?? 'Hook']),
  );
  return (
    <>
      <SettingsRow
        fullWidth
        inlineControl
        note={`${hooks.hooks.length} loaded, ${hooks.recent_invocations.length} recent invocations`}
        title="Automation hooks"
      >
        <StatusIndicator
          label={hooks.enabled ? 'Enabled' : 'Disabled'}
          tone={hooks.enabled ? 'success' : 'stopped'}
        />
      </SettingsRow>
      <SettingsGroupLabel>Loaded hooks</SettingsGroupLabel>
      {hooks.hooks.length ? (
        <ItemList label="Loaded hooks">
          {hooks.hooks.map((hook, index) => {
            const on = Array.isArray(hook.on) ? hook.on.map(eventLabel).filter(Boolean) : [];
            const scope = text(hook.scope) ?? text(hook.source) ?? hooks.backend;
            return (
              <ItemRow
                icon={<WebhookIcon />}
                key={String(hook.id ?? index)}
                meta={
                  <>
                    <span className="mr-2.5">{humanizeToolName(scope)}</span>
                    {on.length ? <span>{on.join(', ')}</span> : null}
                  </>
                }
                title={text(hook.title) ?? text(hook.id) ?? 'Hook'}
              />
            );
          })}
        </ItemList>
      ) : (
        <StateView kind="empty" size="row" title="No hooks are loaded." />
      )}
      {hooks.recent_invocations.length ? (
        <>
          <SettingsGroupLabel>Recent invocations</SettingsGroupLabel>
          <ItemList label="Recent invocations">
            {hooks.recent_invocations.map((invocation, index) => {
              const result = outcome(invocation.outcome);
              const tool = text(invocation.tool);
              const at = when(invocation.at);
              return (
                <ItemRow
                  icon={<ZapIcon />}
                  key={`${String(invocation.hook_id)}:${String(invocation.at)}:${index}`}
                  meta={
                    <>
                      {eventLabel(invocation.event) ? (
                        <span className="mr-2.5">{eventLabel(invocation.event)}</span>
                      ) : null}
                      {tool ? (
                        <span className="mr-2.5" title={tool}>
                          {toolLabel(tool)}
                        </span>
                      ) : null}
                      {at ? <span>{at}</span> : null}
                    </>
                  }
                  status={<StatusIndicator label={result.label} tone={result.tone} />}
                  statusWidth={120}
                  title={titles.get(text(invocation.hook_id)) ?? text(invocation.hook_id) ?? 'Hook'}
                />
              );
            })}
          </ItemList>
        </>
      ) : null}
    </>
  );
}
