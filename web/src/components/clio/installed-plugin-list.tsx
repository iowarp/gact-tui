import type { PluginEntry } from '@clio/core/v3';
import { BoxesIcon, LayersIcon } from 'lucide-react';
import { useState } from 'react';
import { pluginRow } from '@/lib/extension-library-entries';
import { catalogRoots } from '@/lib/plugin-catalog-tree';
import { ExtensionRow } from './extension-parts';
import { PluginExplorer } from './plugin-explorer';
import { ItemList } from './primitives/item-row';
import { StateView } from './primitives/state-view';

/** A pack's glyph or a plugin's. */
export function PluginIcon({ kind }: Pick<PluginEntry, 'kind'>) {
  return kind === 'pack' ? <BoxesIcon /> : <LayersIcon />;
}

/**
 * Installed plugins and packs as item rows: what each brings, where it comes
 * from and whether it is trusted. Pack members open from the pack's pane.
 */
export function InstalledPluginList({
  plugins,
  pending,
  error,
  label = 'Installed plugins',
  onExplore,
  selected,
  size = 'default',
}: {
  plugins: readonly PluginEntry[];
  pending: boolean;
  error?: string;
  label?: string;
  /** Explore a plugin beside the list; without it, the explorer opens as a dialog. */
  onExplore?: (plugin: PluginEntry) => void;
  /** The ref of the plugin whose pane is open. */
  selected?: string;
  size?: 'default' | 'sm';
}) {
  const [inspecting, setInspecting] = useState<PluginEntry>();
  const explore = onExplore ?? setInspecting;
  const roots = catalogRoots(plugins);
  if (pending) return <StateView kind="loading" size="row" title="Loading plugins…" />;
  if (error)
    return <StateView kind="error" size="row" title={`Plugins could not be listed: ${error}`} />;
  if (!roots.length) return <StateView kind="empty" size="row" title="No plugins" />;
  return (
    <ItemList label={label}>
      {roots.map((plugin) => {
        const row = pluginRow(plugin);
        return (
          <ExtensionRow
            icon={<PluginIcon kind={plugin.kind} />}
            key={row.key}
            meta={row.meta}
            name={plugin.id}
            onExplore={() => explore(plugin)}
            selected={selected === plugin.ref}
            size={size}
            status={row.status}
          />
        );
      })}
      {inspecting ? (
        <PluginExplorer
          key={`${inspecting.ref}:${inspecting.pending_trust}`}
          onClose={() => setInspecting(undefined)}
          pending={inspecting.pending_trust}
          reference={inspecting.ref}
        />
      ) : null}
    </ItemList>
  );
}
