import { vocab } from '@/lib/brand-vocabulary';
import { connectionScope } from '@/lib/connection-scope';
import type {
  ConnectedSourceState,
  SourceProvider,
  SourceReview,
  WorkspaceReference,
} from '@clio/core/v3';
import { TransportError } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { queryKeys } from '@/lib/query-keys';
import { CheckIcon, CircleAlertIcon, CircleIcon, UnlinkIcon, UnplugIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ExternalLink } from '@/components/ui/external-link';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ConnectedSourceAuth } from './connected-source-auth';
import { sourceAccessNames, sourceSublineParts } from './connected-source-labels';
import { InfoTip } from './info-tip';
import { useSourceFolderReference } from './use-source-folder-reference';
import { useSourceFileReference } from './use-source-file-reference';
import type { SourceDownloadSelection } from './source-download-selection';
import { SourceOperationStatus } from './source-operation-status';
import { useStorageAttachment } from './use-storage-attachment';
import { GlobusReceivingStorageControl } from './globus-receiving-storage';
import { useSourceTrackingSession } from './use-source-tracking-session';
import { KeyValueGrid, type KeyValueItem } from './primitives/key-value-grid';
import { RowConfirm } from './primitives/row-confirm';
import { SourceProviderGlyph, SourceStatusLine } from './source-form-parts';
import { accessDownload, accessLink, linkAccessRow, type SourceAccess } from './source-access';
import { useSourceFrameFooter } from './use-source-frame-footer';
import { SourceDetailAccess } from './source-detail-access';
import { SourceEditForm } from './source-edit-form';
import { SourceFilesBrowser } from './source-files-browser';
import {
  SourcePublicationStatus,
  SourceReviewPanel,
  SourceUnpublishedEdits,
} from './source-review-panel';

type DetailProps = {
  workspaceId: string;
  sessionId?: string;
  source: ConnectedSourceState;
  hostLabel: string;
  onBack: () => void;
  onSelect?: (reference: WorkspaceReference) => void;
  onChanged: () => void;
  manageOnly?: boolean;
  initialFolder?: string;
  /** The provider's name for `initialFolder`, when that is a portable alias. */
  initialFolderName?: string;
  initialDownloaded?: boolean;
  onDownloadStarted?: (
    source: ConnectedSourceState,
    operationId: string,
    selection?: SourceDownloadSelection,
  ) => void;
  /** Show the source's name (hidden when the frame's title already is it). */
  showName?: boolean;
  /** A knowledge source opens in the knowledge view. */
  onOpenKnowledge?: () => void;
};

/**
 * One source in the spec's Manage form: its name and sub-line, a status line,
 * a key-value grid, Access as the connect form's rows, then its files. Edit
 * swaps in the connect form's fields for the same provider.
 */
export function ConnectedSourceDetail({
  provider,
  browseStartPath,
  editRequest = 0,
  initialEdit = false,
  ...props
}: DetailProps & {
  /** The source's provider, for Edit's fields. */
  provider?: SourceProvider;
  browseStartPath?: string;
  /** Bumped by the frame's Edit to open the fields. */
  editRequest?: number;
  initialEdit?: boolean;
}) {
  const [editing, setEditing] = useState(initialEdit && Boolean(provider));
  const [seenRequest, setSeenRequest] = useState(editRequest);
  if (editRequest !== seenRequest) {
    setSeenRequest(editRequest);
    if (provider) setEditing(true);
  }
  if (editing && provider)
    return (
      <SourceEditForm
        workspaceId={props.workspaceId}
        provider={provider}
        source={props.source}
        hostLabel={props.hostLabel}
        browseStartPath={browseStartPath}
        onSaved={() => props.onChanged()}
        onDone={() => setEditing(false)}
      />
    );
  return <SourceManage {...props} />;
}

