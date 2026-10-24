import type { PluginEntry } from '@clio/core/v3';
import { BoxesIcon, PackageIcon } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
  return parts.join(' · ') || 'No contributions of its own';
}

/** Every installed plugin and pack, by marketplace, with what it contributes. */
export function InstalledPluginList({
  plugins,
  pending,
  error,
  busy = false,
  onTrustUpdate,
}: {
  plugins: readonly PluginEntry[];
  pending: boolean;
  error?: string;
  busy?: boolean;
  /** Accept a waiting update: the trust step of the plugin's marketplace. */
  onTrustUpdate?: (marketplace: string) => void;
}) {
  const [filter, setFilter] = useState('');
  const term = filter.trim().toLocaleLowerCase();
  const visible = plugins.filter(
    (plugin) =>
      !term ||
      [plugin.id, plugin.description, plugin.marketplace, ...plugin.members].some((text) =>
        text.toLocaleLowerCase().includes(term),
      ),
  );
  const marketplaces = [...new Set(visible.map((plugin) => plugin.marketplace))];
  return (
    <section aria-label="Installed plugins" className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">
          Installed plugins {plugins.length ? `(${plugins.length})` : ''}
        </h2>
        <Input
          aria-label="Filter plugins"
          className="h-8 w-full sm:w-64"
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter plugins"
          value={filter}
        />
      </div>
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
      {marketplaces.map((marketplace) => (
        <div className="grid gap-1.5" key={marketplace}>
          <h3 className="text-xs font-medium text-muted-foreground">{marketplace}</h3>
          <ul className="grid gap-1.5">
            {visible
              .filter((plugin) => plugin.marketplace === marketplace)
              .map((plugin) => {
                const Icon = plugin.kind === 'pack' ? BoxesIcon : PackageIcon;
                const errors = plugin.diagnostics.filter((row) => row.severity === 'error');
                return (
                  <li
                    className="flex min-w-0 items-start gap-3 rounded-lg border px-3 py-2"
                    key={`${plugin.ref}:${plugin.pending_trust ? 'pending' : 'installed'}`}
                  >
                    <Icon
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{plugin.id}</span>
                        {plugin.kind === 'pack' ? <Badge variant="secondary">Pack</Badge> : null}
                        {plugin.version ? (
                          <span className="text-xs text-muted-foreground">{plugin.version}</span>
                        ) : null}
                        {plugin.pending_trust ? (
                          <Badge variant="outline">Update waits for trust</Badge>
                        ) : !plugin.trusted ? (
                          <Badge variant="outline">Not trusted</Badge>
                        ) : null}
                        {plugin.format === 'claude-code' ? (
                          <Badge variant="outline">Imported</Badge>
                        ) : null}
                        {errors.length ? (
                          <Badge variant="destructive">
                            {errors.length} {errors.length === 1 ? 'problem' : 'problems'}
                          </Badge>
                        ) : null}
                      </div>
                      {plugin.description ? (
                        <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                          {plugin.description}
                        </p>
                      ) : null}
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {plugin.kind === 'pack'
                          ? `Brings ${plugin.members.join(', ') || 'no members'}`
                          : contributions(plugin)}
                        {plugin.requires.length ? ` · needs ${plugin.requires.join(', ')}` : ''}
                      </p>
                      {plugin.pending_trust && onTrustUpdate ? (
                        <Button
                          aria-label={`Trust the update of ${plugin.id}`}
                          className="mt-1.5"
                          disabled={busy}
                          onClick={() => onTrustUpdate(plugin.marketplace)}
                          size="xs"
                          variant="outline"
                        >
                          Trust update
                        </Button>
                      ) : null}
                      {plugin.diagnostics.length ? (
                        <ul className="mt-1 grid gap-0.5 text-xs text-muted-foreground">
                          {plugin.diagnostics.map((row, index) => (
                            <li key={`${row.code}:${index}`}>
                              {row.severity}: {row.message}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </section>
  );
}
