import type { ConnectedSourceState, WorkspaceResource } from '@clio/core/v3';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderUpIcon, PaperclipIcon, SearchIcon } from 'lucide-react';
import { memo, useMemo, useState, type ReactNode, type SyntheticEvent } from 'react';
import { Input } from '@/components/ui/input';
import { useRepository } from '@/hooks/use-repository';
import { connectionScope } from '@/lib/connection-scope';
import { formatResourceSize } from '@/lib/format';
import { AddIcon, RetryIcon } from '@/lib/icon-vocabulary';
import { cn } from '@/lib/utils';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ConnectedSourceActions } from './connected-source-actions';
import { connectedSourceErrorMessage } from './connected-source-error';
import { sourceStatus, sourceSublineParts } from './connected-source-labels';
import { ConnectedSourcePicker } from './connected-source-picker';
import { IconButton } from './primitives/icon-button';
import { ListRow } from './primitives/list-row';
import { StateView } from './primitives/state-view';
import { StatusIndicator, type StatusTone } from './primitives/status-indicator';
import {
  SOURCE_WORDMARK_WIDTH,
  SourceProviderLogo,
  sourceProviderUsesWordmark,
} from './source-provider-logo';
import type { WorkbenchListColumnProps } from './workbench-list-column';
import { GroupLabel } from './workbench-list-rows';
import { activateOnKey } from './workbench-row-keys';

/** What the pocket's source dialog opens on: connecting a new source, or one source. */
type SourceDialog =
  | { kind: 'connect' }
  | { kind: 'source'; source: ConnectedSourceState; edit?: boolean };

/** The actions column (spec `--acw`); the status column is spec `--stw` 104px, 72px in a narrow pocket. */
const SOURCE_ACTIONS_WIDTH = 52;

/**
 * Sources: the workspace's connected sources as two-line rows (provider and access,
 * then the status word), uploaded files under them, and a last row that connects
 * another source. A row opens the source; its hover actions publish edits or
 * manage it, and a source that needs sign-in keeps that action shown.
 */
