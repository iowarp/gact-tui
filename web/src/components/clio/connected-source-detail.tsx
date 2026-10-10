import { vocab } from '@/lib/brand-vocabulary';
import { connectionScope } from '@/lib/connection-scope';
import type { ConnectedSourceState, SourceReview, WorkspaceReference } from '@clio/core/v3';
import { TransportError } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { queryKeys } from '@/lib/query-keys';
import { ArrowLeftIcon, ArrowUpIcon, FileIcon, FolderIcon, UnplugIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ExternalLink } from '@/components/ui/external-link';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ConnectedSourceAuth } from './connected-source-auth';
import { DownloadedSourceCopy } from './downloaded-source-copy';
import { SourceMappingOptions } from './source-mapping-options';
import {
  type LinkAccess,
  type DownloadAccess,
  linkAccessNames,
  sourceBytes as bytes,
} from './connected-source-labels';
import { SourceProviderLogo } from './source-provider-logo';
import { InfoTip } from './info-tip';
import { useSourceFolderReference } from './use-source-folder-reference';
import { useSourceFileReference } from './use-source-file-reference';
import type { SourceDownloadSelection } from './source-download-selection';
import { SourceOperationStatus } from './source-operation-status';
import { useStorageAttachment } from './use-storage-attachment';

/** Management of one source keeps refresh, reviewed writeback and disconnect explicit. */
export function ConnectedSourceDetail({
  workspaceId,
  sessionId,
  source,
  hostLabel,
  onBack,
  onSelect,
  onChanged,
  manageOnly = false,
  onDownloadStarted,
  initialFolder = '',
  initialDownloaded = false,
}: {
  workspaceId: string;
  sessionId?: string;
  source: ConnectedSourceState;
  hostLabel: string;
  onBack: () => void;
  onSelect?: (reference: WorkspaceReference) => void;
  onChanged: () => void;
  manageOnly?: boolean;
  initialFolder?: string;
  initialDownloaded?: boolean;
  onDownloadStarted?: (
    source: ConnectedSourceState,
    operationId: string,
    selection?: SourceDownloadSelection,
  ) => void;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const queryClient = useQueryClient();
  const [folder, setFolder] = useState(initialFolder);
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [review, setReview] = useState<SourceReview>();
  const [selected, setSelected] = useState<string[]>([]);
  const [linkChoice, setLinkChoice] = useState<{
    base: ConnectedSourceState['link_access'];
    value: LinkAccess;
  }>();
  const [downloadChoice, setDownloadChoice] = useState<{
    base: ConnectedSourceState['download_access'];
    value: DownloadAccess;
  }>();
  const linkAccess =
    linkChoice && linkChoice.base === source.link_access
      ? linkChoice.value
      : (source.link_access ?? 'read_only');
  const downloadAccess =
    downloadChoice && downloadChoice.base === source.download_access
      ? downloadChoice.value
      : (source.download_access ?? 'editable');
  const [confirmed, setConfirmed] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [view, setView] = useState<'source' | 'downloads'>(
    initialDownloaded ? 'downloads' : 'source',
  );
  const folderReference = useSourceFolderReference(workspaceId, onSelect);
  const fileReference = useSourceFileReference(workspaceId, onSelect);
  const ready =
    Boolean(source.local_path) &&
    ['ready', 'stale', 'transferring'].includes(source.materialization ?? '');
  const canAccessSource = source.authenticated || Boolean(source.access_without_signin);
  const queryPrefix = ['connected-storage', connectionScope(settings), workspaceId];
  const browsingCopies =
    ready &&
    (view === 'downloads' ||
      source.origin === 'desktop_upload' ||
      !source.connected ||
      !canAccessSource);
  const canDownload = source.download_available ?? source.capabilities.download;
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: queryPrefix.slice(0, 2) });
    await queryClient.invalidateQueries({
      queryKey: queryKeys.key('workspace-files', settings.endpoint, workspaceId),
    });
    onChanged();
  };
  const mapping = useQuery({
    queryKey: [...queryPrefix, source.id, 'mapping-options', source.authenticated],
    queryFn: ({ signal }) => repository.sourceMappingOptions(workspaceId, source.id, signal),
    enabled: Boolean(source.link_available && source.connected && canAccessSource),
    staleTime: 60_000,
    retry: false,
  });
  const operations = useQuery({
    queryKey: [...queryPrefix, source.id, 'operations'],
    queryFn: ({ signal }) => repository.sourceOperations(workspaceId, source.id, signal),
    refetchInterval: 1500,
  });
  const orderedOperations = [...(operations.data ?? [])].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
  const latest = orderedOperations.find((row) => row.kind !== 'apply');
  const publication = orderedOperations.find((row) => row.kind === 'apply');
  const active = orderedOperations.find((row) => ['queued', 'running'].includes(row.state));
  const setAttachAfterDownload = useStorageAttachment(
    source,
    operations.data,
    ready,
    folderReference.mutate,
    fileReference.mutate,
  );
  useEffect(() => {
    if (latest?.state === 'completed') {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.key('workspace-files', settings.endpoint, workspaceId),
      });
    }
  }, [latest?.id, latest?.state, queryClient, settings.endpoint, workspaceId]);
  const browse = useQuery({
    queryKey: [
      ...queryPrefix,
      source.id,
      'files',
      source.revision,
      source.link_revision,
      folder,
      search,
      offset,
      browsingCopies,
    ],
    queryFn: async ({ signal }) => {
      try {
        return await repository.browseConnectedSource(
          workspaceId,
          source.id,
          { folder, query: search, offset, materialized: browsingCopies },
          signal,
        );
      } catch (error) {
        if (error instanceof TransportError && error.status === 403) {
          void queryClient.invalidateQueries({ queryKey: [...queryPrefix, 'sources'] });
        }
        throw error;
      }
    },
    enabled: ready || (source.connected && canAccessSource && !active),
    retry: false,
  });
  const action = useMutation({
    mutationFn: async (
      kind:
        | 'transfer'
        | 'cancel'
        | 'review'
        | 'apply'
        | 'disconnect'
        | 'reconnect'
        | 'remove-copy'
        | 'link'
        | 'unlink'
        | 'discard-edits',
    ) => {
      if (kind === 'transfer') {
        const draftId = onSelect
          ? (await repository.beginSourceDraft(workspaceId, source.id)).id
          : undefined;
        const operation = await repository
          .transferConnectedSource(
            workspaceId,
            source.id,
            folder ? [folder] : undefined,
            draftId,
            downloadAccess,
            sessionId,
          )
          .catch(async (error: unknown) => {
            if (draftId) await repository.finishSourceDraft(workspaceId, source.id, draftId, false);
            throw error;
          });
        if (onSelect && operation) {
          const selection = { path: folder, kind: 'folder' as const, draftId };
          if (onDownloadStarted) onDownloadStarted(source, operation.id, selection);
          else setAttachAfterDownload({ id: operation.id, selection });
        }
      } else if (kind === 'link' || kind === 'unlink') {
        const draftId =
          kind === 'link' && onSelect
            ? (await repository.beginSourceDraft(workspaceId, source.id)).id
            : undefined;
        try {
          let linked = source;
          if (
            kind === 'unlink' ||
            !source.linked ||
            manageOnly ||
            linkAccess !== source.link_access
          )
            linked = await repository.linkConnectedSource(
              workspaceId,
              source.id,
              kind === 'unlink',
              draftId,
              kind === 'link' ? { access: linkAccess, confirm_remote: confirmed } : undefined,
              sessionId,
            );
          if (kind === 'link' && onSelect) {
            const operation = linked.indexing_operation;
            if (operation && operation.state !== 'completed') {
              const selection = { path: folder, kind: 'folder' as const, draftId, linked: true };
              if (onDownloadStarted) onDownloadStarted(linked, operation.id, selection);
              else setAttachAfterDownload({ id: operation.id, selection });
            } else
              await folderReference.mutateAsync({
                source: linked,
                linked: true,
                path: folder,
                draftId,
              });
          }
        } catch (error) {
          if (draftId) await repository.finishSourceDraft(workspaceId, source.id, draftId, false);
          throw error;
        }
      } else if (kind === 'cancel' && latest)
        await repository.cancelSourceOperation(workspaceId, source.id, latest.id);
      else if (kind === 'review') {
        setReview(await repository.reviewSourceChanges(workspaceId, source.id));
        setSelected([]);
      } else if (kind === 'apply' && review) {
        await repository.applySourceChanges(workspaceId, source.id, review.id, selected);
        setReview(undefined);
        setSelected([]);
      } else if (
        kind === 'disconnect' ||
        kind === 'reconnect' ||
        kind === 'remove-copy' ||
        kind === 'discard-edits'
      ) {
        await repository.sourceLifecycle(workspaceId, source.id, kind);
        setConfirmRemove(false);
        setConfirmDiscard(false);
      }
    },
    onSuccess: refresh,
    onError: refresh,
  });
  const download = useMutation({
    mutationFn: async (path: string) => {
      const draftId = onSelect
        ? (await repository.beginSourceDraft(workspaceId, source.id)).id
        : undefined;
      const operation = await repository
        .transferConnectedSource(workspaceId, source.id, [path], draftId, downloadAccess, sessionId)
        .catch(async (error: unknown) => {
          if (draftId) await repository.finishSourceDraft(workspaceId, source.id, draftId, false);
          throw error;
        });
      if (onSelect && operation) {
        const selection = { path, kind: 'file' as const, draftId };
        if (onDownloadStarted) onDownloadStarted(source, operation.id, selection);
        else setAttachAfterDownload({ id: operation.id, selection });
      }
    },
    onSuccess: refresh,
    onError: refresh,
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
        Back
      </Button>
      <div className="flex items-start gap-3">
        <SourceProviderLogo provider={source.provider} size="detail" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium">{source.label}</h3>
          <p className="break-all text-xs text-muted-foreground">
            {source.origin === 'desktop_upload' ? 'Uploaded desktop folder' : source.root}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {source.linked && (
              <Badge variant="outline">
                Linked: {linkAccessNames[source.link_access ?? 'read_only']}
              </Badge>
            )}
            {ready && (
              <Badge variant="outline">
                Downloaded: {source.download_access === 'editable' ? 'Editable copy' : 'Read only'}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">{hostLabel}</span>
            <InfoTip label="About source identity">
              This folder is available to {vocab.agent} on {hostLabel}. Add it to your message so
              the agent knows which files to use.
            </InfoTip>
          </div>
        </div>
      </div>
      {onSelect && (ready || (source.linked && source.connected && canAccessSource)) && (
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            folderReference.mutate({
              source,
              linked: !browsingCopies && Boolean(source.linked),
              path: folder,
            })
          }
          disabled={folderReference.isPending || Boolean(active)}
        >
          <FolderIcon aria-hidden="true" /> Add {folder ? 'this folder' : 'source'} to message
        </Button>
      )}
      {!source.connected ? (
        <div className="flex items-center justify-between rounded-md border p-3 text-sm">
          <span>Disconnected. Copies retained.</span>
          <Button size="sm" onClick={() => action.mutate('reconnect')} disabled={action.isPending}>
            Reconnect
          </Button>
        </div>
      ) : !canAccessSource ? (
        <ConnectedSourceAuth
          workspaceId={workspaceId}
          source={source}
          collectionConsent={
            source.provider === 'globus' &&
            (source.account_authenticated ||
              (browse.error instanceof TransportError && browse.error.status === 403) ||
              Boolean(latest?.error?.startsWith('Authorize this Globus collection')))
          }
          onComplete={() => {
            void refresh();
          }}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          {source.account_url && (
            <ExternalLink href={source.account_url} className="self-center text-sm underline">
              Repository access
            </ExternalLink>
          )}
          {source.linked && (
            <Button
              variant="ghost"
              disabled={Boolean(active) || action.isPending}
              onClick={() => action.mutate('unlink')}
            >
              Unlink folder
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
      {source.connected && canAccessSource && source.origin !== 'desktop_upload' && (
        <SourceMappingOptions
          canDownload={Boolean(canDownload)}
          canLink={Boolean(source.link_available)}
          linked={Boolean(source.linked)}
          linkAccess={linkAccess}
          downloadAccess={downloadAccess}
          allowed={mapping.data?.link_access ?? ['read_only']}
          reason={mapping.error ? mapping.error.message : mapping.data?.reason}
          confirmed={confirmed}
          disabled={Boolean(active) || action.isPending}
          linkLocked={Boolean(source.pending_edits)}
          onLinkAccess={(value) => setLinkChoice({ base: source.link_access, value })}
          onDownloadAccess={(value) => setDownloadChoice({ base: source.download_access, value })}
          onConfirmed={setConfirmed}
          onLink={() => action.mutate('link')}
          onDownload={() => action.mutate('transfer')}
        />
      )}
      {source.linked && source.link_access === 'publish_later' && (
        <section className="space-y-3 rounded-lg border p-4" aria-label="Unpublished edits">
          <div>
            <h4 className="text-sm font-medium">
              {source.pending_edits ?? 0} unpublished{' '}
              {source.pending_edits === 1 ? 'edit' : 'edits'}
            </h4>
            <p className="mt-1 text-xs text-muted-foreground">
              Edits stay in {vocab.agent} until you publish them.
              {source.provider === 'github'
                ? ' Selected edits are published together in one commit.'
                : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={action.isPending || !source.pending_edits}
              onClick={() => action.mutate('review')}
            >
              Review and publish
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={action.isPending || !source.pending_edits}
              onClick={() => setConfirmDiscard(true)}
            >
              Discard local edits
            </Button>
          </div>
          {confirmDiscard && (
            <div className="space-y-2 text-sm">
              <p>Discard all unpublished edits? The originals stay unchanged.</p>
              <Button
                variant="destructive"
                size="sm"
                disabled={action.isPending}
                onClick={() => action.mutate('discard-edits')}
              >
                Discard edits
              </Button>{' '}
              <Button variant="ghost" size="sm" onClick={() => setConfirmDiscard(false)}>
                Cancel
              </Button>
            </div>
          )}
        </section>
      )}
      {source.connected &&
        source.provider === 'google_drive' &&
        !source.authenticated &&
        canAccessSource &&
        browse.isError && (
          <ConnectedSourceAuth workspaceId={workspaceId} source={source} onComplete={refresh} />
        )}
      {!ready && latest?.kind !== 'indexing' && latest?.state === 'completed' && (
        <p role="status" className="rounded-md border p-3 text-sm">
          No downloaded copy in this workspace.
        </p>
      )}
      {latest && (latest.kind === 'indexing' || latest.state !== 'completed' || ready) && (
        <SourceOperationStatus
          operation={latest}
          label={source.label}
          pending={action.isPending && action.variables === 'cancel'}
          onCancel={() => action.mutateAsync('cancel')}
        />
      )}
      {publication && (
        <p role="status" className="rounded-md border p-3 text-sm">
          {publication.state === 'completed'
            ? `Published ${publication.applied_paths.length} ${publication.applied_paths.length === 1 ? 'file' : 'files'} to the originals.`
            : publication.state === 'running'
              ? 'Publishing selected edits…'
              : `Publication ${publication.state}. ${publication.applied_paths.length} files were published. ${publication.error ?? ''}`}
        </p>
      )}
      {review && (
        <section className="space-y-3 rounded-md border p-3" aria-label="Review source changes">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium">Review edits before publishing</h4>
            <InfoTip label="About reviewed updates">
              Update only the files you select. {vocab.agent} checks for changes to the originals
              first. If an update fails, some files may already have been saved.
            </InfoTip>
          </div>
          {review.changes.length === 0 && (
            <p className="text-sm text-muted-foreground">No unpublished edits.</p>
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
                    {change.conflict ? 'Original changed' : change.kind}
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
              disabled={action.isPending || !selected.length}
              onClick={() => action.mutate('apply')}
            >
              Publish {selected.length || 'selected'} {selected.length === 1 ? 'edit' : 'edits'}
            </Button>
          </div>
        </section>
      )}
      {(ready || (source.connected && canAccessSource)) && (
        <section aria-label="Source files" className="space-y-2">
          <div className="flex items-center gap-2">
            <h4 className="flex-1 text-sm font-medium">
              {browsingCopies ? 'Downloaded files' : 'Source files'}
            </h4>
            {browsingCopies && (
              <InfoTip label="About approved inputs">
                {source.download_access === 'editable'
                  ? 'These files are on the selected computer. Adding a file to your message keeps a copy of it as it is now.'
                  : source.origin === 'desktop_upload'
                    ? 'These are your uploaded files. Upload the folder again to use changes from your computer.'
                    : 'These are your downloaded files. Download again to get changes from the original folder.'}
              </InfoTip>
            )}
          </div>
          {ready && source.connected && source.origin !== 'desktop_upload' && (
            <div className="flex gap-2" aria-label="File location">
              <Button
                size="sm"
                variant={view === 'source' ? 'secondary' : 'ghost'}
                onClick={() => {
                  setView('source');
                  go('');
                }}
              >
                Source
              </Button>
              <Button
                size="sm"
                variant={view === 'downloads' ? 'secondary' : 'ghost'}
                onClick={() => {
                  setView('downloads');
                  go('');
                }}
              >
                Downloaded
              </Button>
            </div>
          )}
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
                    {onSelect && (browsingCopies || !canDownload) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={(!browsingCopies && !source.linked) || fileReference.isPending}
                        onClick={() =>
                          fileReference.mutate({
                            source,
                            path: entry.path,
                            linked: !browsingCopies && Boolean(source.linked),
                          })
                        }
                      >
                        {browsingCopies ? 'Add to message' : 'Download file'}
                      </Button>
                    )}
                    {canDownload && !browsingCopies && source.connected && canAccessSource && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={Boolean(active) || download.isPending}
                        onClick={() => download.mutate(entry.path)}
                      >
                        Download file
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
      {(action.error ||
        fileReference.error ||
        folderReference.error ||
        operations.error ||
        download.error) && (
        <p role="alert" className="text-sm text-destructive">
          {
            (
              action.error ||
              fileReference.error ||
              folderReference.error ||
              operations.error ||
              download.error
            )?.message
          }
        </p>
      )}
      {ready && (
        <DownloadedSourceCopy
          source={source}
          active={Boolean(active)}
          pending={action.isPending}
          confirmed={confirmRemove}
          onConfirm={() => setConfirmRemove(true)}
          onKeep={() => setConfirmRemove(false)}
          onRemove={() => action.mutate('remove-copy')}
        />
      )}
    </div>
  );
}
