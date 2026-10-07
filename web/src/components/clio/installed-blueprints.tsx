import type { AgentBlueprint, AgentBlueprintSource } from '@clio/core/v3';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DeleteIcon, MoreIcon } from '@/lib/icon-vocabulary';
import { RefreshIndicator } from './refresh-button';
import { ClioStatus } from './status';

type Props = {
  blueprints: AgentBlueprint[];
  sources: AgentBlueprintSource[];
  search: string;
  loading: boolean;
  onClearSearch: () => void;
  onDetails: (blueprint: AgentBlueprint) => void;
  onReload: (blueprint: AgentBlueprint) => void;
  onRemove: (blueprint: AgentBlueprint) => void;
  reloadingId?: string;
};

/** Group installed blueprints by their marketplace, with explicit filters and details. */
export function InstalledBlueprints({
  blueprints,
  sources,
  search,
  loading,
  onClearSearch,
  onDetails,
  onReload,
  onRemove,
  reloadingId,
}: Props) {
  const [marketplace, setMarketplace] = useState('all');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('name');
  const sourceFor = (row: AgentBlueprint) =>
    sources.find(
      (source) =>
        source.id === row.source_id ||
        (!row.source_id &&
          source.source === (row.metadata.install as { source?: string } | undefined)?.source),
    );
  const groupKey = (row: AgentBlueprint) => sourceFor(row)?.id ?? 'other';
  const groups = new Map<string, { name: string; rows: AgentBlueprint[] }>();
  for (const row of blueprints) {
    const key = groupKey(row);
    const group = groups.get(key) ?? {
      name: sourceFor(row)?.name || 'Other installations',
      rows: [],
    };
    group.rows.push(row);
    groups.set(key, group);
  }
  const query = search.trim().toLocaleLowerCase();
  const activeMarketplace = groups.has(marketplace) ? marketplace : 'all';
  const attention = (row: AgentBlueprint) => !row.enabled || row.validation_errors.length > 0;
  const visible = blueprints.filter(
    (row) =>
      (activeMarketplace === 'all' || groupKey(row) === activeMarketplace) &&
      (status === 'all' || (status === 'attention' ? attention(row) : !attention(row))) &&
      `${row.display_name} ${row.description ?? ''} ${sourceFor(row)?.name ?? ''}`
        .toLocaleLowerCase()
        .includes(query),
  );
  const installedAt = (row: AgentBlueprint) => {
    const value = (row.metadata.install as { installed_at?: string } | undefined)?.installed_at;
    return value ? Date.parse(value) || 0 : 0;
  };
  const ordered = [...groups].sort((a, b) => a[1].name.localeCompare(b[1].name));
  const clear = () => {
    setMarketplace('all');
    setStatus('all');
    onClearSearch();
  };
  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {groups.size > 1 && (
          <Select value={activeMarketplace} onValueChange={setMarketplace}>
            <SelectTrigger aria-label="Filter by marketplace" className="w-full min-w-0 sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All marketplaces</SelectItem>
              {ordered.map(([key, group]) => (
                <SelectItem key={key} value={key}>
                  {group.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger aria-label="Filter by status" className="min-w-0 flex-1 sm:max-w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="installed">Installed</SelectItem>
            <SelectItem value="attention">Needs attention</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger
            aria-label="Sort blueprints"
            className="min-w-0 flex-1 sm:ml-auto sm:max-w-48"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name A–Z</SelectItem>
            <SelectItem value="reverse">Name Z–A</SelectItem>
            <SelectItem value="recent">Recently installed</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {!loading && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {visible.length} of {blueprints.length} installed blueprints
          </span>
          {(activeMarketplace !== 'all' || status !== 'all' || query) && (
            <Button variant="ghost" size="sm" onClick={clear}>
              Clear filters
            </Button>
          )}
        </div>
      )}
      {ordered.map(([key, group]) => {
        const rows = visible
          .filter((row) => groupKey(row) === key)
          .sort((a, b) =>
            sort === 'recent'
              ? installedAt(b) - installedAt(a) || a.display_name.localeCompare(b.display_name)
              : a.display_name.localeCompare(b.display_name) * (sort === 'reverse' ? -1 : 1),
          );
        if (!rows.length) return null;
        return (
          <section
            key={key}
            aria-label={group.name}
            className="overflow-hidden rounded-lg border bg-card"
          >
            <header className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
              <h2 className="text-sm font-semibold">{group.name}</h2>
              <span className="text-xs text-muted-foreground">{rows.length}</span>
            </header>
            <div className="divide-y">
              {rows.map((row) => (
                <article
                  key={row.identity || row.id}
                  className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 px-4 py-3.5 hover:bg-muted/20"
                >
                  <div className="min-w-0 max-sm:col-span-2">
                    <button
                      type="button"
                      className="rounded-sm text-left text-sm font-medium hover:text-primary focus-visible:outline-ring"
                      onClick={() => onDetails(row)}
                    >
                      {row.display_name}
                    </button>
                    <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">
                      {row.description || 'No description provided.'}
                    </p>
                  </div>
                  <div className="col-start-1 row-start-2 flex flex-wrap items-center self-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{row.version ? `v${row.version}` : 'Version unavailable'}</span>
                    <span>{row.scope === 'global' ? 'Shared' : 'Workspace only'}</span>
                    {attention(row) && <ClioStatus value="degraded" label="Needs attention" />}
                  </div>
                  <div className="col-start-2 row-start-2 flex items-center gap-1 sm:row-span-2 sm:row-start-1">
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`Details for ${row.display_name}`}
                      onClick={() => onDetails(row)}
                    >
                      Details
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Actions for ${row.display_name}`}
                          aria-busy={reloadingId === (row.identity || row.id)}
                          disabled={reloadingId === (row.identity || row.id)}
                        >
                          {reloadingId === (row.identity || row.id) ? (
                            <RefreshIndicator refreshing />
                          ) : (
                            <MoreIcon aria-hidden="true" />
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          disabled={reloadingId === (row.identity || row.id)}
                          aria-busy={reloadingId === (row.identity || row.id)}
                          onSelect={() => onReload(row)}
                        >
                          <RefreshIndicator refreshing={reloadingId === (row.identity || row.id)} />
                          Reload installed copy
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          disabled={
                            (row.blueprint_id ?? row.id) === 'base-agent' && row.scope === 'global'
                          }
                          onSelect={() => onRemove(row)}
                        >
                          <DeleteIcon aria-hidden="true" />
                          Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}
      {!loading && !visible.length && (
        <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          {blueprints.length
            ? 'No blueprints match these filters.'
            : 'No agent blueprints are installed here.'}
        </div>
      )}
    </div>
  );
}
