/**
 * One state, in words, for a connector everywhere it appears (CN3): the Extensions
 * list, its setup card, and the card in the conversation.
 */
import type { Connector, ConnectorNeed, PluginConnector, PluginEntry } from '@clio/core/v3';
import type { StatusTone } from '@/components/clio/primitives/status-indicator';

export interface ConnectorStatusWords {
  tone: StatusTone;
  /** Short enough for a list row's status column. */
  label: string;
  /** The whole sentence, with the reason when there is one. */
  detail: string;
}

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

/** How a need reads inside "Needs …": its own label, lower-cased after the first word. */
export function needName(need: Pick<ConnectorNeed, 'kind' | 'label' | 'key'>): string {
  if (need.kind === 'sign-in') return 'a sign-in';
  const label = need.label.trim() || need.key;
  return label.charAt(0).toLowerCase() + label.slice(1);
}

/** "a sign-in", "server address and a sign-in", "a, b and c". */
export function listNeeds(needs: readonly Pick<ConnectorNeed, 'kind' | 'label' | 'key'>[]): string {
  const names = needs.map(needName);
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
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

export function connectorStatus(
  connector: Connector,
  change?: ConnectorChange,
): ConnectorStatusWords {
  if (change === 'starting')
    return {
      tone: 'running',
      label: 'Starting…',
      detail: 'Starting it and checking what it needs.',
    };
  if (change === 'turning-off')
    return { tone: 'running', label: 'Turning off…', detail: 'Turning off…' };
  if (!connector.enabled) return { tone: 'inactive', label: 'Not enabled', detail: 'Not enabled' };
  const { state } = connector;
  if (state.status === 'ready') {
    const tools = connector.tool_count === null ? '' : `, ${plural(connector.tool_count, 'tool')}`;
    return { tone: 'success', label: `Ready${tools}`, detail: `Ready${tools}` };
  }
  if (state.status === 'needs') {
    const needs = listNeeds(namedNeeds(connector));
    const label = needs ? `Needs ${needs}` : 'Needs setup';
    return { tone: 'warning', label, detail: state.reason ? `${label}. ${state.reason}` : label };
  }
  if (state.status === 'unreachable')
    return {
      tone: 'error',
      label: 'Can’t be reached',
      // The reason is already a sentence ("Nothing answered at …"): shown once, under the label.
      detail: state.reason ?? 'Can’t be reached',
    };
  return {
    tone: 'idle',
    label: 'State not known',
    detail: state.reason ?? 'This version can’t read the connector’s state',
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

/** A connector plugin's state in words, from the connector a plugin row names (CN3). */
export function pluginConnectorStatus(connector: PluginConnector): string {
  if (!connector.enabled) return 'Not enabled';
  if (connector.status === 'ready')
    return connector.tool_count === null
      ? 'Ready'
      : `Ready, ${plural(connector.tool_count, 'tool')}`;
  if (connector.status === 'needs')
    return connector.needs.length ? `Needs ${connector.needs.join(', ')}` : 'Needs setup';
  if (connector.status === 'unreachable') return 'Can’t be reached';
  return 'State not known';
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
