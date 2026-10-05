import { vocab } from '@/lib/brand-vocabulary';
import { connectionScope } from '@/lib/connection-scope';
import { connectionIsLocal } from '@/lib/connection';
import { queryKeys } from '@/lib/query-keys';
import type { ConnectedSourceState, SourceProvider, WorkspaceReference } from '@clio/core/v3';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from '@/lib/icon-vocabulary';
import {
  ArrowRightIcon,
  CheckIcon,
  ChevronRightIcon,
  DatabaseIcon,
  FolderUpIcon,
  PaperclipIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ConnectedSourceForm } from './connected-source-form';
import { linkAccessNames } from './connected-source-labels';
import { ConnectedSourceDetail } from './connected-source-detail';
import { SourceProviderLogo } from './source-provider-logo';
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
  open,
  onOpenChange,
  onSelect,
  onChanged,
  onUploadFiles,
  initialFolderFiles,
  initialFolder,
  initialDownloaded,
  manageOnly = false,
  onDownloadStarted,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect?: (reference: WorkspaceReference) => void;
  onChanged?: () => void;
  onUploadFiles?: () => void;
  initialFolderFiles?: File[];
  initialFolder?: string;
  initialDownloaded?: boolean;
  manageOnly?: boolean;
  onDownloadStarted?: (
    source: ConnectedSourceState,
    operationId: string,
    selection?: SourceDownloadSelection,
  ) => void;
}) {
  const { settings } = useConnectionSettings();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [headerActions, setHeaderActions] = useState<HTMLDivElement | null>(null);
  const scope = `${connectionScope(settings)}:${workspaceId}`;
  const activeScope = useRef(scope);
  useLayoutEffect(() => {
    activeScope.current = scope;
    return () => {
      activeScope.current = '';
    };
  }, [scope]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[88dvh] flex-col overflow-hidden sm:max-w-2xl"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          titleRef.current?.focus();
        }}
      >
        <DialogHeader className="shrink-0">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle ref={titleRef} tabIndex={-1} className="outline-none">
              {manageOnly ? 'Sources' : onSelect ? 'Attach' : 'Connected data'}
            </DialogTitle>
            <div className="flex items-center gap-1">
              <div ref={setHeaderActions} className="flex items-center gap-1" />
              <DialogClose asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Close and keep setup"
                  title="Close and keep setup"
                >
                  <CloseIcon aria-hidden="true" />
                </Button>
              </DialogClose>
            </div>
          </div>
          <DialogDescription>
            {manageOnly
              ? 'Manage existing sources. Use Attach in the message box to add data for the agent.'
              : 'Choose files, folders, or a connected source.'}
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-4 min-h-0 overflow-y-auto px-4">
          {open && (
            <PickerContents
              key={scope}
              workspaceId={workspaceId}
              manageOnly={manageOnly}
              onDownloadStarted={onDownloadStarted}
              onUploadFiles={onUploadFiles}
              initialFolderFiles={initialFolderFiles}
              initialFolder={initialFolder}
              initialDownloaded={initialDownloaded}
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
      </DialogContent>
    </Dialog>
  );
}