export function SourcesList({
  resources,
  resourcesPending,
  resourcesError,
  onOpenResource,
  onOpenTab,
  onRefreshFiles,
  tabs,
  activeTabId,
  workspaceId,
  sessionId,
  renderHeader,
}: WorkbenchListColumnProps & { renderHeader: (actions: ReactNode) => ReactNode }) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const queryClient = useQueryClient();
  // The picker reads the same key, so a change in either shows in both.
  const sourcesKey = useMemo(
    () => ['connected-storage', connectionScope(settings), workspaceId, 'sources'],
    [settings, workspaceId],
  );
  const sources = useQuery({
    queryKey: sourcesKey,
    queryFn: ({ signal }) => repository.connectedSources(workspaceId, signal),
    // Brisk only while a download moves; otherwise the list stays quiet.
    refetchInterval: (query) =>
      query.state.data?.some((row) => row.materialization === 'transferring') ? 2000 : 30_000,
    retry: false,
    enabled: Boolean(workspaceId),
  });
  const [dialog, setDialog] = useState<SourceDialog>({ kind: 'connect' });
  const [dialogOpen, setDialogOpen] = useState(false);
  const openDialog = (next: SourceDialog) => {
    setDialog(next);
    setDialogOpen(true);
  };
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const connected = useMemo(
    () =>
      (sources.data ?? []).filter(
        (row) =>
          !needle ||
          row.label.toLowerCase().includes(needle) ||
          sourceSublineParts(row).join(' ').toLowerCase().includes(needle),
      ),
    [sources.data, needle],
  );
  const uploads = useMemo(
    () => resources.filter((row) => !needle || row.name.toLowerCase().includes(needle)),
    [resources, needle],
  );
  const total = (sources.data?.length ?? 0) + resources.length;
  const closeSearch = () => {
    setSearching(false);
    setQuery('');
  };
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: sourcesKey });
    onRefreshFiles?.();
  };
  const active = tabs.find((tab) => tab.id === activeTabId);
  const pending = (sources.isPending && Boolean(workspaceId)) || resourcesPending;

  // A Globus or NDP wordmark widens every row's icon column, so names line up.
  const iconWidth = sources.data?.some((source) => sourceProviderUsesWordmark(source.provider))
    ? SOURCE_WORDMARK_WIDTH
    : undefined;
  let body: ReactNode;
  if (pending && !total)
    body = <StateView className="p-4" kind="loading" size="panel" title="Loading sources" />;
  else if (needle && !connected.length && !uploads.length)
    body = (
      <StateView
        action={{ label: 'Clear search', onClick: closeSearch }}
        className="p-4"
        kind="empty"
        size="panel"
        title="No sources match"
      />
    );
  else
    body = (
      <div aria-label="Workspace sources" className="@container/sources p-1" role="list">
        {connected.map((source) => (
          <ConnectedSourceRow
            key={source.id}
            iconWidth={iconWidth}
            onEdit={() => openDialog({ kind: 'source', source, edit: true })}
            onBrowse={
              // NDP is a catalog: its row opens the NDP browser tab (spec connect-infrastructure).
              source.provider === 'ndp'
                ? () =>
                    onOpenTab({
                      id: `ndp:${workspaceId}`,
                      kind: 'ndp',
                      label: source.label,
                      workspaceId,
                    })
                : undefined
            }
            onOpen={() => openDialog({ kind: 'source', source })}
            onRemoved={refresh}
            source={source}
            workspaceId={workspaceId}
          />
        ))}
        {uploads.length && connected.length ? <GroupLabel>Uploads</GroupLabel> : null}
        {uploads.map((resource) => (
          <UploadRow
            key={resource.id}
            iconWidth={iconWidth}
            onOpen={() => onOpenResource(resource)}
            resource={resource}
            selected={active?.kind === 'resource' && active.resource.id === resource.id}
          />
        ))}
        {!total && !sources.error && !resourcesError ? (
          <p className="px-2 pt-2 pb-1 text-[12px] text-muted-foreground" role="listitem">
            No sources in this workspace yet.
          </p>
        ) : null}
        {sources.error || resourcesError ? (
          // The spec's status line (`.c3s`): what failed and Retry, no box.
          <div role="listitem">
            <StateView
              action={{ label: 'Retry', onClick: refresh }}
              kind="error"
              size="row"
              title={
                <span
                  title={
                    sources.error
                      ? connectedSourceErrorMessage(sources.error).replace(
                          / Try again in a moment\.$/u,
                          '',
                        )
                      : undefined
                  }
                >
                  {sources.error ? "Sources couldn't be listed" : "Uploads couldn't be listed"}
                </span>
              }
            />
          </div>
        ) : null}
        {needle || (sources.error && !connected.length) ? null : (
          <div role="listitem">
            <ListRow
              aria-label="Connect a data source"
              className="h-[30px] cursor-pointer text-[12.5px] text-accent-foreground [&_[data-slot=list-row-icon]]:text-accent-foreground"
              icon={<AddIcon />}
              onClick={() => openDialog({ kind: 'connect' })}
              onKeyDown={activateOnKey(() => openDialog({ kind: 'connect' }))}
              role="button"
              tabIndex={0}
              title="Connect a data source"
            />
          </div>
        )}
      </div>
    );

  return (
    <>
      {renderHeader(
        <>
          {total ? (
            <IconButton
              aria-pressed={searching}
              icon={<SearchIcon />}
              label={searching ? 'Close search' : 'Search sources'}
              onClick={() => (searching ? closeSearch() : setSearching(true))}
              size="sm"
              tooltipSide="bottom"
            />
          ) : null}
          <IconButton
            icon={<AddIcon />}
            label="Connect a data source"
            onClick={() => openDialog({ kind: 'connect' })}
            size="sm"
            tooltipSide="bottom"
          />
        </>,
      )}
      {searching ? (
        <div className="flex h-9 shrink-0 items-center border-b border-border px-1.5">
          <Input
            aria-label="Search sources"
            autoFocus
            className="h-7 text-xs"
            data-escape-owner=""
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                // Escape closes only the search; `data-escape-owner` keeps the narrow sheet open.
                event.stopPropagation();
                closeSearch();
              }
            }}
            placeholder="Search sources"
            value={query}
          />
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
      <ConnectedSourcePicker
        initialEdit={dialog.kind === 'source' && dialog.edit}
        initialSourceId={dialog.kind === 'source' ? dialog.source.id : undefined}
        intent={dialog.kind === 'connect' ? 'connect' : undefined}
        key={dialog.kind === 'source' ? dialog.source.id : 'connect'}
        manageOnly={dialog.kind === 'source'}
        onChanged={refresh}
        onOpenChange={setDialogOpen}
        open={dialogOpen}
        sessionId={sessionId}
        title={dialog.kind === 'source' ? dialog.source.label : undefined}
        workspaceId={workspaceId}
      />
    </>
  );
}

/** Keeps a click on a row's own buttons (and its menus) from opening the row. */
function stopRowActivation(event: SyntheticEvent) {
  event.stopPropagation();
}

