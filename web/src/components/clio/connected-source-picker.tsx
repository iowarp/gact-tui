import { vocab } from '@/lib/brand-vocabulary';
import { connectionScope } from '@/lib/connection-scope';
import { openKnowledge } from '@/lib/knowledge-navigation';
import { useAgentOnThisComputer } from '@/hooks/use-agent-on-this-computer';
import { queryKeys } from '@/lib/query-keys';
import type { ConnectedSourceState, SourceProvider, WorkspaceReference } from '@clio/core/v3';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AddIcon, InfoIcon } from '@/lib/icon-vocabulary';
import {
  ArrowRightIcon,
  CheckIcon,
  ChevronRightIcon,
  DatabaseIcon,
  FolderUpIcon,
  LogInIcon,
  PaperclipIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DialogFrame } from './primitives/dialog-frame';
import { IconButton } from './primitives/icon-button';
import { ItemRow } from './primitives/item-row';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ConnectedSourceForm } from './connected-source-form';
import { FolderAttachForm } from './folder-attach-form';
import { connectedSourceErrorMessage } from './connected-source-error';
import { linkAccessNames, sourceStatus } from './connected-source-labels';
import { ConnectedSourceDetail } from './connected-source-detail';
import { SourceProviderLogo } from './source-provider-logo';
import { SOURCE_WORDMARK_WIDTH, sourceProviderUsesWordmark } from './source-provider-wordmark';
import { SourceProviderInfo } from './source-provider-info';
import type { ObsidianChoice } from './obsidian-source-form';
import type { SourceChoiceId } from './source-form-parts';
import {
  SourceFooterSecondary,
  SourceFooterStart,
  SourceFrameFooterProvider,
} from './source-frame-footer';
import { useSourceFrameFooter, useSourceFrameFooterHost } from './use-source-frame-footer';
import { InfoTip } from './info-tip';
import { ConnectedSourceActions } from './connected-source-actions';
import { ConnectedAccountActions } from './connected-account-actions';
import { ConnectedAccountSignIn } from './connected-source-auth';
import { useSourceFolderReference } from './use-source-folder-reference';
import type { SourceDownloadSelection } from './source-download-selection';
import { t, ph } from '@lingui/core/macro';
import { sentenceGap } from '@/lib/locale-format';

