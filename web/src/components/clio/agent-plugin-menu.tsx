import {
  pluginReferenceId,
  type AgentDelta,
  type AgentResolution,
  type PluginEntry,
} from '@clio/core/v3';
import { BoxesIcon, PackageIcon } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { pluginConnectorStatus } from '@/lib/connector-presentation';
import { CapabilityPicker } from './capability-picker';
import { ConnectorLogo } from './connector-need-rows';
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

function availability(
  plugin: PluginEntry,
  active: ReadonlyMap<string, string>,
  delta: AgentDelta,
): Availability {
  if (plugin.pending_trust) return { selectable: false, label: 'Waiting for trust in Settings' };
  if (!plugin.trusted) return { selectable: false, label: 'Marketplace not trusted' };
  if (delta.remove.some((reference) => pluginReferenceId(reference) === plugin.id))
    return { selectable: true, label: 'Removed (select to add back)' };
  const activeFrom = active.get(plugin.id);
  if (activeFrom === plugin.marketplace)
    return { selectable: false, label: plugin.connector ? 'In this conversation' : 'Active' };
  if (activeFrom !== undefined) return { selectable: false, label: `Active from ${activeFrom}` };
  if (plugin.diagnostics.some((row) => row.severity === 'error'))
    return { selectable: false, label: 'Has errors' };
  // A connector's plugin says its connector's state in words (CN3) beside its name.
  if (plugin.connector) return { selectable: true, label: pluginConnectorStatus(plugin.connector) };
  return { selectable: true, label: 'Add' };
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
  const items = useMemo(() => {
    const active = new Map(resolution.plugins.map((plugin) => [plugin.id, plugin.marketplace]));
    const rows = (plugins ?? []).filter((plugin) => plugin.id !== 'core');
    // Connectors first: adding one is how this conversation takes its tools (CN10).
    return [
      ...rows.filter((plugin) => plugin.connector),
      ...rows.filter((plugin) => !plugin.connector && plugin.kind === 'pack'),
      ...rows.filter((plugin) => !plugin.connector && plugin.kind !== 'pack'),
    ].map((plugin) => {
      const state = availability(plugin, active, delta);
      const Icon = plugin.kind === 'pack' ? BoxesIcon : PackageIcon;
      const connector = plugin.connector;
      return {
        id: plugin.ref,
        title: connector?.name || plugin.id,
        source: connector ? 'Connector' : plugin.marketplace,
        description: plugin.description,
        group: connector ? 'Connectors' : plugin.kind === 'pack' ? 'Packs' : 'Plugins',
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
  }, [plugins, resolution.plugins, delta]);
  return (
    <CapabilityPicker
      items={items}
      pending={plugins === undefined && !pluginsError}
      error={pluginsError}
      onChoose={onAdd}
      disabled={disabled}
      label="Plugins"
      align={align}
      footer={
        <Link to="/settings/plugins" className="block rounded-md px-2 py-2 text-sm hover:bg-accent">
          Browse extensions
        </Link>
      }
    >
      {children}
    </CapabilityPicker>
  );
}