function SourceManage({
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
  initialFolderName = initialFolder,
  initialDownloaded = false,
  showName = true,
  onOpenKnowledge,
}: DetailProps) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const tracking = useSourceTrackingSession({ workspaceId, sessionId, sourceLabel: source.label });
  const queryClient = useQueryClient();
  const [folder, setFolder] = useState(initialFolder);
  const [folderName, setFolderName] = useState(initialFolderName);
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [review, setReview] = useState<SourceReview>();
  const [selected, setSelected] = useState<string[]>([]);
  // One Access choice, held against the source's state so a server change resets it.
  const accessBase = `${source.linked}:${source.link_access}:${source.download_access}:${source.local_path}`;
  const currentAccess: SourceAccess = source.linked
    ? linkAccessRow[source.link_access ?? 'read_only']
    : source.local_path && source.download_access === 'editable'
      ? 'editable'
      : 'read_only';
  const [accessChoice, setAccessChoice] = useState<{ base: string; value: SourceAccess }>();
  const access =
    accessChoice && accessChoice.base === accessBase ? accessChoice.value : currentAccess;
  const linkAccess = accessLink[access];
  const downloadAccess = accessDownload(access);
  const [confirmed, setConfirmed] = useState(false);
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
      const relink =
        kind === 'unlink' || !source.linked || manageOnly || linkAccess !== source.link_access;
      const trackingSession =
        kind === 'transfer' || (kind === 'link' && relink) ? await tracking.resolve() : undefined;
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
            trackingSession,
          )
          .catch(async (error: unknown) => {
            if (draftId) await repository.finishSourceDraft(workspaceId, source.id, draftId, false);
            throw error;
          });
        if (onSelect && operation) {
          const selection = { path: folder, name: folderName, kind: 'folder' as const, draftId };
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
          if (relink)
            linked = await repository.linkConnectedSource(
              workspaceId,
              source.id,
              kind === 'unlink',
              draftId,
              kind === 'link' ? { access: linkAccess, confirm_remote: confirmed } : undefined,
              trackingSession,
            );
          if (kind === 'link' && onSelect) {
            const operation = linked.indexing_operation;
            if (operation && operation.state !== 'completed') {
              const selection = {
                path: folder,
                name: folderName,
                kind: 'folder' as const,
                draftId,
                linked: true,
              };
              if (onDownloadStarted) onDownloadStarted(linked, operation.id, selection);
              else setAttachAfterDownload({ id: operation.id, selection });
            } else
              await folderReference.mutateAsync({
                source: linked,
                linked: true,
                path: folder,
                name: folderName,
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
      }
    },
    onSuccess: refresh,
    onError: refresh,
  });
  const download = useMutation({
    mutationFn: async ({ path, name }: { path: string; name?: string }) => {
      const trackingSession = await tracking.resolve();
      const draftId = onSelect
        ? (await repository.beginSourceDraft(workspaceId, source.id)).id
        : undefined;
      const operation = await repository
        .transferConnectedSource(
          workspaceId,
          source.id,
          [path],
          draftId,
          downloadAccess,
          trackingSession,
        )
        .catch(async (error: unknown) => {
          if (draftId) await repository.finishSourceDraft(workspaceId, source.id, draftId, false);
          throw error;
        });
      if (onSelect && operation) {
        const selection = { path, name, kind: 'file' as const, draftId };
        if (onDownloadStarted) onDownloadStarted(source, operation.id, selection);
        else setAttachAfterDownload({ id: operation.id, selection });
      }
    },
    onSuccess: refresh,
    onError: refresh,
  });
  const go = (path: string, name?: string) => {
    setFolder(path);
    setFolderName(name || path);
    setSearch('');
    setOffset(0);
  };
  const busy = Boolean(active) || action.isPending;
  const canLink = Boolean(source.link_available);
  const allowed = mapping.data?.link_access ?? ['read_only'];
  const linkable = canLink && allowed.includes(linkAccess);
  const linkLocked = Boolean(source.linked && source.pending_edits);
  const showAccess =
    source.connected &&
    canAccessSource &&
    source.origin !== 'desktop_upload' &&
    (canLink || Boolean(canDownload)) &&
    !review;
  const accessReason = mapping.error ? mapping.error.message : mapping.data?.reason;
  const unavailable: Partial<Record<SourceAccess, string>> = {};
  if (!(canLink && allowed.includes('publish_later')) && !canDownload)
    unavailable.editable = accessReason ?? 'Not offered by this source';
  if (!(canLink && allowed.includes('write_through')))
    unavailable.write =
      accessReason ??
      (canLink ? 'Not offered by this source' : 'A downloaded copy never changes the originals');
  const files = source.provider === 'ndp';
  const linkLabel = source.linked ? 'Update link' : files ? 'Link selected files' : 'Link folder';
  const downloadLabel = files
    ? 'Download selected files'
    : folder
      ? 'Download folder'
      : 'Download all';
  const footer = useSourceFrameFooter(
    review
      ? {
          confirm: {
            label: `Publish ${selected.length || 'selected'} ${selected.length === 1 ? 'edit' : 'edits'}`,
            disabled: action.isPending || !selected.length,
          },
          onConfirm: () => action.mutate('apply'),
          start: {
            label: 'Close review',
            disabled: action.isPending,
            onClick: () => setReview(undefined),
          },
        }
      : {
          confirm: !showAccess
            ? undefined
            : linkable
              ? {
                  label: linkLabel,
                  disabled: busy || linkLocked || (linkAccess === 'write_through' && !confirmed),
                }
              : canDownload
                ? { label: downloadLabel, disabled: busy }
                : undefined,
          onConfirm: () => action.mutate(linkable ? 'link' : 'transfer'),
          secondary:
            showAccess && linkable && canDownload
              ? {
                  label: 'Download a copy',
                  disabled: busy,
                  onClick: () => action.mutate('transfer'),
                }
              : undefined,
          start: { label: 'Back', back: true, onClick: onBack },
        },
  );
  const sublineParts = sourceSublineParts(source);
  const error =
    action.error ||
    fileReference.error ||
    folderReference.error ||
    operations.error ||
    download.error;
  const quiet = 'h-6 px-2 text-[12px]';
  const details: KeyValueItem[] = [
    {
      label: 'Location',
      value: source.origin === 'desktop_upload' ? 'Uploaded from your computer' : source.root,
      mono: source.origin !== 'desktop_upload',
    },
    {
      label: 'Saved on',
      value: hostLabel,
      action: (
        <InfoTip label="About source identity">
          This folder is available to {vocab.agent} on {hostLabel}. Add it to your message so the
          agent knows which files to use.
        </InfoTip>
      ),
    },
    ...(canLink || source.linked
      ? [
          {
            label: 'Link',
            value: source.linked
              ? sourceAccessNames[source.link_access ?? 'read_only']
              : 'Not linked',
            action:
              source.linked && source.connected && canAccessSource ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={quiet}
                  disabled={busy}
                  onClick={() => action.mutate('unlink')}
                >
                  <UnlinkIcon aria-hidden="true" />
                  Unlink
                </Button>
              ) : undefined,
          },
        ]
      : []),
    ...(canDownload || ready
      ? [
          {
            label: 'Downloaded copy',
            value: ready
              ? source.download_access === 'editable'
                ? 'Editable copy'
                : 'Read only copy'
              : 'None',
            title: ready ? (source.local_path ?? undefined) : undefined,
            action: ready ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={quiet}
                disabled={Boolean(active)}
                onClick={() => setConfirmRemove(true)}
              >
                Remove
              </Button>
            ) : undefined,
          },
        ]
      : []),
  ];
  return (
    <div className="flex min-w-0 flex-col gap-[13px]">
      <div className="flex min-w-0 items-center gap-2.5">
        <SourceProviderGlyph
          provider={source.origin === 'desktop_upload' ? 'upload' : source.provider}
          className="text-muted-foreground"
        />
        <div className="min-w-0 flex-1 leading-[1.3]">
          {showName ? (
            <h3 className="truncate text-[13px] font-medium" title={source.label}>
              {source.label}
            </h3>
          ) : null}
          <p className="flex min-w-0 gap-2.5 truncate text-[11.5px] whitespace-nowrap text-muted-foreground">
            {sublineParts.map((part) => (
              <span key={part} className="truncate">
                {part}
              </span>
            ))}
          </p>
        </div>
      </div>
      {!source.connected ? (
        <SourceStatusLine
          tone="warning"
          icon={<UnplugIcon />}
          actions={
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={quiet}
              disabled={action.isPending}
              onClick={() => action.mutate('reconnect')}
            >
              Reconnect
            </Button>
          }
        >
          Disconnected. Downloaded copies are kept.
        </SourceStatusLine>
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
        <SourceStatusLine
          tone="ok"
          icon={<CheckIcon />}
          actions={
            <>
              {onOpenKnowledge && source.source_kind === 'knowledge' ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={quiet}
                  onClick={onOpenKnowledge}
                >
                  Open knowledge
                </Button>
              ) : null}
              {source.account_url ? (
                <ExternalLink
                  href={source.account_url}
                  className="px-1.5 text-[12px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Repository access
                </ExternalLink>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className={quiet}
                disabled={busy}
                onClick={() => action.mutate('disconnect')}
              >
                <UnplugIcon aria-hidden="true" />
                Disconnect
              </Button>
            </>
          }
        >
          {source.linked ? 'Linked' : 'Connected'}
        </SourceStatusLine>
      )}
      {tracking.control}
      {source.provider === 'globus' ? (
        <GlobusReceivingStorageControl hostLabel={hostLabel} />
      ) : null}
      <KeyValueGrid items={details} actionColumn aria-label="Source details" />
      {confirmRemove ? (
        <RowConfirm
          question={
            source.download_access === 'editable'
              ? 'Remove the copy and its local edits? Originals are kept.'
              : 'Remove the workspace copy? Originals are kept.'
          }
          action="Remove copy"
          busyAction="Removing…"
          onKeep={() => setConfirmRemove(false)}
          onConfirm={() => action.mutateAsync('remove-copy')}
        />
      ) : null}
      {source.linked && source.link_access === 'publish_later' ? (
        <SourceUnpublishedEdits
          source={source}
          reviewing={Boolean(review)}
          disabled={action.isPending}
          onDiscard={() => action.mutateAsync('discard-edits')}
          onReview={() => action.mutate('review')}
        />
      ) : null}
      {source.connected &&
        source.provider === 'google_drive' &&
        !source.authenticated &&
        canAccessSource &&
        browse.isError && (
          <ConnectedSourceAuth workspaceId={workspaceId} source={source} onComplete={refresh} />
        )}
      {!ready && latest?.kind !== 'indexing' && latest?.state === 'completed' ? (
        <SourceStatusLine role="status" tone="quiet" icon={<CircleIcon />}>
          No downloaded copy in this workspace.
        </SourceStatusLine>
      ) : null}
      {latest && (latest.kind === 'indexing' || latest.state !== 'completed' || ready) ? (
        <SourceOperationStatus
          operation={latest}
          label={source.label}
          pending={action.isPending && action.variables === 'cancel'}
          onCancel={() => action.mutateAsync('cancel')}
        />
      ) : null}
      {publication ? <SourcePublicationStatus publication={publication} /> : null}
      {showAccess ? (
        <SourceDetailAccess
          access={access}
          onAccess={(value) => {
            setAccessChoice({ base: accessBase, value });
            setConfirmed(false);
          }}
          unavailable={unavailable}
          disabled={busy || linkLocked}
          confirm={linkable && linkAccess === 'write_through'}
          confirmed={confirmed}
          onConfirmed={setConfirmed}
          reason={
            canLink && accessReason && !Object.values(unavailable).includes(accessReason)
              ? accessReason
              : undefined
          }
        />
      ) : null}
      {review ? (
        <SourceReviewPanel
          review={review}
          selected={selected}
          disabled={action.isPending}
          onSelected={setSelected}
        />
      ) : ready || (source.connected && canAccessSource) ? (
        <SourceFilesBrowser
          copies={browsingCopies}
          copiesNote={
            source.download_access === 'editable'
              ? 'These files are on the selected computer. Adding a file to your message keeps a copy of it as it is now.'
              : source.origin === 'desktop_upload'
                ? 'These are your uploaded files. Upload the folder again to use changes from your computer.'
                : 'These are your downloaded files. Download again to get changes from the original folder.'
          }
          view={ready && source.connected && source.origin !== 'desktop_upload' ? view : undefined}
          onView={(next) => {
            setView(next);
            go('');
          }}
          folder={folder}
          folderName={folderName}
          search={search}
          offset={offset}
          onGo={go}
          onSearch={(text) => {
            setSearch(text);
            setOffset(0);
          }}
          onOffset={setOffset}
          browse={browse}
          addFolder={
            onSelect && (ready || (source.linked && source.connected && canAccessSource))
              ? {
                  label: `Add ${folder ? 'this folder' : 'source'} to message`,
                  disabled: folderReference.isPending || Boolean(active),
                  onClick: () =>
                    folderReference.mutate({
                      source,
                      linked: !browsingCopies && Boolean(source.linked),
                      path: folder,
                      name: folderName,
                    }),
                }
              : undefined
          }
          fileAction={(entry) =>
            onSelect && (browsingCopies || !canDownload)
              ? {
                  label: 'Add to message',
                  disabled: (!browsingCopies && !source.linked) || fileReference.isPending,
                  reason:
                    !browsingCopies && !source.linked
                      ? linkable
                        ? `${linkLabel} to add its files to a message.`
                        : 'Link this source to add its files to a message.'
                      : undefined,
                  onClick: () =>
                    fileReference.mutate({
                      source,
                      path: entry.path,
                      name: entry.remote_path,
                      linked: !browsingCopies && Boolean(source.linked),
                    }),
                }
              : canDownload && !browsingCopies && source.connected && canAccessSource
                ? {
                    label: 'Download file',
                    disabled: Boolean(active) || download.isPending,
                    onClick: () => download.mutate({ path: entry.path, name: entry.remote_path }),
                  }
                : undefined
          }
        />
      ) : null}
      {error ? (
        <SourceStatusLine role="alert" tone="error" icon={<CircleAlertIcon />}>
          {error.message}
        </SourceStatusLine>
      ) : null}
      {footer}
    </div>
  );
}
