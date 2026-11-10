import { NDPSourcePicker } from './ndp-source-picker';
import { vocab } from '@/lib/brand-vocabulary';
import { connectionScope } from '@/lib/connection-scope';
import { openKnowledge } from '@/lib/knowledge-navigation';
import { connectionIsLocal } from '@/lib/connection';
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
import { connectedSourceErrorMessage } from './connected-source-error';
import { linkAccessNames } from './connected-source-labels';
import { ConnectedSourceDetail } from './connected-source-detail';
import { SourceProviderLogo } from './source-provider-logo';
import { SourceProviderInfo } from './source-provider-info';
import type { ObsidianChoice } from './obsidian-source-form';
import { InfoTip } from './info-tip';
import { DesktopFolderUpload } from './desktop-folder-upload';
import { ConnectedSourceActions } from './connected-source-actions';
import { ConnectedAccountActions } from './connected-account-actions';
import { ConnectedAccountSignIn } from './connected-source-auth';
import { useSourceFolderReference } from './use-source-folder-reference';
import type { SourceDownloadSelection } from './source-download-selection';

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
  return (
    <DialogFrame
      open={open}
      onOpenChange={onOpenChange}
      icon={onSelect && !manageOnly ? <PaperclipIcon /> : connect ? <AddIcon /> : <DatabaseIcon />}
      title={
        title ??
        (manageOnly
          ? 'Sources'
          : onSelect
            ? 'Attach'
            : connect
              ? 'Connect a data source'
              : 'Connected data')
      }
      description={
        manageOnly || connect ? undefined : 'Choose files, folders, or a connected source.'
      }
      srDescription={
        connect
          ? `Choose a provider to bring its files or datasets into this workspace.`
          : undefined
      }
      className={connect ? 'w-[480px]' : undefined}
      titleActions={<div ref={setHeaderActions} className="flex items-center gap-0.5" />}
    >
      <div className="-mx-[18px] max-h-[min(72dvh,680px)] overflow-y-auto px-[18px] text-[12.5px]">
        {open && (
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
            initialDownloaded={initialDownloaded}
            initialSourceId={initialSourceId}
            initialProviderId={initialProviderId}
            initialObsidianChoice={initialObsidianChoice}
            headerActions={headerActions}
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
  initialDownloaded,
  initialSourceId,
  initialProviderId,
  initialObsidianChoice,
  headerActions,
  onDiscard,
  settingsView = false,
  connectOnly = false,
  initialEdit = false,
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
  initialDownloaded?: boolean;
  initialSourceId?: string;
  initialProviderId?: string;
  initialObsidianChoice?: ObsidianChoice;
  headerActions: HTMLDivElement | null;
  onDiscard: () => void;
  settingsView?: boolean;
}) {
  const repository = useRepository();
  const folderReference = useSourceFolderReference(workspaceId, onSelect);
  const { settings, isManagedConnection } = useConnectionSettings();
  const localConnection = connectionIsLocal(settings, isManagedConnection);
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
  const [provider, setProvider] = useState<SourceProvider>();
  const [providerIntent, setProviderIntent] = useState(initialProviderId);
  const [obsidianChoice, setObsidianChoice] = useState(initialObsidianChoice);
  const [accountLogin, setAccountLogin] = useState<SourceProvider>();
  const [editing, setEditing] = useState<ConnectedSourceState>();
  const [desktopUpload, setDesktopUpload] = useState(Boolean(initialFolderFiles?.length));
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
  const hostLabel = `${vocab.agent}'s computer`;
  const source = sources.data?.find((row) => row.id === selectedId);
  const edit = (row: ConnectedSourceState) => {
    setEditing(row);
    setProvider(
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
      },
    );
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
  // A row's Edit opens its form once the provider list has answered.
  const [pendingEdit, setPendingEdit] = useState(initialEdit);
  if (pendingEdit && source && (providers.data || providers.error)) {
    setPendingEdit(false);
    edit(source);
  }
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
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => setAccountLogin(undefined)}>
          Back
        </Button>
        <div className="flex items-center gap-3">
          <SourceProviderLogo provider={accountLogin.id} />
          <h3 className="font-medium">Sign in to {accountLogin.name}</h3>
        </div>
        <ConnectedAccountSignIn
          provider={accountLogin.id}
          appUrl={accountLogin.account_url}
          onComplete={() => {
            void queryClient.invalidateQueries({ queryKey: ['connected-storage', scope] });
            setAccountLogin(undefined);
          }}
        />
      </div>
    );
  if (desktopUpload)
    return (
      <DesktopFolderUpload
        initialFiles={initialFolderFiles}
        workspaceId={workspaceId}
        hostLabel={hostLabel}
        onBack={() => setDesktopUpload(false)}
        onComplete={(connected) => {
          queryClient.setQueryData(
            [...key, 'sources'],
            [...(sources.data ?? []).filter((row) => row.id !== connected.id), connected],
          );
          select(connected.id);
          setDesktopUpload(false);
          onChanged?.();
          if (onSelect) folderReference.mutate({ source: connected, draftId: connected.draft_id });
        }}
      />
    );
  const activeProvider =
    provider?.id === 'ndp'
      ? (providers.data?.providers.find((row) => row.id === 'ndp') ?? provider)
      : (provider ?? providers.data?.providers.find((row) => row.id === providerIntent));
  if (activeProvider?.id === 'ndp' && !editing)
    return (
      <NDPSourcePicker
        workspaceId={workspaceId}
        provider={activeProvider}
        onConnected={(connected) => {
          queryClient.setQueryData([...key, 'sources'], (previous: ConnectedSourceState[] = []) => [
            ...previous.filter((row) => !connected.some((item) => item.id === row.id)),
            ...connected,
          ]);
          if (connected[0]) select(connected[0].id);
          setProvider(undefined);
          setProviderIntent(undefined);
          onChanged?.();
        }}
        onBack={() => {
          setProvider(undefined);
          setProviderIntent(undefined);
        }}
      />
    );
  if (activeProvider)
    return (
      <>
        {editing && toolbar(editing, false)}
        <ConnectedSourceForm
          workspaceId={workspaceId}
          provider={activeProvider}
          obsidianChoice={obsidianChoice}
          source={editing}
          hostLabel={hostLabel}
          browseStartPath={host.data?.effective.root}
          onBack={() => {
            setProvider(undefined);
            setProviderIntent(undefined);
            setEditing(undefined);
          }}
          onConnected={(connected) => {
            queryClient.setQueryData(
              [...key, 'sources'],
              [...(sources.data ?? []).filter((row) => row.id !== connected.id), connected],
            );
            select(connected.id);
            setProvider(undefined);
            setProviderIntent(undefined);
            setEditing(undefined);
            onChanged?.();
            if (connected.source_kind === 'knowledge') {
              openKnowledge(connectionScope(settings), workspaceId, connected);
              onDiscard();
            }
          }}
        />
      </>
    );
  if (source)
    return (
      <>
        {toolbar(source)}
        {source.source_kind === 'knowledge' && source.connected && (
          <Button
            onClick={() => {
              openKnowledge(connectionScope(settings), workspaceId, source);
              onDiscard();
            }}
          >
            Open knowledge
          </Button>
        )}
        <ConnectedSourceDetail
          key={source.id}
          workspaceId={workspaceId}
          sessionId={sessionId}
          source={source}
          initialFolder={source.id === initialFolderSourceId ? initialFolder : undefined}
          initialDownloaded={source.id === initialFolderSourceId ? initialDownloaded : undefined}
          manageOnly={manageOnly}
          onDownloadStarted={onDownloadStarted}
          hostLabel={hostLabel}
          onBack={() => select('')}
          onSelect={onSelect}
          onChanged={() => onChanged?.()}
        />
        {folderReference.error && (
          <p role="alert" className="text-sm text-destructive">
            {connectedSourceErrorMessage(folderReference.error)}
          </p>
        )}
      </>
    );
  // Section labels are the spec's `.zg`: 11px, semibold, muted.
  const sectionLabel = 'text-[11px] font-semibold text-muted-foreground';
  return (
    <div className="space-y-4">
      <div className="flex min-h-[26px] items-center gap-1.5 text-[12px] text-muted-foreground">
        <span className="min-w-0 truncate">Files are saved on {hostLabel}</span>
        <InfoTip label="About connected data">
          Downloaded files are saved on {hostLabel}. Upload copies files from your computer to this
          workspace. Changes to the originals are not copied automatically.
        </InfoTip>
      </div>
      {(sources.error || providers.error || folderReference.error) && (
        // The spec's status line (`.c3s`): an icon and a sentence, no box.
        <p role="alert" className="flex min-h-[26px] items-center gap-2 text-[12px]">
          <InfoIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          {connectedSourceErrorMessage(sources.error || providers.error || folderReference.error)}
        </p>
      )}
      {!manageOnly && !settingsView && (
        <section className="space-y-2" aria-label="From your computer">
          <div>
            <h3 className={sectionLabel}>
              {localConnection ? 'From this computer' : 'Upload from your computer'}
            </h3>
            {!localConnection && (
              <p className="text-xs text-muted-foreground">
                Copy files or a folder to {hostLabel}.
              </p>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {onUploadFiles && (
              <Button variant="outline" onClick={onUploadFiles}>
                <PaperclipIcon aria-hidden="true" /> Choose files
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => {
                const local = providers.data?.providers.find((row) => row.id === 'local');
                if (localConnection && local) setProvider(local);
                else setDesktopUpload(true);
              }}
            >
              <FolderUpIcon aria-hidden="true" /> Choose folder
            </Button>
          </div>
        </section>
      )}
      {!manageOnly && Boolean(providers.data?.providers.length) && (
        <section className="space-y-2" aria-label="Connect a data source">
          <h3 className={sectionLabel}>
            {settingsView ? 'Accounts and providers' : 'From a connected source'}
          </h3>
          <div className="@container -mx-2">
            {providers.data?.providers
              .filter((row) => settingsView || !localConnection || row.id !== 'local')
              .map((row) => (
                <ItemRow
                  key={row.id}
                  className="border-b-0"
                  icon={<SourceProviderLogo provider={row.id} size="icon" />}
                  title={
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate">
                        {row.id === 'local' ? `Use a folder on ${hostLabel}` : row.name}
                      </span>
                      <SourceProviderInfo provider={row} />
                    </span>
                  }
                  meta={
                    row.id === 'obsidian' ? (
                      'Knowledge graphs from linked notes'
                    ) : row.id === 'local' ? (
                      'Choose data already on this machine'
                    ) : row.authentication === 'browser' ? (
                      row.authenticated ? (
                        <span className="inline-flex items-center gap-1">
                          <CheckIcon aria-hidden="true" className="size-3" /> Signed in
                        </span>
                      ) : (
                        'Sign in for private data'
                      )
                    ) : row.id === 'github' ? (
                      'Public or private repository folder'
                    ) : (
                      'Saved or new SSH host'
                    )
                  }
                  actionsVisible
                  actionsWidth={52}
                  actions={
                    row.id === 'obsidian' ? (
                      <IconButton
                        size="sm"
                        label="New vault"
                        icon={<AddIcon />}
                        disabled={!workspaceId}
                        onClick={() => {
                          setObsidianChoice('new');
                          setProvider(row);
                        }}
                      />
                    ) : row.authentication === 'browser' ? (
                      row.authenticated ? (
                        <ConnectedAccountActions provider={row} />
                      ) : (
                        <IconButton
                          size="sm"
                          label={`Sign in to ${row.name}`}
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
                        setProvider(row);
                      }}
                    >
                      Connect
                    </Button>
                  }
                />
              ))}
          </div>
        </section>
      )}
      {sources.isPending && workspaceId && !connectOnly && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading sources…
        </p>
      )}
      {connectOnly ? null : sources.data?.length ? (
        <Collapsible defaultOpen={!collapsibleSources} asChild>
          <section className="space-y-2" aria-label="Your connected sources">
            <h3 className={sectionLabel}>
              {collapsibleSources ? (
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="group h-8 w-full justify-between px-0 hover:bg-transparent"
                    aria-label="Your sources"
                  >
                    <span className="flex items-center gap-2">
                      <ChevronRightIcon
                        aria-hidden="true"
                        className="size-4 transition-transform group-data-[state=open]:rotate-90"
                      />
                      Your sources
                    </span>
                    <span className="text-xs text-muted-foreground">{sources.data.length}</span>
                  </Button>
                </CollapsibleTrigger>
              ) : (
                'Your sources'
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
                                  ? 'Editable copy'
                                  : 'Read-only copy'
                                : 'Choose access when adding'}
                          </span>
                          <span>
                            {!row.connected
                              ? 'Disconnected'
                              : !row.authenticated && !row.access_without_signin
                                ? row.account_authenticated
                                  ? 'Permission needed'
                                  : 'Sign-in needed'
                                : row.linked
                                  ? 'Linked folder'
                                  : row.materialization === 'not_materialized'
                                    ? 'Ready to use'
                                    : row.materialization?.replaceAll('_', ' ')}
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
                          aria-label={`Add ${row.label} to message`}
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
                          Add to message
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
            <p className="mt-2 text-sm font-medium">No saved sources in this workspace</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Workspace files stay available. Connect a source for additional data.
            </p>
          </div>
        ) : (
          <p className="text-[12.5px] text-muted-foreground">
            <span className="font-medium text-foreground">
              {manageOnly ? 'No connected sources.' : 'Nothing connected yet.'}
            </span>{' '}
            {manageOnly
              ? 'Add one with + in the Sources list.'
              : 'Connect a folder to browse and attach its files.'}
          </p>
        )
      ) : null}
    </div>
  );
}
