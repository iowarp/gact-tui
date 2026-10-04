import type { AgentBlueprintSource } from '@clio/core/v3';
import { BoxesIcon, FolderIcon, GitBranchIcon } from 'lucide-react';
import { ConfigureIcon } from '@/lib/icon-vocabulary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InfoTip } from './info-tip';
import { ClioStatus } from './status';
import { vocab } from '@/lib/brand-vocabulary';
import { BlueprintOperationStatus } from './blueprint-operation-status';
import { useBlueprintOperation } from '@/hooks/use-blueprint-operation';

/** A compact management row; blueprint inventory is disclosed only on request. */
export function MarketplaceSourceRow({
  source,
  hostLabel,
  scopeLabel,
  pending,
  isInstalled,
  onReload,
  onConfigure,
  onRemove,
  onInstall,
}: {
  source: AgentBlueprintSource;
  hostLabel: string;
  scopeLabel: string;
  pending: boolean;
  isInstalled: (id: string) => boolean;
  onReload: () => void;
  onConfigure: () => void;
  onRemove: () => void;
  onInstall: (id: string) => void;
}) {
  const Icon = source.source_kind === 'path' ? FolderIcon : GitBranchIcon;
  const operation = useBlueprintOperation({ sourceId: source.id });
  const blueprints = source.available_blueprints.filter((row) => row.kind !== 'pack');
  return (
    <section
      className="overflow-hidden rounded-xl border bg-card"
      aria-label={`Marketplace ${source.name}`}
    >
      <div className="flex flex-wrap items-center gap-3 p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0 flex-1 basis-40">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">{source.name}</h3>
            {source.is_default ? (
              <InfoTip label="About the built-in marketplace">
                Included with {vocab.product}. It supplies the default agent. Removing this
                registration keeps installed blueprints and prevents automatic registration from
                returning.
              </InfoTip>
            ) : null}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {hostLabel} · {scopeLabel}
          </p>
        </div>
        <ClioStatus
          label={
            source.reload_required
              ? 'Reload needed'
              : source.status === 'ready'
                ? 'Ready'
                : source.status
          }
          value={source.status === 'ready' && !source.reload_required ? 'healthy' : 'degraded'}
        />
        <div className="ml-auto flex gap-2">
          <Button
            onClick={onReload}
            disabled={pending || operation.pending}
            size="sm"
            variant="outline"
          >
            {pending || operation.pending ? 'Reloading…' : 'Reload'}
          </Button>
          <Button
            onClick={onConfigure}
            size="icon-sm"
            variant="ghost"
            aria-label={`Configure ${source.name}`}
          >
            <ConfigureIcon />
          </Button>
        </div>
      </div>
      {operation.operation ? (
        <div className="px-4 pb-3">
          <BlueprintOperationStatus operation={operation.operation} />
        </div>
      ) : null}
      {operation.error ? (
        <p className="px-4 pb-3 text-xs text-destructive">Reload history could not be loaded.</p>
      ) : null}
      {source.error && source.error !== operation.operation?.error ? (
        <p className="px-4 pb-3 text-sm text-destructive" role="alert">
          {source.error}
        </p>
      ) : null}
      <details className="border-t">
        <summary className="cursor-pointer px-4 py-3 text-sm text-muted-foreground">
          Source and blueprints · {blueprints.length}
        </summary>
        <div className="grid gap-3 px-4 pb-4">
          <p className="break-all font-mono text-xs">{source.source}</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              {source.ref || (source.source_kind === 'path' ? 'Folder' : 'Default branch')}
            </Badge>
            {source.pinned_commit ? (
              <Badge variant="secondary">Pinned {source.pinned_commit.slice(0, 12)}</Badge>
            ) : null}
            {source.commit ? (
              <span className="font-mono text-xs text-muted-foreground">
                Last inspected {source.commit.slice(0, 12)}
              </span>
            ) : null}
          </div>
          {source.reload_required ? (
            <p role="status" className="text-sm">
              Configuration saved. Reload to inspect and apply this source.
            </p>
          ) : null}
          {blueprints.map((row) => (
            <div className="flex items-center gap-3 rounded-lg bg-muted/40 p-3" key={row.id}>
              <BoxesIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 text-sm">{row.title}</span>
              {isInstalled(row.id) ? (
                <Badge variant="secondary">Installed</Badge>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!row.enabled || pending}
                  onClick={() => onInstall(row.id)}
                >
                  Install
                </Button>
              )}
            </div>
          ))}
          {source.skipped_blueprints?.length ? (
            <details className="text-sm">
              <summary>Retained {source.skipped_blueprints.length} blueprint choices</summary>
              <ul className="mt-2 text-muted-foreground">
                {source.skipped_blueprints.map((row) => (
                  <li key={row.id}>
                    {row.id}: {row.reason.replaceAll('_', ' ')}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <div className="flex justify-end">
            <Button onClick={onRemove} size="sm" variant="ghost">
              Remove marketplace
            </Button>
          </div>
        </div>
      </details>
    </section>
  );
}