/** The same trusted connection and browse surface serves the composer and Files tab. */
export function ConnectedSourcePicker({
  workspaceId,
  sessionId,
  open,
  onOpenChange,
  onSelect,
  onChanged,
  onUploadFiles,
  initialFolderFiles,
  initialFolder,
  initialFolderName,
  initialDownloaded,
  initialSourceId,
  initialProviderId,
  initialObsidianChoice,
  manageOnly = false,
  intent,
  title,
  initialEdit = false,
  onDownloadStarted,
}: {
  workspaceId: string;
  sessionId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect?: (reference: WorkspaceReference) => void;
  onChanged?: () => void;
  onUploadFiles?: () => void;
  initialFolderFiles?: File[];
  initialFolder?: string;
  /** The provider's name for `initialFolder`, when that is a portable alias. */
  initialFolderName?: string;
  initialDownloaded?: boolean;
  initialSourceId?: string;
  initialProviderId?: string;
  initialObsidianChoice?: ObsidianChoice;
  manageOnly?: boolean;
  /**
   * `connect`: the Sources pocket's `+`: a folder or a provider to connect, without
   * the list of sources the pocket already shows.
   */
  intent?: 'connect';
  /** The frame's title when it opens on one source (its name). */
  title?: string;
  /** Opens `initialSourceId` straight into its edit form. */
  initialEdit?: boolean;
  onDownloadStarted?: (
    source: ConnectedSourceState,
    operationId: string,
    selection?: SourceDownloadSelection,
  ) => void;
}) {
  const { settings } = useConnectionSettings();
  const [headerActions, setHeaderActions] = useState<HTMLDivElement | null>(null);
  const scope = `${connectionScope(settings)}:${workspaceId}`;
  const activeScope = useRef(scope);
  useLayoutEffect(() => {
    activeScope.current = scope;
    return () => {
      activeScope.current = '';
    };
  }, [scope]);
  const connect = intent === 'connect' && !manageOnly && !onSelect;
  const { footer, setFooter } = useSourceFrameFooterHost();
  return (
    <DialogFrame
      open={open}
      onOpenChange={onOpenChange}
      confirm={
        footer?.confirm && footer.onConfirm
          ? { ...footer.confirm, onConfirm: footer.onConfirm }
          : undefined
      }
      footerStart={footer?.start ? <SourceFooterStart start={footer.start} /> : undefined}
      secondary={
        footer?.secondary ? <SourceFooterSecondary secondary={footer.secondary} /> : undefined
      }
      icon={onSelect && !manageOnly ? <PaperclipIcon /> : connect ? <AddIcon /> : <DatabaseIcon />}
      title={
        title ??
        (manageOnly
          ? t`Sources`
          : onSelect
            ? t`Attach`
            : connect
              ? t`Connect a data source`
              : t`Connected data`)
      }
      description={
        manageOnly || connect ? undefined : t`Choose files, folders, or a connected source.`
      }
      srDescription={
        connect
          ? t`Choose a provider to bring its files or datasets into this workspace.`
          : undefined
      }
      // The spec's dialog rule (36%, from 340 px) reaching `.c3d`'s 480 px at 1280.
      className={connect ? 'w-[clamp(340px,37.5vw,480px)]' : undefined}
      titleActions={<div ref={setHeaderActions} className="flex items-center gap-0.5" />}
    >
      <div className="-mx-[18px] max-h-[min(72dvh,680px)] overflow-y-auto px-[18px] text-menu">
        {open && (
          <SourceFrameFooterProvider register={setFooter}>
            <ConnectedSourceContents
              key={`${scope}:${initialSourceId ?? ''}`}
              workspaceId={workspaceId}
              sessionId={sessionId}
              manageOnly={manageOnly}
              connectOnly={connect}
              initialEdit={initialEdit}
              onDownloadStarted={onDownloadStarted}
              onUploadFiles={onUploadFiles}
              initialFolderFiles={initialFolderFiles}
              initialFolder={initialFolder}
              initialFolderName={initialFolderName}
              initialDownloaded={initialDownloaded}
              initialSourceId={initialSourceId}
              initialProviderId={initialProviderId}
              initialObsidianChoice={initialObsidianChoice}
              headerActions={headerActions}
              frameTitle={title}
              onDiscard={() => {
                if (activeScope.current === scope) onOpenChange(false);
              }}
              onSelect={
                onSelect
                  ? (reference) => {
                      if (activeScope.current === scope) onSelect(reference);
                    }
                  : undefined
              }
              onChanged={() => {
                if (activeScope.current === scope) onChanged?.();
              }}
            />
          </SourceFrameFooterProvider>
        )}
      </div>
    </DialogFrame>
  );
}

