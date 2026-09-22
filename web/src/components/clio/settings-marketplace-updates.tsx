import type { AgentBlueprintSourceUpdate } from '@clio/core/v3';
import { useMutation } from '@tanstack/react-query';
import { RefreshCwIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useRepository } from '@/hooks/use-repository';
import { ClioInteractiveRow } from './interactive-row';
import { ClioRelativeTime } from './relative-time';

/** Human labels for every reason the connected service can report. A reason this
 * client has not learned yet decodes to `'unknown'` (see `forwardCompatibleEnum`
 * in `@clio/core/v3`) and falls through to the formatted raw value below, so
 * nothing is ever silently blanked. */
const REASON_LABEL: Record<string, string> = {
  up_to_date: 'Up to date',
  update_available: 'Update available',
  source_not_found: 'Source not found',
  installed_commit_unknown: 'Installed commit unknown',
  git_unavailable: 'Git unavailable',
  ls_remote_failed: 'Remote lookup failed',
  ref_not_found: 'Ref not found',
  timeout: 'Timed out',
  path_source_not_git: 'Not a git checkout',
  unknown: 'Unrecognized outcome',
};

function reasonLabel(reason: string): string {
  return REASON_LABEL[reason] ?? reason.replace(/_/g, ' ');
}

/**
 * Marketplace update check for the About panel: a manual "Check marketplace
 * updates" button that reads every configured source's typed outcome from
 * `blueprintSourceUpdates()` and, for a source reporting `update_available`,
 * offers an "Update" button that applies the existing refresh route and
 * re-checks. Deliberately manual — unlike the desktop update feed, nothing
 * here runs on a timer, since marketplace sources are a server-side registry
 * the person opted into per workspace, not a signed release channel.
 */
export function MarketplaceUpdatesCheck() {
  const repository = useRepository();
  const [rows, setRows] = useState<AgentBlueprintSourceUpdate[]>();
  const [checkedAt, setCheckedAt] = useState<string>();

  const check = useMutation({
    mutationFn: () => repository.blueprintSourceUpdates(),
    onSuccess: (result) => {
      setRows(result.sources);
      setCheckedAt(result.checked_at);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const applyUpdate = useMutation({
    mutationFn: (sourceId: string) => repository.refreshAgentBlueprintSource(sourceId),
    onSuccess: async () => {
      toast.success('Marketplace source updated');
      // `check`'s own onError already surfaces a failed re-check with its own
      // toast; swallow the rejection here so it does not also propagate into
      // THIS mutation's onError and fire a second toast for the same cause.
      await check.mutateAsync().catch(() => undefined);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Marketplace updates</p>
          <p className="text-xs text-muted-foreground">
            {rows === undefined ? (
              'Compare every configured marketplace source against its remote ref.'
            ) : checkedAt ? (
              // ClioRelativeTime's own aria-label already reads "Checked <when>" (the
              // `label` prop below) -- a visible "Checked" prefix here would double up
              // to "Checked Checked <when>" for assistive tech, since aria-label
              // replaces rather than appends to the element's visible text.
              <ClioRelativeTime compact label="Checked" timestamp={checkedAt} />
            ) : (
              `Checked ${rows.length} source${rows.length === 1 ? '' : 's'}`
            )}
          </p>
        </div>
        <Button disabled={check.isPending} onClick={() => check.mutate()} size="sm" variant="outline">
          <RefreshCwIcon aria-hidden="true" className={check.isPending ? 'animate-spin' : undefined} />
          {check.isPending ? 'Checking…' : 'Check marketplace updates'}
        </Button>
      </div>
      {rows?.length === 0 ? (
        <p className="text-sm text-muted-foreground">No marketplace sources are configured.</p>
      ) : null}
      {rows?.map((row) => (
        <ClioInteractiveRow key={row.source_id}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{row.source}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                <span>Ref {row.ref || 'default'}</span>
                <span>
                  Installed {row.installed_commit ? row.installed_commit.slice(0, 12) : 'unavailable'}
                </span>
                {row.remote_commit ? <span>Remote {row.remote_commit.slice(0, 12)}</span> : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <SourceUpdateBadge detail={row.detail} reason={row.reason} />
              {row.reason === 'update_available' ? (
                <Button
                  disabled={applyUpdate.isPending}
                  onClick={() => applyUpdate.mutate(row.source_id)}
                  size="sm"
                >
                  {applyUpdate.isPending && applyUpdate.variables === row.source_id
                    ? 'Updating…'
                    : 'Update'}
                </Button>
              ) : null}
            </div>
          </div>
        </ClioInteractiveRow>
      ))}
    </div>
  );
}

function SourceUpdateBadge({ detail, reason }: { detail?: string; reason: string }) {
  const className =
    reason === 'up_to_date'
      ? 'border-success/30 bg-success/10 text-success'
      : reason === 'update_available'
        ? 'border-warning/30 bg-warning/10 text-warning'
        : 'border-border bg-muted/40 text-muted-foreground';
  return (
    <Badge
      className={`rounded-md px-2 py-1 font-medium ${className}`}
      title={detail}
      variant="outline"
    >
      {reasonLabel(reason)}
    </Badge>
  );
}
