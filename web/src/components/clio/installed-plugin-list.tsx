import type { PluginEntry } from '@clio/core/v3';
import { BoxesIcon, PackageIcon } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  catalogMatches,
  catalogMember,
  catalogOwnMatches,
  catalogRoots,
} from '@/lib/plugin-catalog-tree';
import { CatalogGroup } from './catalog-group';
import { CatalogItem } from './catalog-item';
import { PluginExplorer } from './plugin-explorer';

function contributions(plugin: PluginEntry): string {
  const parts: string[] = [];
  const add = (count: number, one: string, many: string) => {
    if (count) parts.push(`${count} ${count === 1 ? one : many}`);
  };
  add(plugin.tools.length, 'tool', 'tools');
  add(plugin.skills.length, 'skill', 'skills');
  add(plugin.mcp_servers.length, 'server', 'servers');
  add(plugin.subagents.length, 'subagent', 'subagents');
  add(plugin.flows.length, 'flow', 'flows');
  add(plugin.hooks.length, 'hook', 'hooks');
  add(plugin.commands.length, 'command', 'commands');
  add(plugin.fragments.length, 'prompt fragment', 'prompt fragments');
  return parts.join(', ') || 'No contributions of its own';
}

/** Every installed plugin and pack, by marketplace, with what it contributes. */
export function InstalledPluginList({
  plugins,
  pending,
  error,
  busy = false,
  onTrustUpdate,
  hideFilter = false,
  flat = false,
  hideHeading = false,
}: {
  plugins: readonly PluginEntry[];
  pending: boolean;
  error?: string;
  busy?: boolean;
  /** Accept a waiting update: the trust step of the plugin's marketplace. */
  onTrustUpdate?: (marketplace: string) => void;
  hideFilter?: boolean;
  flat?: boolean;
  hideHeading?: boolean;
}) {
  const [filter, setFilter] = useState('');
  const [inspecting, setInspecting] = useState<PluginEntry>();
  const term = filter.trim().toLocaleLowerCase();
  const visible = plugins.filter((plugin) => catalogMatches(plugins, plugin, term));
  const roots = catalogRoots(plugins).filter((plugin) => catalogMatches(plugins, plugin, term));
  const marketplaces = [...new Set(plugins.map((plugin) => plugin.marketplace))];
  return (
    <section aria-label="Installed plugins" className="grid gap-3">
      {!hideHeading || !hideFilter ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {!hideHeading ? (
            <h2 className="text-sm font-semibold">
              Installed plugins {plugins.length ? `(${plugins.length})` : ''}
            </h2>
          ) : null}
          {!hideFilter ? (
            <Input
              aria-label="Filter plugins"
              className="h-8 w-full sm:w-64"
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter plugins"
              value={filter}
            />
          ) : null}
        </div>
      ) : null}
      {pending ? (
        <p className="text-sm text-muted-foreground" role="status">
          Loading plugins…
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          Plugins could not be listed: {error}
        </p>
      ) : null}
      {!pending && !error && !visible.length ? (
        <p className="text-sm text-muted-foreground">No plugins match.</p>
      ) : null}
      {marketplaces.map((marketplace) => {
        const rows = roots.filter((plugin) => plugin.marketplace === marketplace);
        if (!rows.length) return null;
        const list = (
          <ul className="grid min-w-0 gap-0" key={marketplace}>
            {rows.map((plugin) => (
              <CatalogNode
                key={`${plugin.ref}:${plugin.pending_trust}`}
                plugin={plugin}
                plugins={plugins}
                term={term}
                onInspect={setInspecting}
                onTrustUpdate={onTrustUpdate}
                busy={busy}
              />
            ))}
          </ul>
        );
        return flat ? (
          list
        ) : (
          <CatalogGroup
            key={marketplace}
            name={marketplace}
            count={visible.filter((p) => p.marketplace === marketplace).length}
            filter={term}
          >
            {list}
          </CatalogGroup>
        );
      })}
      {inspecting ? (
        <PluginExplorer
          key={`${inspecting.ref}:${inspecting.pending_trust}`}
          reference={inspecting.ref}
          pending={inspecting.pending_trust}
          onClose={() => setInspecting(undefined)}
        />
      ) : null}
    </section>
  );
}

function CatalogNode({
  plugin,
  plugins,
  term,
  onInspect,
  onTrustUpdate,
  busy,
  ancestors = new Set<string>(),
}: {
  plugin: PluginEntry;
  plugins: readonly PluginEntry[];
  term: string;
  onInspect: (plugin: PluginEntry) => void;
  onTrustUpdate?: (market: string) => void;
  busy: boolean;
  ancestors?: Set<string>;
}) {
  const [choice, setChoice] = useState({ term, open: Boolean(term) });
  const pack = plugin.kind === 'pack';
  const Icon = pack ? BoxesIcon : PackageIcon;
  const errors = plugin.diagnostics.filter((row) => row.severity === 'error');
  const open = choice.term === term ? choice.open : Boolean(term);
  const next = new Set(ancestors).add(plugin.ref);
  const memberTerm = catalogOwnMatches(plugin, term) ? '' : term;
  const children = pack
    ? plugin.members
        .map((ref) => catalogMember(plugins, plugin, ref))
        .filter(
          (child): child is PluginEntry =>
            Boolean(child) && !next.has(child!.ref) && catalogMatches(plugins, child!, memberTerm),
        )
    : [];
  return (
    <li className="min-w-0">
      <CatalogItem
        label={plugin.id}
        icon={<Icon />}
        open={open}
        onOpenChange={(open) => setChoice({ term, open })}
        metadata={
          <>
            {pack ? <Badge variant="secondary">Pack</Badge> : null}
            <span className="text-xs text-muted-foreground">{plugin.version}</span>
            {plugin.pending_trust ? (
              <Badge variant="outline">Update waits for trust</Badge>
            ) : !plugin.trusted ? (
              <Badge variant="outline">Not trusted</Badge>
            ) : null}
            {errors.length ? (
              <Badge variant="destructive">
                {errors.length} {errors.length === 1 ? 'problem' : 'problems'}
              </Badge>
            ) : null}
          </>
        }
        actions={
          plugin.pending_trust && onTrustUpdate ? (
            <Button
              aria-label={`Trust the update of ${plugin.id}`}
              disabled={busy}
              onClick={() => onTrustUpdate(plugin.marketplace)}
              size="xs"
              variant="outline"
            >
              Trust update
            </Button>
          ) : undefined
        }
      >
        {plugin.description ? (
          <span className="mt-0.5 block text-sm text-muted-foreground">{plugin.description}</span>
        ) : null}
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {pack ? `Brings ${plugin.members.join(', ') || 'no members'}` : contributions(plugin)}
          {plugin.requires.length ? `; needs ${plugin.requires.join(', ')}` : ''}
        </span>
        <Button
          size="xs"
          variant="outline"
          className="justify-self-start"
          onClick={() => onInspect(plugin)}
        >
          Explore {plugin.id}
        </Button>
        {pack && open ? (
          <ul aria-label={`Members of ${plugin.id}`} className="ml-4 grid gap-1 border-l pl-3">
            {children.map((child) => (
              <CatalogNode
                key={`${child.ref}:${child.pending_trust}`}
                plugin={child}
                plugins={plugins}
                term={memberTerm}
                onInspect={onInspect}
                onTrustUpdate={onTrustUpdate}
                busy={busy}
                ancestors={next}
              />
            ))}
            {!children.length ? (
              <li className="py-2 text-sm text-muted-foreground">No installed members match.</li>
            ) : null}
          </ul>
        ) : null}
      </CatalogItem>
    </li>
  );
}
