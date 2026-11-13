import {
  pluginReferenceId,
  type AgentDelta,
  type AgentResolution,
  type PluginEntry,
} from '@clio/core/v3';
import { BoxesIcon, PackageIcon } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CapabilityPicker } from './capability-picker';
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

function availability(
  plugin: PluginEntry,
  active: ReadonlyMap<string, string>,
  delta: AgentDelta,
): Availability {
  if (plugin.pending_trust) return { selectable: false, label: t`Waiting for trust in Settings` };
  if (!plugin.trusted) return { selectable: false, label: t`Marketplace not trusted` };
  if (delta.remove.some((reference) => pluginReferenceId(reference) === plugin.id))
    return { selectable: true, label: t`Removed (select to add back)` };
  const activeFrom = active.get(plugin.id);
  if (activeFrom === plugin.marketplace) return { selectable: false, label: t`Active` };
  if (activeFrom !== undefined) return { selectable: false, label: t`Active from ${activeFrom}` };
  if (plugin.diagnostics.some((row) => row.severity === 'error'))
    return { selectable: false, label: t`Has errors` };
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
  const items = useMemo(() => {
    const active = new Map(resolution.plugins.map((plugin) => [plugin.id, plugin.marketplace]));
    const rows = (plugins ?? []).filter((plugin) => plugin.id !== 'core');
    return [
      ...rows.filter((plugin) => plugin.kind === 'pack'),
      ...rows.filter((plugin) => plugin.kind !== 'pack'),
    ].map((plugin) => {
      const state = availability(plugin, active, delta);
      const Icon = plugin.kind === 'pack' ? BoxesIcon : PackageIcon;
      return {
        id: plugin.ref,
        title: plugin.id,
        source: plugin.marketplace,
        description: plugin.description,
        group: plugin.kind === 'pack' ? 'Packs' : 'Plugins',
        icon: <Icon className="size-4" aria-hidden="true" />,
        disabled: !state.selectable,
        state: state.label,
        keywords: [
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