const ConnectedSourceRow = memo(function ConnectedSourceRow({
  source,
  iconWidth,
  workspaceId,
  onOpen,
  onBrowse,
  onEdit,
  onRemoved,
}: {
  source: ConnectedSourceState;
  workspaceId: string;
  iconWidth: number | undefined;
  onOpen: () => void;
  /** Replaces the row's own open: NDP opens its browser tab. */
  onBrowse?: () => void;
  onEdit: () => void;
  onRemoved: () => void;
}) {
  const status = sourceStatus(source);
  const parts = sourceSublineParts(source);
  return (
    <div role="listitem" title={[source.label, ...parts, status.label].join(', ')}>
      <ListRow
        actions={
          <span
            className="flex items-center gap-0.5"
            onClick={stopRowActivation}
            onKeyDown={stopRowActivation}
          >
            {status.signIn ? (
              <IconButton icon={<RetryIcon />} label="Sign in again" onClick={onOpen} size="sm" />
            ) : source.pending_edits ? (
              <IconButton
                icon={<FolderUpIcon />}
                label="Review and publish"
                onClick={onOpen}
                size="sm"
              />
            ) : null}
            <span
              className={cn(
                'flex',
                status.signIn &&
                  'opacity-0 group-focus-within/list-row:opacity-100 group-hover/list-row:opacity-100 pointer-coarse:opacity-100',
              )}
            >
              <ConnectedSourceActions
                compact
                onEdit={onEdit}
                onRemoved={onRemoved}
                source={source}
                workspaceId={workspaceId}
              />
            </span>
          </span>
        }
        actionsWidth={SOURCE_ACTIONS_WIDTH}
        aria-label={`Open ${source.label}`}
        // A source that needs sign-in keeps its action shown, as the spec pins it.
        className={cn(
          'cursor-pointer',
          status.signIn && '[&>[data-slot=list-row-actions]]:opacity-100',
        )}
        columns={<SourceStatusColumn label={status.label} tone={status.tone} />}
        description={<SublineParts parts={parts} />}
        icon={<SourceProviderLogo provider={source.provider} size="icon" />}
        iconWidth={iconWidth}
        layout="stacked"
        onClick={onBrowse ?? onOpen}
        onKeyDown={activateOnKey(onBrowse ?? onOpen)}
        role="button"
        tabIndex={0}
        title={source.label}
      />
    </div>
  );
});

/** Sub-line parts held apart by a layout gap rather than a separator glyph. */
function SublineParts({ parts }: { parts: readonly string[] }) {
  return (
    <span className="flex min-w-0 gap-2">
      {parts.map((part, index) => (
        <span className={cn('truncate', index === 0 && 'shrink-0')} key={part}>
          {part}
        </span>
      ))}
    </span>
  );
}

function SourceStatusColumn({ label, tone }: { label: string; tone: StatusTone }) {
  return (
    <span className="flex w-[104px] shrink-0 overflow-hidden @max-[340px]/sources:w-[72px]">
      <StatusIndicator className="text-[11px]" label={label} tone={tone} />
    </span>
  );
}

/** `upload_failed` → "Upload failed". */
function sentenceCase(value: string) {
  const words = value.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A file uploaded to the workspace: the same row, its size in the sub-line. */
function UploadRow({
  resource,
  iconWidth,
  selected,
  onOpen,
}: {
  resource: WorkspaceResource;
  iconWidth: number | undefined;
  selected: boolean;
  onOpen: () => void;
}) {
  const size = formatResourceSize(resource.received_size);
  const status =
    resource.state === 'uploading'
      ? {
          tone: 'running' as const,
          label: resource.declared_size
            ? `${Math.round((resource.received_size / resource.declared_size) * 100)}%`
            : 'Uploading',
        }
      : resource.state === 'ready'
        ? { tone: 'success' as const, label: 'Ready' }
        : { tone: 'idle' as const, label: sentenceCase(resource.state) };
  return (
    <div role="listitem" title={`${resource.name}, ${size}`}>
      <ListRow
        actions={null}
        actionsWidth={SOURCE_ACTIONS_WIDTH}
        aria-current={selected || undefined}
        aria-label={`Open ${resource.name}`}
        className="cursor-pointer"
        columns={<SourceStatusColumn label={status.label} tone={status.tone} />}
        description={<SublineParts parts={['Upload', size]} />}
        icon={<PaperclipIcon />}
        iconWidth={iconWidth}
        layout="stacked"
        onClick={onOpen}
        onKeyDown={activateOnKey(onOpen)}
        role="button"
        selected={selected}
        tabIndex={0}
        title={resource.name}
      />
    </div>
  );
}
