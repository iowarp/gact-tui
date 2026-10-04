import { vocab } from '@/lib/brand-vocabulary';
import { connectionScope } from '@/lib/connection-scope';
import type { ConnectedSourceState, SourceReview, WorkspaceReference } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ArrowLeftIcon, ArrowUpIcon, FileIcon, FolderIcon, UnplugIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ConnectedSourceAuth } from './connected-source-auth';
import { sourceModeNames } from './connected-source-labels';
import { SourceProviderLogo } from './source-provider-logo';
import { InfoTip } from './info-tip';

const bytes = (value: number) =>
  value >= 1024 ** 3
    ? `${(value / 1024 ** 3).toFixed(1)} GB`
    : value >= 1024 ** 2
      ? `${(value / 1024 ** 2).toFixed(1)} MB`
      : value >= 1024
        ? `${(value / 1024).toFixed(1)} KB`
        : `${value} B`;

/** Management of one source keeps refresh, reviewed writeback and disconnect explicit. */
export function ConnectedSourceDetail({
  workspaceId,
  source,
  hostLabel,
  onBack,
  onSelect,
  onChanged,
}: {
  workspaceId: string;
  source: ConnectedSourceState;
  hostLabel: string;
  onBack: () => void;
  onSelect?: (reference: WorkspaceReference) => void;
  onChanged: () => void;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const queryClient = useQueryClient();
  const [folder, setFolder] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [review, setReview] = useState<SourceReview>();
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const ready =
    Boolean(source.local_path) &&
    ['ready', 'stale', 'transferring'].includes(source.materialization ?? '');
  const queryPrefix = ['connected-storage', connectionScope(settings), workspaceId];
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: queryPrefix });
    onChanged();
  };
  const operations = useQuery({
    queryKey: [...queryPrefix, source.id, 'operations'],
    queryFn: ({ signal }) => repository.sourceOperations(workspaceId, source.id, signal),
    refetchInterval: 1500,
  });
  const latest = [...(operations.data ?? [])].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  )[0];
  const active = latest && ['queued', 'running'].includes(latest.state);
  const browse = useQuery({
    queryKey: [...queryPrefix, source.id, 'files', source.revision, folder, search, offset, ready],
    queryFn: ({ signal }) =>
      repository.browseConnectedSource(
        workspaceId,
        source.id,
        { folder, query: search, offset, materialized: ready },
        signal,
      ),
    enabled: ready || (source.connected && source.authenticated && !active),
    retry: false,
  });
  const action = useMutation({
    mutationFn: async (
      kind: 'transfer' | 'cancel' | 'review' | 'apply' | 'disconnect' | 'reconnect' | 'remove-copy',
    ) => {
      if (kind === 'transfer') await repository.transferConnectedSource(workspaceId, source.id);
      else if (kind === 'cancel' && latest)
        await repository.cancelSourceOperation(workspaceId, source.id, latest.id);
      else if (kind === 'review') {
        setReview(await repository.reviewSourceChanges(workspaceId, source.id));
        setSelected([]);
      } else if (kind === 'apply' && review) {
        await repository.applySourceChanges(workspaceId, source.id, review.id, selected);
        setReview(undefined);
        setSelected([]);
      } else if (kind === 'disconnect' || kind === 'reconnect' || kind === 'remove-copy') {
        await repository.sourceLifecycle(workspaceId, source.id, kind);
        setConfirmRemove(false);
      }
    },
    onSuccess: refresh,
    onError: refresh,
  });
  const attach = useMutation({
    mutationFn: async (path: string) => {
      const resource = await repository.attachSourceFile(workspaceId, source.id, path);
      onSelect?.({
        kind: 'resource',
        id: resource.id,
        label: resource.name,
        detail: `${source.label} · ${path}`,
        media_type: resource.detected_mime,
        revision: String(resource.revision),
        navigation: {
          resource_id: resource.id,
          source_id: source.id,
          source_provider: source.provider,
          source_path: path,
        },
      });
    },
  });
  const go = (path: string) => {
    setFolder(path);
    setSearch('');
    setOffset(0);
  };
  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeftIcon aria-hidden="true" />
        Sources
      </Button>
      <div className="flex items-start gap-3">
        <SourceProviderLogo provider={source.provider} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium">{source.label}</h3>
          <p className="break-all text-xs text-muted-foreground">
            {source.origin === 'desktop_upload' ? 'Uploaded desktop folder' : source.root}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline">{sourceModeNames[source.mode ?? 'read_only']}</Badge>
            <span className="text-xs text-muted-foreground">{hostLabel}</span>
            <InfoTip label="About source identity">
              This source belongs to {vocab.agent} {source.owner.clio_id}. References retain its
              provider, folder, revision and file hash.
            </InfoTip>
          </div>
        </div>
      </div>
      {!source.connected ? (
        <div className="flex items-center justify-between rounded-md border p-3 text-sm">
          <span>Disconnected · copies retained</span>
          <Button size="sm" onClick={() => action.mutate('reconnect')} disabled={action.isPending}>
            Reconnect
          </Button>
        </div>
      ) : !source.authenticated ? (
        <ConnectedSourceAuth
          workspaceId={workspaceId}
          source={source}
          onComplete={() => {
            void refresh();
          }}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          {source.mode !== 'write_enabled' && source.origin !== 'desktop_upload' && (
            <Button
              disabled={Boolean(active) || action.isPending}
              onClick={() => action.mutate('transfer')}
            >
              {ready
                ? 'Refresh inputs'
                : latest?.state === 'interrupted'
                  ? 'Resume transfer'
                  : `Transfer to ${vocab.agent}`}
            </Button>
          )}
          {source.mode === 'working_copy' && ready && (
            <Button
              variant="outline"
              disabled={Boolean(active) || action.isPending}
              onClick={() => action.mutate('review')}
            >
              Review changes
            </Button>
          )}
          <Button
            variant="ghost"
            disabled={Boolean(active) || action.isPending}
            onClick={() => action.mutate('disconnect')}
          >
            <UnplugIcon aria-hidden="true" />
            Disconnect
          </Button>
        </div>
      )}
      {latest && (
        <div className="space-y-2 rounded-md border p-3" role="status">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="capitalize">
              {latest.state} · {bytes(latest.bytes_done)}
              {latest.bytes_total ? ` / ${bytes(latest.bytes_total)}` : ''}
            </span>
            {active && (
              <Button
                size="sm"
                variant="ghost"
                disabled={latest.cancel_requested || action.isPending}
                onClick={() => action.mutate('cancel')}
              >
                {latest.cancel_requested ? 'Cancelling…' : 'Cancel transfer'}
              </Button>
            )}
          </div>
          {active && (
            <progress
              className="h-1.5 w-full accent-primary"
              aria-label="Transfer progress"
              value={latest.bytes_total ? latest.bytes_done : undefined}
              max={latest.bytes_total || undefined}
            />
          )}
          {latest.error && <p className="text-xs text-destructive">{latest.error}</p>}
          {latest.native_job_id && (
            <p className="break-all text-xs text-muted-foreground">
              Globus task {latest.native_job_id}
            </p>
          )}
        </div>
      )}
      {review && (
        <section className="space-y-3 rounded-md border p-3" aria-label="Review source changes">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium">Changes to apply upstream</h4>
            <InfoTip label="About reviewed updates">
              Only selected files are applied. {vocab.agent} rechecks both copies before writing.
              Providers may commit files individually; a directory-wide atomic update is not
              promised.
            </InfoTip>
          </div>
          {review.changes.length === 0 && (
            <p className="text-sm text-muted-foreground">The working copy matches its baseline.</p>
          )}
          <div className="max-h-52 space-y-1 overflow-y-auto">
            {review.changes.map((change) => (
              <div key={change.path}>
                <label className="flex items-center gap-2 rounded p-2 text-sm hover:bg-muted/40">
                  <input
                    type="checkbox"
                    disabled={change.conflict || action.isPending}
                    checked={selected.includes(change.path)}
                    onChange={(event) =>
                      setSelected((previous) =>
                        event.target.checked
                          ? [...previous, change.path]
                          : previous.filter((path) => path !== change.path),
                      )
                    }
                  />
                  <span className="min-w-0 flex-1 break-all">{change.path}</span>
                  <Badge
                    variant={
                      change.conflict || change.kind === 'delete' ? 'destructive' : 'outline'
                    }
                  >
                    {change.conflict ? 'Upstream conflict' : change.kind}
                  </Badge>
                </label>
                <details className="mb-2 ml-7 text-xs">
                  <summary className="cursor-pointer text-muted-foreground">
                    Inspect changes
                  </summary>
                  {change.preview && (
                    <pre className="mt-2 max-h-52 overflow-auto rounded bg-muted/40 p-2">
                      {change.preview.split('\n').map((line, index) => (
                        <span
                          key={index}
                          className={
                            line.startsWith('+') && !line.startsWith('+++')
                              ? 'block text-emerald-600 dark:text-emerald-400'
                              : line.startsWith('-') && !line.startsWith('---')
                                ? 'block text-red-600 dark:text-red-400'
                                : 'block text-muted-foreground'
                          }
                        >
                          {line || ' '}
                        </span>
                      ))}
                    </pre>
                  )}
                  {change.preview_note && (
                    <p className="mt-2 text-muted-foreground">{change.preview_note}</p>
                  )}
                </details>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={action.isPending}
              onClick={() => setReview(undefined)}
            >
              Close review
            </Button>
            <Button
              size="sm"
              disabled={!selected.length || action.isPending}
              onClick={() => action.mutate('apply')}
            >
              Apply {selected.length} selected
            </Button>
          </div>
        </section>
      )}
      {(ready || (source.connected && source.authenticated)) && (
        <section aria-label="Source files" className="space-y-2">
          <div className="flex items-center gap-2">
            <h4 className="flex-1 text-sm font-medium">
              {ready ? 'Approved inputs' : 'Source preview'}
            </h4>
            {ready && (
              <InfoTip label="About approved inputs">
                {source.mode === 'write_enabled'
                  ? 'These files are live on the selected host. Attaching a file preserves a snapshot of its current bytes.'
                  : source.origin === 'desktop_upload'
                    ? 'These immutable inputs retain the uploaded folder structure. Select and upload the folder again to adopt desktop changes.'
                    : 'These are the immutable inputs from the last completed transfer. Refresh explicitly to adopt upstream changes; working-copy edits stay separate until reviewed.'}
              </InfoTip>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              aria-label="Parent source folder"
              variant="outline"
              size="icon"
              disabled={!folder}
              onClick={() => go(folder.split('/').slice(0, -1).join('/'))}
            >
              <ArrowUpIcon aria-hidden="true" />
            </Button>
            <Input
              aria-label="Search source files"
              placeholder="Search files"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOffset(0);
              }}
            />
          </div>
          {folder && (
            <button
              className="break-all text-left text-xs text-muted-foreground underline"
              onClick={() => go('')}
            >
              Source / {folder}
            </button>
          )}
          <div className="max-h-72 overflow-y-auto rounded-md border">
            {browse.isPending && (
              <p role="status" className="p-4 text-sm text-muted-foreground">
                Reading source files…
              </p>
            )}
            {browse.error && (
              <p role="alert" className="p-4 text-sm text-destructive">
                {browse.error.message}
              </p>
            )}
            {browse.data?.entries.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">No matching files.</p>
            )}
            {browse.data?.entries.map((entry) => (
              <div
                key={entry.path}
                className="flex min-w-0 items-center gap-2 border-b p-2 last:border-b-0"
              >
                {entry.kind === 'directory' ? (
                  <FolderIcon
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                ) : (
                  <FileIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                )}
                {entry.kind === 'directory' ? (
                  <button
                    className="min-w-0 flex-1 truncate text-left text-sm underline-offset-4 hover:underline"
                    onClick={() => go(entry.path)}
                  >
                    {search ? entry.path : entry.path.split('/').at(-1)}
                  </button>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-sm" title={entry.path}>
                    {search ? entry.path : entry.path.split('/').at(-1)}
                  </span>
                )}
                {entry.kind === 'file' && (
                  <>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {bytes(entry.size)}
                    </span>
                    {onSelect && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!ready || attach.isPending}
                        onClick={() => attach.mutate(entry.path)}
                      >
                        Attach
                      </Button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
          {(offset > 0 || browse.data?.next_offset != null) && (
            <div className="flex justify-between">
              <Button
                size="sm"
                variant="ghost"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - 100))}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={browse.data?.next_offset == null}
                onClick={() => setOffset(browse.data?.next_offset ?? 0)}
              >
                Next
              </Button>
            </div>
          )}
        </section>
      )}
      {(action.error || attach.error || operations.error) && (
        <p role="alert" className="text-sm text-destructive">
          {(action.error || attach.error || operations.error)?.message}
        </p>
      )}
      {ready && (
        <details className="rounded-md border p-3">
          <summary className="cursor-pointer text-sm">Storage and retained evidence</summary>
          <p className="mt-2 break-all text-xs text-muted-foreground">{source.local_path}</p>
          {source.mode !== 'write_enabled' && (
            <div className="mt-3">
              {!confirmRemove ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={Boolean(active)}
                  onClick={() => setConfirmRemove(true)}
                >
                  Remove working copy
                </Button>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm">
                    Remove this {vocab.agent} copy
                    {source.mode === 'working_copy'
                      ? ' and any unsaved local edits'
                      : ' from the source browser'}
                    ? The upstream source and immutable baseline stay available.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={action.isPending}
                      onClick={() => action.mutate('remove-copy')}
                    >
                      Remove copy
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>
                      Keep copy
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </details>
      )}
    </div>
  );
}
