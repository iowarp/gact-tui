import type { AgentBlueprintSource } from '@clio/core/v3';
import {
  BoxesIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FolderIcon,
  GitBranchIcon,
} from 'lucide-react';
import { useState } from 'react';
import { ConfigureIcon, DeleteIcon, RefreshIcon } from '@/lib/icon-vocabulary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ClioStatus } from './status';
import { BlueprintOperationStatus } from './blueprint-operation-status';
import { MarketplaceFeedback } from './marketplace-feedback';
import { useBlueprintOperation } from '@/hooks/use-blueprint-operation';

/** Reuse one marketplace row for browsing, configuration, reload and removal. */
export function MarketplaceSourceRow({
  source,
  scopeLabel,
  pending,
  reloading,
  installingId,
  isInstalled,
  installedVersion,
  onReload,
  onConfigure,
  onRemove,
  onInstall,
  onDetails,
}: {
  source: AgentBlueprintSource;
  scopeLabel: string;
  pending: boolean;
  reloading?: boolean;
  installingId?: string;
  isInstalled: (id: string) => boolean;
  installedVersion?: (id: string) => string | undefined;
  onReload: () => void;
  onConfigure: () => void;
  onRemove: () => void;
  onInstall: (id: string) => void;
  onDetails?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const operation = useBlueprintOperation({ sourceId: source.id });
  const Icon = source.source_kind === 'path' ? FolderIcon : GitBranchIcon;
  const blueprints = source.available_blueprints
    .filter((row) => row.kind !== 'pack')
    .sort((a, b) => a.title.localeCompare(b.title));
  const matches = blueprints.filter((row) =>
    `${row.title} ${row.description ?? ''}`
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  );
  const installed = blueprints.filter((row) => isInstalled(row.id)).length;
  const busy = Boolean(reloading || operation.pending);
  return (
    <section
      className="overflow-hidden rounded-xl border bg-card"
      aria-label={`Marketplace ${source.name}`}
    >
      <div className="flex items-start gap-3 p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words font-medium">{source.name}</h3>
            {source.is_default ? <Badge variant="secondary">Built in</Badge> : null}
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground" title={source.source}>
            {source.source}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {scopeLabel} · {installed} of {blueprints.length} installed
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            disabled={pending || operation.pending}
            onClick={onConfigure}
            size="icon-sm"
            variant="ghost"
            aria-label={`Configure ${source.name}`}
          >
            <ConfigureIcon />
          </Button>
          <Button
            disabled={pending || operation.pending}
            onClick={onRemove}
            size="icon-sm"
            variant="ghost"
            aria-label={`Remove ${source.name}`}
          >
            <DeleteIcon />
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-4 pb-4">
        <Button
          variant="outline"
          size="sm"
          aria-expanded={expanded}
          aria-controls={`marketplace-${source.id}-blueprints`}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
          Browse blueprints <span className="text-muted-foreground">({blueprints.length})</span>
        </Button>
        <Button
          onClick={onReload}
          disabled={pending || operation.pending}
          size="sm"
          variant="ghost"
        >
          <RefreshIcon aria-hidden="true" className={busy ? 'animate-spin' : undefined} />
          {busy ? 'Reloading…' : 'Reload'}
        </Button>
        <ClioStatus
          className="ml-auto"
          label={
            busy
              ? 'Reloading'
              : source.reload_required
                ? 'Reload needed'
                : source.status === 'ready'
                  ? 'Ready'
                  : 'Needs attention'
          }
          value={source.status === 'ready' && !source.reload_required ? 'healthy' : 'degraded'}
        />
      </div>
      {operation.operation &&
      (operation.operation.status !== 'applied' || source.reload_required) ? (
        <div className="border-t px-4 py-3">
          <BlueprintOperationStatus operation={operation.operation} compact />
        </div>
      ) : null}
      {source.error && source.error !== operation.operation?.error ? (
        <div className="px-4 pb-4">
          <MarketplaceFeedback error={source.error} />
        </div>
      ) : null}
      {operation.error ? (
        <p className="px-4 pb-3 text-xs text-muted-foreground">
          Reload history could not be loaded.
        </p>
      ) : null}
      {source.reload_required ? (
        <p role="status" className="px-4 pb-3 text-sm">
          Settings saved. Reload to use the updated marketplace.
        </p>
      ) : null}
      {expanded ? (
        <div className="border-t" id={`marketplace-${source.id}-blueprints`}>
          <div className="p-3">
            <Input
              aria-label={`Search ${source.name} blueprints`}
              placeholder="Search blueprints"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="max-h-96 divide-y overflow-y-auto px-4">
            {matches.map((row) => (
              <div
                className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
                key={row.id}
              >
                <BoxesIcon
                  aria-hidden="true"
                  className="mt-1 size-4 shrink-0 text-muted-foreground"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{row.title}</p>
                  {row.description ? (
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {row.description}
                    </p>
                  ) : null}
                  {row.version && (
                    <p className="mt-1 text-xs text-muted-foreground">Available: v{row.version}</p>
                  )}
                  {!row.enabled ? (
                    <p className="mt-1 text-xs text-destructive">
                      This blueprint needs attention before it can be installed.
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 max-sm:col-start-2 max-sm:justify-end">
                  {isInstalled(row.id) ? (
                    <>
                      <Badge className="shrink-0" variant="secondary">
                        {installedVersion?.(row.id)
                          ? `Installed v${installedVersion(row.id)}`
                          : 'Installed'}
                      </Badge>
                      {onDetails && (
                        <Button
                          size="sm"
                          variant="outline"
                          aria-label={`Details for ${row.title}`}
                          onClick={() => onDetails(row.id)}
                        >
                          Details
                        </Button>
                      )}
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!row.enabled || pending || operation.pending}
                      onClick={() => onInstall(row.id)}
                    >
                      {installingId === row.id ? 'Installing…' : 'Install'}
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {!matches.length ? (
              <p className="py-5 text-center text-sm text-muted-foreground">
                {blueprints.length
                  ? 'No blueprints match your search.'
                  : 'No blueprints found in this marketplace.'}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      <details className="border-t px-4 py-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer">Marketplace details</summary>
        <div className="mt-3 space-y-2">
          <p className="break-all">{source.source}</p>
          <p>{source.ref || (source.source_kind === 'path' ? 'Local folder' : 'Default branch')}</p>
          {source.pinned_commit ? (
            <p>
              Pinned revision: <code>{source.pinned_commit.slice(0, 12)}</code>
            </p>
          ) : null}
          {source.commit ? (
            <p>
              Loaded revision: <code>{source.commit.slice(0, 12)}</code>
            </p>
          ) : null}
          {operation.operation?.status === 'applied' ? (
            <BlueprintOperationStatus operation={operation.operation} compact />
          ) : null}
          {source.skipped_blueprints?.map((row) => (
            <p key={row.id}>
              {row.id}: {row.reason.replaceAll('_', ' ')}
            </p>
          ))}
        </div>
      </details>
    </section>
  );
}