function PickerContents({
  workspaceId,
  manageOnly,
  onDownloadStarted,
  onSelect,
  onChanged,
  onUploadFiles,
  initialFolderFiles,
  initialFolder,
  initialDownloaded,
  headerActions,
  onDiscard,
}: {
  workspaceId: string;
  manageOnly: boolean;
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
  headerActions: HTMLDivElement | null;
  onDiscard: () => void;
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
  // Files always starts at the list; it never consumes or changes the composer's selection.
  const [managedSelection, setManagedSelection] = useState('');
  const selectedId = manageOnly ? managedSelection : selection.data;
  const [initialSourceId] = useState(selectedId);
  const select = (id: string) =>
    manageOnly ? setManagedSelection(id) : queryClient.setQueryData(selectionKey, id);
  const [provider, setProvider] = useState<SourceProvider>();
  const [accountLogin, setAccountLogin] = useState<SourceProvider>();
  const [editing, setEditing] = useState<ConnectedSourceState>();
  const [desktopUpload, setDesktopUpload] = useState(Boolean(initialFolderFiles?.length));
  const sources = useQuery({
    queryKey: [...key, 'sources'],
    queryFn: ({ signal }) => repository.connectedSources(workspaceId, signal),
    refetchInterval: 1500,
    retry: false,
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
  const hostLabel = host.data?.hostname || `the connected ${vocab.agent}`;
  const source = sources.data?.find((row) => row.id === selectedId);
  const edit = (row: ConnectedSourceState) => {
    setEditing(row);
    setProvider(
      providers.data?.providers.find((item) => item.id === row.provider) ?? {
        id: row.provider,
        name: row.label,
        logo: row.provider,
        authentication: ['google_drive', 'globus', 'github'].includes(row.provider)
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
  if (provider)
    return (
      <>
        {editing && toolbar(editing, false)}
        <ConnectedSourceForm
          workspaceId={workspaceId}
          provider={provider}
          source={editing}
          hostLabel={hostLabel}
          browseStartPath={host.data?.effective.root}
          onBack={() => {
            setProvider(undefined);
            setEditing(undefined);
          }}
          onConnected={(connected) => {
            queryClient.setQueryData(
              [...key, 'sources'],
              [...(sources.data ?? []).filter((row) => row.id !== connected.id), connected],
            );
            select(connected.id);
            setProvider(undefined);
            setEditing(undefined);
            onChanged?.();
          }}
        />
      </>
    );
  if (source)
    return (
      <>
        {toolbar(source)}
        <ConnectedSourceDetail
          key={source.id}
          workspaceId={workspaceId}
          source={source}
          initialFolder={source.id === initialSourceId ? initialFolder : undefined}
          initialDownloaded={source.id === initialSourceId ? initialDownloaded : undefined}
          manageOnly={manageOnly}
          onDownloadStarted={onDownloadStarted}
          hostLabel={hostLabel}
          onBack={() => select('')}
          onSelect={onSelect}
          onChanged={() => onChanged?.()}
        />
        {folderReference.error && (
          <p role="alert" className="text-sm text-destructive">
            {folderReference.error.message}
          </p>
        )}
      </>
    );
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <DatabaseIcon aria-hidden="true" className="size-4" />
        <span className="min-w-0 truncate">{hostLabel}</span>
        <InfoTip label="About connected data">
          Downloaded files are saved on {hostLabel}. Upload copies files from your computer to this
          workspace. Changes to the originals are not copied automatically.
        </InfoTip>
      </div>
      {(sources.error || providers.error || folderReference.error) && (
        <p role="alert" className="text-sm text-destructive">
          {(sources.error || providers.error || folderReference.error)?.message}
        </p>
      )}
      {!manageOnly && (
        <section className="space-y-2" aria-label="From your computer">
          <div>
            <h3 className="text-sm font-medium">
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
      {!manageOnly && (
        <section className="space-y-2" aria-label="Connect a data source">
          <h3 className="text-sm font-medium">From a connected source</h3>
          <div className="divide-y rounded-lg border">
            {providers.data?.providers
              .filter((row) => !localConnection || row.id !== 'local')
              .map((row) => (
                <div key={row.id} className="flex flex-wrap items-center gap-3 p-3">
                  <div className="flex min-w-48 flex-1 items-center gap-3">
                    <SourceProviderLogo provider={row.id} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {row.id === 'local' ? `Use a folder on ${hostLabel}` : row.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.id === 'local' ? (
                          'Choose data already on this machine'
                        ) : row.authentication === 'browser' ? (
                          row.authenticated ? (
                            <span className="inline-flex items-center gap-1">
                              <CheckIcon aria-hidden="true" className="size-3" /> Signed in
                            </span>
                          ) : (
                            'Browser sign in'
                          )
                        ) : row.id === 'github' ? (
                          'Public or private repository folder'
                        ) : (
                          'Saved or new SSH host'
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
                    {row.authentication === 'browser' &&
                      (row.authenticated ? (
                        <ConnectedAccountActions provider={row} />
                      ) : (
                        <TooltipProvider delayDuration={150}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                aria-label={`Sign in to ${row.name}`}
                                onClick={() => setAccountLogin(row)}
                              >
                                Sign in
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Sign in to access private data.</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ))}
                    <Button size="sm" variant="outline" onClick={() => setProvider(row)}>
                      Connect
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        </section>
      )}
      {sources.isPending && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading sources…
        </p>
      )}
      {sources.data?.length ? (
        <Collapsible defaultOpen={!collapsibleSources} asChild>
          <section className="space-y-2" aria-label="Your connected sources">
            <h3 className="text-sm font-medium">
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
                        <span className="block truncate text-sm font-medium">{row.label}</span>
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
      ) : !sources.isPending && !sources.error ? (
        <div className="rounded-lg border border-dashed px-4 py-6 text-center">
          <FolderEmpty />
          <p className="mt-2 text-sm font-medium">
            {manageOnly ? 'No connected sources' : 'Bring your data into this workspace'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {manageOnly
              ? 'Use Attach in the message box to add a folder or source.'
              : 'Connect a folder to browse and attach its files.'}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function FolderEmpty() {
  return <DatabaseIcon aria-hidden="true" className="mx-auto size-6 text-muted-foreground" />;
}