/** Reuse trusted account and workspace-source controls in Attach and Settings. */
export function ConnectedSourceContents({
  workspaceId,
  sessionId,
  manageOnly,
  onDownloadStarted,
  onSelect,
  onChanged,
  onUploadFiles,
  initialFolderFiles,
  initialFolder,
  initialFolderName,
  initialDownloaded,
  initialSourceId,
  initialProviderId,
  initialObsidianChoice,
  headerActions,
  onDiscard,
  settingsView = false,
  connectOnly = false,
  initialEdit = false,
  frameTitle,
}: {
  workspaceId: string;
  sessionId?: string;
  manageOnly: boolean;
  connectOnly?: boolean;
  initialEdit?: boolean;
  onDownloadStarted?: (
    source: ConnectedSourceState,
    operationId: string,
    selection?: SourceDownloadSelection,
  ) => void;
  onSelect?: (reference: WorkspaceReference) => void;
  onChanged?: () => void;
  onUploadFiles?: () => void;
  initialFolderFiles?: File[];
  initialFolder?: string;
  /** The provider's name for `initialFolder`, when that is a portable alias. */
  initialFolderName?: string;
  initialDownloaded?: boolean;
  initialSourceId?: string;
  initialProviderId?: string;
  initialObsidianChoice?: ObsidianChoice;
  headerActions: HTMLDivElement | null;
  onDiscard: () => void;
  settingsView?: boolean;
  /** The frame's own title, so the detail does not repeat a source's name. */
  frameTitle?: string;
}) {
  const repository = useRepository();
  const folderReference = useSourceFolderReference(workspaceId, onSelect);
  const { settings } = useConnectionSettings();
  const localConnection = useAgentOnThisComputer();
  const collapsibleSources = !manageOnly && Boolean(onSelect || onUploadFiles);
  const queryClient = useQueryClient();
  const scope = connectionScope(settings);
  const key = ['connected-storage', scope, workspaceId];
  // Endpoint-bound selection survives closing and reopening the same workspace picker.
  const selectionKey = ['connected-storage-selection', scope, workspaceId];
  const selection = useQuery({
    queryKey: selectionKey,
    queryFn: () => '',
    initialData: '',
    staleTime: Infinity,
  });
  // Management has its own selection; a summary link can open a specific source.
  const [managedSelection, setManagedSelection] = useState(initialSourceId ?? '');
  const privateSelection = manageOnly || settingsView;
  const selectedId = privateSelection ? managedSelection : selection.data;
  const [initialFolderSourceId] = useState(selectedId);
  const select = (id: string) =>
    privateSelection ? setManagedSelection(id) : queryClient.setQueryData(selectionKey, id);
  // The connect form, and the provider it opens on. `+` opens it straight away.
  const [form, setForm] = useState<{ choice?: SourceChoiceId } | undefined>(() =>
    initialFolderFiles?.length
      ? { choice: 'upload' }
      : initialProviderId
        ? { choice: initialProviderId as SourceChoiceId }
        : connectOnly
          ? {}
          : undefined,
  );
  const [obsidianChoice, setObsidianChoice] = useState(initialObsidianChoice);
  // Attach: Choose folder offers in place or a full copy, with no size limit.
  const [folderAttach, setFolderAttach] = useState(false);
  const [accountLogin, setAccountLogin] = useState<SourceProvider>();
  const [editRequest, setEditRequest] = useState(0);
  const sources = useQuery({
    queryKey: [...key, 'sources'],
    queryFn: ({ signal }) => repository.connectedSources(workspaceId, signal),
    refetchInterval: 1500,
    retry: false,
    enabled: Boolean(workspaceId),
  });
  const providers = useQuery({
    queryKey: ['connected-storage', scope, 'accounts'],
    queryFn: ({ signal }) => repository.storageProviders(signal),
    refetchInterval: 1500,
    retry: false,
  });
  const host = useQuery({
    queryKey: ['host-storage', scope, 'local'],
    queryFn: ({ signal }) => repository.hostStorageSettings('local', signal),
    retry: false,
  });
  // Plain and stable: never the raw machine name, and not swapped once a request lands.
  // When the agent confirms it runs here, its computer is this one.
  const { agent } = vocab;
  const hostLabel = localConnection ? t`this computer` : t`${agent}'s computer`;
  const source = sources.data?.find((row) => row.id === selectedId);
  const providerFor = (row: ConnectedSourceState): SourceProvider =>
    providers.data?.providers.find((item) => item.id === row.provider) ?? {
      id: row.provider,
      name: row.label,
      logo: row.provider,
      authentication: ['google_drive', 'globus', 'github', 'ndp'].includes(row.provider)
        ? 'browser'
        : 'none',
      configured: true,
      setup_requirement: null,
      capabilities: {
        supported_modes: row.capabilities.supported_modes ?? [row.mode ?? 'read_only'],
        unavailable_reasons: Object.fromEntries(
          Object.entries(row.capabilities.unavailable_reasons ?? {}).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        ),
      },
    };
  const edit = (row: ConnectedSourceState) => {
    select(row.id);
    setEditRequest((count) => count + 1);
  };
  const removed = (id: string) => {
    queryClient.setQueryData(
      [...key, 'sources'],
      (rows: ConnectedSourceState[] | undefined) => rows?.filter((row) => row.id !== id) ?? [],
    );
    if (selectedId === id) select('');
    void queryClient.invalidateQueries({ queryKey: [...key, 'sources'] });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.key('workspace-files', settings.endpoint, workspaceId),
    });
    onChanged?.();
  };
  // A row's Edit opens its fields once the provider list has answered.
  const [pendingEdit, setPendingEdit] = useState(initialEdit);
  if (pendingEdit && source && (providers.data || providers.error)) {
    setPendingEdit(false);
    setEditRequest((count) => count + 1);
  }
  const connected = (row: ConnectedSourceState) => {
    queryClient.setQueryData([...key, 'sources'], (previous: ConnectedSourceState[] = []) => [
      ...previous.filter((item) => item.id !== row.id),
      row,
    ]);
    select(row.id);
    setForm(undefined);
    onChanged?.();
    if (row.source_kind === 'knowledge') {
      openKnowledge(connectionScope(settings), workspaceId, row);
      onDiscard();
    } else if (row.origin === 'desktop_upload' && onSelect)
      folderReference.mutate({ source: row, draftId: row.draft_id });
  };
  const toolbar = (row: ConnectedSourceState, editable = true) =>
    headerActions &&
    createPortal(
      <ConnectedSourceActions
        direct
        workspaceId={workspaceId}
        source={row}
        onEdit={editable ? () => edit(row) : undefined}
        onRemoved={() => {
          removed(row.id);
          onDiscard();
        }}
      />,
      headerActions,
    );
  if (accountLogin)
    return (
      <AccountLogin
        provider={accountLogin}
        onBack={() => setAccountLogin(undefined)}
        onComplete={() => {
          void queryClient.invalidateQueries({ queryKey: ['connected-storage', scope] });
          void queryClient.invalidateQueries({ queryKey: ['ndp-catalog', scope] });
          setAccountLogin(undefined);
        }}
      />
    );
  if (folderAttach && onSelect)
    return (
      <FolderAttachForm
        workspaceId={workspaceId}
        localConnection={localConnection}
        hostLabel={hostLabel}
        browseStartPath={host.data?.effective.root}
        onAttached={(reference) => {
          setFolderAttach(false);
          onChanged?.();
          onSelect(reference);
        }}
        onUploaded={(row) => {
          setFolderAttach(false);
          connected(row);
        }}
        onBack={() => setFolderAttach(false)}
      />
    );
  if (form)
    return (
      <ConnectedSourceForm
        workspaceId={workspaceId}
        providers={providers.data?.providers ?? []}
        initialChoice={form.choice}
        localConnection={localConnection}
        hostLabel={hostLabel}
        browseStartPath={host.data?.effective.root}
        obsidianChoice={obsidianChoice}
        uploadFiles={initialFolderFiles}
        onConnected={connected}
        onConnectedMany={(rows) => {
          queryClient.setQueryData([...key, 'sources'], (previous: ConnectedSourceState[] = []) => [
            ...previous.filter((row) => !rows.some((item) => item.id === row.id)),
            ...rows,
          ]);
          if (rows[0]) select(rows[0].id);
          setForm(undefined);
          onChanged?.();
        }}
        onSignIn={setAccountLogin}
        onBack={connectOnly ? undefined : () => setForm(undefined)}
      />
    );
  if (source)
    return (
      <>
        {toolbar(source)}
        <ConnectedSourceDetail
          key={source.id}
          workspaceId={workspaceId}
          sessionId={sessionId}
          source={source}
          provider={providers.data || providers.error ? providerFor(source) : undefined}
          browseStartPath={host.data?.effective.root}
          editRequest={editRequest}
          showName={frameTitle !== source.label}
          initialFolder={source.id === initialFolderSourceId ? initialFolder : undefined}
          initialFolderName={source.id === initialFolderSourceId ? initialFolderName : undefined}
          initialDownloaded={source.id === initialFolderSourceId ? initialDownloaded : undefined}
          manageOnly={manageOnly}
          onDownloadStarted={onDownloadStarted}
          hostLabel={hostLabel}
          onBack={() => select('')}
          onSelect={onSelect}
          onChanged={() => {
            void queryClient.invalidateQueries({ queryKey: [...key, 'sources'] });
            onChanged?.();
          }}
          onOpenKnowledge={
            source.source_kind === 'knowledge' && source.connected
              ? () => {
                  openKnowledge(connectionScope(settings), workspaceId, source);
                  onDiscard();
                }
              : undefined
          }
        />
        {folderReference.error && (
          <p role="alert" className="text-sm text-destructive">
            {connectedSourceErrorMessage(folderReference.error)}
          </p>
        )}
      </>
    );
  // Section labels are the spec's `.zg`: 11px, semibold, muted.
  const sectionLabel = 'text-caption font-semibold text-muted-foreground';
  const providerIconWidth = providers.data?.providers.some((row) =>
    sourceProviderUsesWordmark(row.id),
  )
    ? SOURCE_WORDMARK_WIDTH
    : undefined;
  return (
    <div className="space-y-4">
      <div className="flex min-h-[26px] items-center gap-1.5 text-meta text-muted-foreground">
        <span className="min-w-0 truncate">
          {localConnection
            ? t`Files are saved on this computer`
            : t`Files are saved on ${agent}'s computer`}
        </span>
        <InfoTip label={t`About connected data`}>
          {localConnection
            ? t`Downloaded files are saved on this computer. Upload copies files from your computer to this workspace. Changes to the originals are not copied automatically.`
            : t`Downloaded files are saved on ${agent}'s computer. Upload copies files from your computer to this workspace. Changes to the originals are not copied automatically.`}
        </InfoTip>
      </div>
      {(sources.error || providers.error || folderReference.error) && (
        // The spec's status line (`.c3s`): an icon and a sentence, no box.
        <p role="alert" className="flex min-h-[26px] items-center gap-2 text-meta">
          <InfoIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          {connectedSourceErrorMessage(sources.error || providers.error || folderReference.error)}
        </p>
      )}
      {!manageOnly && !settingsView && (
        <section className="space-y-2" aria-label={t`From your computer`}>
          <div>
            <h3 className={sectionLabel}>
              {localConnection ? t`From this computer` : t`Upload from your computer`}
            </h3>
            {!localConnection && (
              <p className="text-xs text-muted-foreground">
                {t`Copy files or a folder to ${agent}'s computer.`}
              </p>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {onUploadFiles && (
              <Button variant="outline" onClick={onUploadFiles}>
                <PaperclipIcon aria-hidden="true" /> {t`Choose files`}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() =>
                onSelect
                  ? setFolderAttach(true)
                  : setForm({
                      choice:
                        localConnection &&
                        providers.data?.providers.some((row) => row.id === 'local')
                          ? 'local'
                          : 'upload',
                    })
              }
            >
              <FolderUpIcon aria-hidden="true" /> {t`Choose folder`}
            </Button>
          </div>
        </section>
      )}
      {!manageOnly && Boolean(providers.data?.providers.length) && (
        <section className="space-y-2" aria-label={t`Connect a data source`}>
          <h3 className={sectionLabel}>
            {settingsView ? t`Accounts and providers` : t`From a connected source`}
          </h3>
          <div className="@container -mx-2">
            {providers.data?.providers
              .filter((row) => settingsView || !localConnection || row.id !== 'local')
              .map((row) => (
                <ItemRow
                  key={row.id}
                  className="border-b-0"
                  wrapMeta
                  icon={<SourceProviderLogo provider={row.id} size="icon" />}
                  iconWidth={providerIconWidth}
                  title={
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate">
                        {row.id !== 'local'
                          ? row.name
                          : localConnection
                            ? t`Use a folder on this computer`
                            : t`Use a folder on ${agent}'s computer`}
                      </span>
                      <SourceProviderInfo provider={row} />
                    </span>
                  }
                  meta={
                    row.id === 'obsidian' ? (
                      t`Knowledge graphs from linked notes`
                    ) : row.id === 'local' ? (
                      t`Choose data already on this machine`
                    ) : row.authentication === 'browser' ? (
                      row.authenticated ? (
                        <span className="inline-flex items-center gap-1">
                          <CheckIcon aria-hidden="true" className="size-3" /> {t`Signed in`}
                        </span>
                      ) : (
                        t`Sign in for private data`
                      )
                    ) : row.id === 'github' ? (
                      t`Public or private repository folder`
                    ) : (
                      t`Saved or new SSH host`
                    )
                  }
                  actionsVisible
                  actionsWidth={52}
                  actions={
                    row.id === 'obsidian' ? (
                      <IconButton
                        size="sm"
                        label={t`New vault`}
                        icon={<AddIcon />}
                        disabled={!workspaceId}
                        onClick={() => {
                          setObsidianChoice('new');
                          setForm({ choice: row.id });
                        }}
                      />
                    ) : row.authentication === 'browser' ? (
                      row.authenticated ? (
                        <ConnectedAccountActions provider={row} />
                      ) : (
                        <IconButton
                          size="sm"
                          label={t`Sign in to ${ph({ name: row.name })}`}
                          icon={<LogInIcon />}
                          onClick={() => setAccountLogin(row)}
                        />
                      )
                    ) : undefined
                  }
                  slotWidth={76}
                  slot={
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      disabled={!workspaceId}
                      onClick={() => {
                        setObsidianChoice('existing');
                        setForm({ choice: row.id });
                      }}
                    >
                      {t`Connect`}
                    </Button>
                  }
                />
              ))}
          </div>
        </section>
      )}
      {sources.isPending && workspaceId && !connectOnly && (
        <p role="status" className="text-sm text-muted-foreground">
          {t`Loading sources…`}
        </p>
      )}
      {connectOnly ? null : sources.data?.length ? (
        <Collapsible defaultOpen={!collapsibleSources} asChild>
          <section className="space-y-2" aria-label={t`Your connected sources`}>
            <h3 className={sectionLabel}>
              {collapsibleSources ? (
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="group h-8 w-full justify-between px-0 hover:bg-transparent"
                    aria-label={t`Your sources`}
                  >
                    <span className="flex items-center gap-2">
                      <ChevronRightIcon
                        aria-hidden="true"
                        className="size-4 transition-transform group-data-[state=open]:rotate-90"
                      />
                      {t`Your sources`}
                    </span>
                    <span className="text-xs text-muted-foreground">{sources.data.length}</span>
                  </Button>
                </CollapsibleTrigger>
              ) : (
                t`Your sources`
              )}
            </h3>
            <CollapsibleContent>
              <div className="divide-y rounded-lg border">
                {sources.data.map((row) => (
                  <div key={row.id} className="flex items-center pr-2">
                    <button
                      className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left hover:bg-muted/40 focus-visible:outline-ring"
                      onClick={() => select(row.id)}
                    >
                      <SourceProviderLogo provider={row.provider} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium" title={row.label}>
                          {row.label}
                        </span>
                        <span className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                          <span>
                            {row.linked
                              ? linkAccessNames[row.link_access ?? 'read_only']
                              : row.local_path
                                ? row.download_access === 'editable'
                                  ? t`Editable copy`
                                  : t`Read-only copy`
                                : t`Choose access when adding`}
                          </span>
                          <span>
                            {!row.connected
                              ? t`Disconnected`
                              : !row.authenticated && !row.access_without_signin
                                ? row.account_authenticated
                                  ? t`Permission needed`
                                  : t`Sign-in needed`
                                : row.linked
                                  ? t`Linked folder`
                                  : row.materialization === 'not_materialized'
                                    ? t`Ready to use`
                                    : sourceStatus(row).label}
                          </span>
                        </span>
                      </span>
                      <ArrowRightIcon aria-hidden="true" className="size-4 shrink-0" />
                    </button>
                    {onSelect &&
                      !manageOnly &&
                      (Boolean(row.local_path) ||
                        (row.linked &&
                          row.connected &&
                          (row.authenticated || row.access_without_signin))) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={t`Add ${ph({ label: row.label })} to message`}
                          disabled={folderReference.isPending}
                          onClick={() =>
                            folderReference.mutate({
                              source: row,
                              linked: Boolean(
                                row.linked &&
                                  row.connected &&
                                  (row.authenticated || row.access_without_signin),
                              ),
                            })
                          }
                        >
                          {t`Add to message`}
                        </Button>
                      )}
                    <ConnectedSourceActions
                      workspaceId={workspaceId}
                      source={row}
                      onEdit={() => edit(row)}
                      onRemoved={() => removed(row.id)}
                    />
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </section>
        </Collapsible>
      ) : !sources.isPending && !sources.error && !providers.error ? (
        settingsView ? (
          <div className="rounded-lg border px-4 py-3 text-center">
            <p className="mt-2 text-sm font-medium">{t`No saved sources in this workspace`}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t`Workspace files stay available. Connect a source for additional data.`}
            </p>
          </div>
        ) : (
          <p className="text-menu text-muted-foreground">
            <span className="font-medium text-foreground">
              {manageOnly ? t`No connected sources.` : t`Nothing connected yet.`}
            </span>{sentenceGap()}
            {manageOnly
              ? t`Add one with + in the Sources list.`
              : t`Connect a folder to browse and attach its files.`}
          </p>
        )
      ) : null}
    </div>
  );
}

/** Signing in to a provider's account, in the picker's frame with Back in the footer. */
function AccountLogin({
  provider,
  onBack,
  onComplete,
}: {
  provider: SourceProvider;
  onBack: () => void;
  onComplete: () => void;
}) {
  const footer = useSourceFrameFooter({
    start: { label: t`Back`, back: true, onClick: onBack },
  });
  return (
    <div className="flex min-w-0 flex-col gap-[13px]">
      <div className="flex min-w-0 items-center gap-2.5">
        <SourceProviderLogo provider={provider.id} />
        <h3 className="truncate text-ui font-medium">{t`Sign in to ${ph({ name: provider.name })}`}</h3>
      </div>
      <ConnectedAccountSignIn
        provider={provider.id}
        appUrl={provider.account_url}
        onComplete={onComplete}
      />
      {footer}
    </div>
  );
}
