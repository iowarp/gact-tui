/**
 * The words of a Discover card (clio-agent DC-D1 to DC-D4): what a catalog connector or
 * plugin still needs, what must already be on this machine, where it comes from, and its
 * one visible action. Kept apart from the component so each state is tested in words.
 */
import type { Connector, PluginEntry } from '@clio/core/v3';
import { ph, t } from '@lingui/core/macro';
import { vocab } from '@/lib/brand-vocabulary';
import {
  connectorStatus,
  listNeeds,
  type ConnectorChange,
  type ConnectorStatusWords,
} from '@/lib/connector-presentation';

/** Cards a long group shows before its "Show all (n)" link. */
export const DISCOVER_FIRST = 4;

/** The required needs still without a value; a sign-in counts while it is required. */
function unmetNeeds(connector: Pick<Connector, 'needs'>) {
  return connector.needs.filter((need) => need.required && !need.has_value && !need.value);
}

/** "Needs hub address and access token" while a connector that is off lacks one; else ''. */
export function cardNeedsWords(connector: Pick<Connector, 'enabled' | 'needs'>): string {
  if (connector.enabled) return '';
  const needs = listNeeds(unmetNeeds(connector));
  return needs ? t`Needs ${needs}` : '';
}

/**
 * What must already be on this machine, in the catalog's own words (`requires`, the
 * slicer's SL-D7). Read from the row as the service sends it, so a client without the
 * field in its schema still shows it; '' once the connector is on, or when there is none.
 */
export function cardRequiresWords(connector: Connector): string {
  if (connector.enabled) return '';
  const requires = (connector as Connector & { requires?: unknown }).requires;
  return typeof requires === 'string' ? requires.trim() : '';
}

/**
 * Where the entry comes from, as a quiet line: a clio-kit server, a plugin from a
 * marketplace other than the shipped one, the product's own catalog, or one you added.
 */
export function cardSourceWords(
  connector: Pick<Connector, 'kit' | 'source'>,
  plugin?: Pick<PluginEntry, 'marketplace'>,
  shippedMarketplace?: string,
): string {
  if (connector.source === 'custom') return t`Added by you`;
  if (connector.kit) return t`From clio-kit`;
  if (plugin && shippedMarketplace && plugin.marketplace !== shippedMarketplace)
    return t`From ${ph({ marketplace: plugin.marketplace })}`;
  const product = vocab.agent;
  return t`From the ${product} catalog`;
}

/** A card's one visible action, or its state in words once it has none to offer. */
export type DiscoverCardAction =
  /** Off and ready to enable: the "+" enables it. */
  | { kind: 'enable' }
  /** Off and something required is missing: the "+" opens its setup. */
  | { kind: 'setup'; needs: string }
  /** Enabling or turning off: progress in words. */
  | { kind: 'busy'; words: string }
  /** On and ready: a check with the word "Enabled". */
  | { kind: 'enabled' }
  /** On but not ready (needs a value, can't be reached): the state in words. */
  | { kind: 'state'; status: ConnectorStatusWords };

export function discoverCardAction(
  connector: Connector,
  change?: ConnectorChange,
): DiscoverCardAction {
  if (change === 'starting')
    // A clio-kit server is downloaded when it is first enabled (LZ-D1).
    return {
      kind: 'busy',
      words: connector.kit && !connector.enabled ? t`Downloading its tools…` : t`Starting…`,
    };
  if (change === 'turning-off') return { kind: 'busy', words: t`Turning off…` };
  if (!connector.enabled) {
    const needs = cardNeedsWords(connector);
    return needs ? { kind: 'setup', needs } : { kind: 'enable' };
  }
  if (connector.state.status === 'ready') return { kind: 'enabled' };
  return { kind: 'state', status: connectorStatus(connector) };
}
