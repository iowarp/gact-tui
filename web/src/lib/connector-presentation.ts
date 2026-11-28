/**
 * One state, in words, for a connector everywhere it appears (CN3): the Extensions
 * list, its setup card, and the card in the conversation.
 */
import type {
  Connector,
  ConnectorNeed,
  ConnectorState,
  PluginConnector,
  PluginEntry,
} from '@clio/core/v3';
import type { StatusTone } from '@/components/clio/primitives/status-indicator';
import { plural, t } from '@lingui/core/macro';
import { formatDuration } from '@/lib/format';
import { formatList } from '@/lib/locale-format';

export interface ConnectorStatusWords {
  tone: StatusTone;
  /** Short enough for a list row's status column. */
  label: string;
  /** The whole sentence, with the reason when there is one. */
  detail: string;
}

const readyWithTools = (count: number) =>
  plural(count, { one: 'Ready, # tool', other: 'Ready, # tools' });

/** How a need reads inside "Needs …": its own label, lower-cased after the first word. */
export function needName(need: Pick<ConnectorNeed, 'kind' | 'label' | 'key'>): string {
  if (need.kind === 'sign-in') return t`a sign-in`;
  const label = need.label.trim() || need.key;
  return label.charAt(0).toLowerCase() + label.slice(1);
}

/** "a sign-in", "server address and a sign-in", "a, b and c". */
export function listNeeds(needs: readonly Pick<ConnectorNeed, 'kind' | 'label' | 'key'>[]): string {
  return formatList(needs.map(needName), { and: true });
}

/** The needs a state names, falling back to the bare keys a newer service may send. */
function namedNeeds(connector: Connector): Pick<ConnectorNeed, 'kind' | 'label' | 'key'>[] {
  return connector.state.needs.map(
    (key) =>
      connector.needs.find((need) => need.key === key) ?? {
        key,
        kind: 'value' as const,
        label: key,
      },
  );
}

/**
 * A change the person asked for that has not settled yet. Starting a connector can take a
 * while (a package is fetched and the server asked what it offers), so the state says so
 * in words instead of leaving the old state beside a dimmed button.
 */
export type ConnectorChange = 'starting' | 'turning-off';

type ConnectorCheck = Pick<ConnectorState, 'reason' | 'started_at' | 'elapsed_s' | 'stalled'>;

/**
 * How long a check in flight has run, counted here between `connector.changed` events
 * from `started_at`. Never less than the service's own count at the read, so a clock
 * behind the service's does not count backwards.
 */
export function connectorCheckElapsed(check: ConnectorCheck, now: number): number | null {
  const read = check.elapsed_s === null ? null : check.elapsed_s * 1000;
  const started = check.started_at ? Date.parse(check.started_at) : Number.NaN;
  if (Number.isNaN(started)) return read;
  return Math.max(now - started, read ?? 0);
}

/** True while any of these connectors' servers is still being checked. */
export function anyConnectorStarting(
  states: readonly ({ status: string } | null | undefined)[],
): boolean {
  return states.some((state) => state?.status === 'starting');
}

/**
 * A check in flight, in words: still starting, or its server went a whole window with
 * no work. The reason is the service's own sentence; the time so far is counted here.
 */
function checkWords(check: ConnectorCheck, now: number): ConnectorStatusWords {
  const ms = connectorCheckElapsed(check, now);
  const elapsed = ms === null ? null : formatDuration(ms, 'short');
  const label = check.stalled
    ? elapsed
      ? t`No answer yet, ${elapsed}`
      : t`No answer yet`
    : elapsed
      ? t`Starting, ${elapsed}`
      : t`Starting…`;
  const reason = check.reason ?? (check.stalled ? label : t`Starting its server.`);
  // An older service writes the time into its reason; then the reason alone.
  const detail = elapsed && check.started_at ? t`${reason} ${elapsed} so far.` : reason;
  return { tone: check.stalled ? 'warning' : 'running', label, detail };
}

export function connectorStatus(
  connector: Connector,
  change?: ConnectorChange,
  now: number = Date.now(),
): ConnectorStatusWords {
  const { state } = connector;
  // The service's own check, once it reads one, says more than "Starting…".
  if (state.status === 'starting' && change !== 'turning-off') return checkWords(state, now);
  if (change === 'starting')
    return {
      tone: 'running',
      label: t`Starting…`,
      detail: t`Starting it and checking what it needs.`,
    };
  if (change === 'turning-off')
    return { tone: 'running', label: t`Turning off…`, detail: t`Turning off…` };
  if (!connector.enabled)
    return { tone: 'inactive', label: t`Not enabled`, detail: t`Not enabled` };
  if (state.status === 'ready') {
    const label = connector.tool_count === null ? t`Ready` : readyWithTools(connector.tool_count);
    return { tone: 'success', label, detail: label };
  }
  if (state.status === 'needs') {
    const needs = listNeeds(namedNeeds(connector));
    const label = needs ? t`Needs ${needs}` : t`Needs setup`;
    const reason = state.reason;
    return { tone: 'warning', label, detail: reason ? t`${label}. ${reason}` : label };
  }
  if (state.status === 'unreachable')
    return {
      tone: 'error',
      label: t`Can’t be reached`,
      // The reason is already a sentence ("Nothing answered at …"): shown once, under the label.
      detail: state.reason ?? t`Can’t be reached`,
    };
  return {
    tone: 'idle',
    label: t`State not known`,
    detail: state.reason ?? t`This version can’t read the connector’s state`,
  };
}

/**
 * Plugins a person can pick for a conversation or an agent. A connector's plugin is
 * offered while its connector is enabled (CN10): it is how a conversation takes the
 * connector's tools. One whose connector is off is left out; Extensions (or the agent's
 * offer in the conversation) turns the connector on first.
 */
export function offeredPlugins<T extends Pick<PluginEntry, 'follows' | 'connector'>>(
  plugins: readonly T[] | undefined,
): T[] | undefined {
  return plugins?.filter((plugin) => !plugin.follows || plugin.connector?.enabled === true);
}

/**
 * A connector plugin's state in words, from the connector a plugin row names (CN3).
 * `counted`: the row already says how many tools it brings, so "Ready" alone.
 */
export function pluginConnectorStatus(
  connector: PluginConnector,
  { counted = false, now = Date.now() }: { counted?: boolean; now?: number } = {},
): string {
  if (!connector.enabled) return t`Not enabled`;
  if (connector.status === 'starting') return checkWords(connector, now).label;
  if (connector.status === 'ready')
    return connector.tool_count === null || counted
      ? t`Ready`
      : readyWithTools(connector.tool_count);
  if (connector.status === 'needs') {
    const needs = formatList(connector.needs);
    return connector.needs.length ? t`Needs ${needs}` : t`Needs setup`;
  }
  if (connector.status === 'unreachable') return t`Can’t be reached`;
  return t`State not known`;
}

/** The words a list search matches for a connector. */
export function connectorText(connector: Connector): string {
  return [
    connector.name,
    connector.id,
    connector.description,
    connectorStatus(connector).label,
    ...connector.needs.map((need) => need.label),
  ]
    .join(' ')
    .toLocaleLowerCase();
}
