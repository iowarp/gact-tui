/**
 * Connectors and plugins are different things, each shown as what it is (PL-D1). A
 * **connector** is a raw MCP server: "Connector", its MCP server and tool count, its
 * needs and state. A **plugin** brings skills and may bundle a connector's MCP server
 * (ParaView, Home Assistant): "Plugin", what it brings ("1 skill, 1 MCP server (13
 * tools)"), and its connector's needs and state. A plugin that bundles a connector is
 * one entity, shown once as the plugin, in the same words wherever it appears: the
 * Extensions list (Yours and Discover), its detail pane and a conversation's "Add
 * plugin" picker. A connector with no such plugin is added through its carrier, which
 * brings nothing but the server, so it stays a connector.
 *
 * The data is the existing API's: a connector row names the plugin a conversation adds
 * (`plugin_ref`), the plugin catalog row names the connector it follows (`connector`)
 * and lists its skills. The counts come from `offerContentParts`, the offer card's own
 * formatter, so the card and the lists cannot disagree.
 */
import type { Connector, ConnectorNeed, PluginEntry } from '@clio/core/v3';
import { t } from '@lingui/core/macro';
import { listNeeds } from '@/lib/connector-presentation';
import { offerContentParts } from '@/lib/plugin-offer-contents';

/** The plugin that follows `connector` in the catalog, if the catalog lists it. */
export function followingPlugin(
  connector: Pick<Connector, 'id' | 'plugin_ref'>,
  plugins: readonly PluginEntry[],
): PluginEntry | undefined {
  return (
    plugins.find((plugin) => connector.plugin_ref && plugin.ref === connector.plugin_ref) ??
    plugins.find((plugin) => plugin.follows === connector.id)
  );
}

/**
 * The plugin `connector` is part of: a following plugin that brings more than the
 * connector's own server (skills, tools, fragments). Undefined for a plain connector,
 * whose carrier brings only the server.
 */
export function bundlingPlugin(
  connector: Pick<Connector, 'id' | 'plugin_ref'>,
  plugins: readonly PluginEntry[],
): PluginEntry | undefined {
  const plugin = followingPlugin(connector, plugins);
  return plugin && bringsMoreThanItsServer(plugin, connector.id) ? plugin : undefined;
}

/** Whether a plugin row that follows `connectorId` brings anything besides that server. */
export function bringsMoreThanItsServer(plugin: PluginEntry, connectorId: string): boolean {
  return connectorPluginParts({ id: connectorId, tool_count: null }, plugin).length > 1;
}

/**
 * What the plugin brings, as list parts: "1 skill", "1 MCP server (13 tools)". The
 * connector is always its one MCP server; the tool count is known once it has been
 * listed (an enabled, ready connector).
 */
export function connectorPluginParts(
  connector: Pick<Connector, 'id'> & { tool_count: number | null },
  plugin: PluginEntry | undefined,
): string[] {
  return offerContentParts(plugin, { id: connector.id, tool_count: connector.tool_count });
}

/** The same parts on one short line: "1 skill, 1 MCP server (13 tools)". */
export function connectorPluginContents(
  connector: Pick<Connector, 'id'> & { tool_count: number | null },
  plugin: PluginEntry | undefined,
): string {
  return connectorPluginParts(connector, plugin).join(', ');
}

/** The required needs still without a value (a sign-in counts while it is required). */
function unmet(needs: readonly ConnectorNeed[]): ConnectorNeed[] {
  return needs.filter((need) => need.required && !need.has_value && !need.value);
}

/**
 * What a connector still needs before it can be used, for a row whose state column
 * says only "Not enabled": "Needs your Home Assistant address and long-lived access
 * token". Empty when nothing required is missing, or when its state already says so.
 */
export function connectorSetupWords(connector: Connector): string {
  if (connector.enabled) return '';
  const needs = listNeeds(unmet(connector.needs));
  return needs ? t`Needs ${needs}` : '';
}
