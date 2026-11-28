import {
  pluginReferenceId,
  type AgentDelta,
  type AgentResolution,
  type PluginEntry,
} from '@clio/core/v3';
import { BoxesIcon, PackageIcon } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { bringsMoreThanItsServer, connectorPluginContents } from '@/lib/connector-plugin';
import { useNow } from '@/hooks/use-now';
import { anyConnectorStarting, pluginConnectorStatus } from '@/lib/connector-presentation';
import { CapabilityPicker } from './capability-picker';
import { ConnectorLogo } from './connector-need-rows';
import { t } from '@lingui/core/macro';
export interface AgentPluginMenuProps {
  /** Installed plugins and packs; `undefined` while loading. */
  plugins?: readonly PluginEntry[];
  pluginsError?: string;
  resolution: AgentResolution;
  delta: AgentDelta;
  disabled?: boolean;
  /** Called with the plugin's marketplace-qualified `ref`. */
  onAdd: (pluginRef: string) => void;
  children: ReactNode;
  align?: 'start' | 'end';
}

type Availability = { selectable: boolean; label: string };

/** A plugin that bundles a connector and brings more, such as skills (PL-D1). */
function bundles(plugin: PluginEntry): boolean {
  return Boolean(plugin.connector) && bringsMoreThanItsServer(plugin, plugin.follows);
}

function availability(
  plugin: PluginEntry,
  active: ReadonlyMap<string, string>,
  delta: AgentDelta,
  now: number,
): Availability {
  if (plugin.pending_trust) return { selectable: false, label: t`Waiting for trust in Settings` };
  if (!plugin.trusted) return { selectable: false, label: t`Marketplace not trusted` };
  if (delta.remove.some((reference) => pluginReferenceId(reference) === plugin.id))
    return { selectable: true, label: t`Removed (select to add back)` };
  const activeFrom = active.get(plugin.id);
  if (activeFrom === plugin.marketplace)
    return { selectable: false, label: plugin.connector ? t`In this conversation` : t`Active` };
  if (activeFrom !== undefined) return { selectable: false, label: t`Active from ${activeFrom}` };
  if (plugin.diagnostics.some((row) => row.severity === 'error'))
    return { selectable: false, label: t`Has errors` };
  // A connector, or a plugin that bundles one, says the connector's state in words (CN3)
  // beside its name; a plugin's tool count is already in what it brings.
  if (plugin.connector)
    return {
      selectable: true,
      label: pluginConnectorStatus(plugin.connector, { counted: bundles(plugin), now }),
    };
  return { selectable: true, label: t`Add` };
}

/** Conversation availability stays with the agent resolver; the picker owns only presentation. */
export function AgentPluginMenu({
  plugins,
  pluginsError,
  resolution,
  delta,
  disabled,
  onAdd,
  children,
  align = 'start',
}: AgentPluginMenuProps) {
  // A connector still starting counts its time here, between connector.changed events.
  const now = useNow(anyConnectorStarting((plugins ?? []).map((plugin) => plugin.connector)));
  const items = useMemo(() => {
    const active = new Map(resolution.plugins.map((plugin) => [plugin.id, plugin.marketplace]));
    const rows = (plugins ?? []).filter((plugin) => plugin.id !== 'core');
    const connectors = rows.filter((plugin) => plugin.connector && !bundles(plugin));
    // Connectors first: adding one is how this conversation takes its tools (CN10). A
    // plugin that bundles a connector is a plugin (PL-D1), first among the plugins.
    return [
      ...connectors,
      ...rows.filter((plugin) => plugin.kind === 'pack' && !plugin.connector),
      ...rows.filter((plugin) => bundles(plugin)),
      ...rows.filter((plugin) => plugin.kind !== 'pack' && !plugin.connector),
    ].map((plugin) => {
      const state = availability(plugin, active, delta, now);
      const Icon = plugin.kind === 'pack' ? BoxesIcon : PackageIcon;
      const connector = plugin.connector;
      const bundled = bundles(plugin);
      return {
        id: plugin.ref,
        title: connector?.name || plugin.id,
        source: bundled
          ? connectorPluginContents(connector!, plugin)
          : connector
            ? t`Connector`
            : plugin.marketplace,
        description: plugin.description,
        group:
          connector && !bundled ? t`Connectors` : plugin.kind === 'pack' ? t`Packs` : t`Plugins`,
        icon: connector ? (
          <ConnectorLogo className="size-4 text-[8px]" connector={{ ...connector }} />
        ) : (
          <Icon className="size-4" aria-hidden="true" />
        ),
        disabled: !state.selectable,
        state: state.label,
        keywords: [
          plugin.id,
          ...(connector ? [connector.id] : []),
          ...plugin.members,
          ...plugin.skills,
          ...plugin.mcp_servers,
          ...plugin.tools,
          ...plugin.flows,
        ],
      };
    });
  }, [plugins, resolution.plugins, delta, now]);
  return (
    <CapabilityPicker
      items={items}
      pending={plugins === undefined && !pluginsError}
      error={pluginsError}
      onChoose={onAdd}
      disabled={disabled}
      label={t`Plugins`}
      align={align}
      footer={
        <Link to="/settings/plugins" className="block rounded-md px-2 py-2 text-sm hover:bg-accent">
          {t`Browse extensions`}
        </Link>
      }
    >
      {children}
    </CapabilityPicker>
  );
}
