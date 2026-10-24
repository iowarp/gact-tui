import {
  pluginReferenceId,
  type AgentDelta,
  type AgentResolution,
  type PluginEntry,
} from '@clio/core/v3';
import { BoxesIcon, PackageIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

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
    return { selectable: true, label: 'Removed · add back' };
  const activeFrom = active.get(plugin.id);
  if (activeFrom === plugin.marketplace) return { selectable: false, label: 'Active' };
  if (activeFrom !== undefined) return { selectable: false, label: `Active from ${activeFrom}` };
  if (plugin.diagnostics.some((row) => row.severity === 'error'))
    return { selectable: false, label: 'Has errors' };
  return { selectable: true, label: 'Add' };
}

/**
 * The agent + menu: every installed plugin and pack, with what each brings.
 * Adding one changes only this conversation; Save as agent keeps it.
 */
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
  const [open, setOpen] = useState(false);
  const active = new Map(resolution.plugins.map((plugin) => [plugin.id, plugin.marketplace]));
  const rows = (plugins ?? []).filter((plugin) => plugin.id !== 'core');
  const packs = rows.filter((plugin) => plugin.kind === 'pack');
  const singles = rows.filter((plugin) => plugin.kind !== 'pack');
  const item = (plugin: PluginEntry) => {
    const state = availability(plugin, active, delta);
    const Icon = plugin.kind === 'pack' ? BoxesIcon : PackageIcon;
    return (
      <CommandItem
        key={plugin.ref}
        value={plugin.ref}
        keywords={[plugin.id, plugin.description, ...plugin.members]}
        disabled={!state.selectable}
        onSelect={() => {
          if (!state.selectable) return;
          onAdd(plugin.ref);
          setOpen(false);
        }}
        className="items-start gap-2 py-2"
      >
        <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="truncate font-medium">{plugin.id}</span>
            <span className="truncate text-xs text-muted-foreground">{plugin.marketplace}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{state.label}</span>
          </span>
          {plugin.description ? (
            <span className="line-clamp-2 text-xs text-muted-foreground">{plugin.description}</span>
          ) : null}
          {plugin.kind === 'pack' && plugin.members.length ? (
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Brings {plugin.members.join(', ')}
            </span>
          ) : null}
          {plugin.requires.length ? (
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Also needs {plugin.requires.join(', ')}
            </span>
          ) : null}
        </span>
      </CommandItem>
    );
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        {children}
      </PopoverTrigger>
      <PopoverContent
        aria-label="Add a plugin"
        align={align}
        className="w-[min(26rem,calc(100vw-2rem))] p-0"
      >
        <Command
          label="Search plugins"
          filter={(value, search, keywords) =>
            [value, ...(keywords ?? [])].some((text) =>
              text.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
            )
              ? 1
              : 0
          }
        >
          <CommandInput aria-label="Search plugins" placeholder="Search plugins and packs…" />
          <CommandList className="max-h-[min(24rem,60dvh)]">
            {plugins === undefined && !pluginsError ? (
              <p className="p-4 text-sm text-muted-foreground" role="status">
                Loading plugins…
              </p>
            ) : null}
            {pluginsError ? (
              <p className="p-4 text-sm text-destructive" role="alert">
                Plugins could not be listed: {pluginsError}
              </p>
            ) : null}
            {plugins !== undefined ? <CommandEmpty>No matching plugins.</CommandEmpty> : null}
            {packs.length ? <CommandGroup heading="Packs">{packs.map(item)}</CommandGroup> : null}
            {singles.length ? (
              <CommandGroup heading="Plugins">{singles.map(item)}</CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
