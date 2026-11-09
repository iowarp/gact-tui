import { ConnectedSourcePicker } from './connected-source-picker';
import type { Artifact, WorkspaceFileEntry } from '@clio/core/v3';
import { useQueryClient } from '@tanstack/react-query';
import {
  BoxIcon,
  DatabaseIcon,
  FileTextIcon,
  FolderIcon,
  ListFilterIcon,
  SearchIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { IconButton } from './primitives/icon-button';
import { RefreshAction } from './refresh-button';
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppearancePreferences } from '@/providers/appearance-provider';
import { cn } from '@/lib/utils';
import { ClioArtifactCard } from './artifact-card';
import { ArtifactFilters } from './artifact-filters';
import { WorkspaceFileView } from './resource-viewers';
import { FileSearchPassage } from './file-search-passage';
import type { FileSearchLocation } from '@/lib/search-matches';
import { WorkspaceDirectoryTree } from './workspace-directory-tree';
import { ResourceLoading } from './resource-states';
import { WorkbenchFileTree } from './workbench-file-tree';
import { buildFileTree } from './workbench-file-tree-model';

const ArtifactView = lazy(() =>
  import('./resource-viewers').then((module) => ({ default: module.ArtifactView })),
);
export { CanvasLauncher, type CanvasResourceKind } from './canvas-launcher';

interface FileBrowserProps {
  directory?: string;
  onClearDirectory?: () => void;
  workspaceId: string;
  sessionId?: string;
  files: readonly WorkspaceFileEntry[];
  filesPending?: boolean;
  filesFetching?: boolean;
  filesError?: string;
  filesTruncated?: boolean;
  filesNextOffset?: number | null;
  selectedPath?: string;
  searchLocation?: FileSearchLocation;
  /** HDF5 only: the object the viewer opens on. */
  locator?: string;
  onRefresh?: () => void;
  onSelectedPathChange?: (path: string) => void;
  /**
   * `split` shows the tree beside the selected file; `tree` is the workbench
   * list column (picking a file opens it as a tab); `preview` is that tab.
   */
  mode?: 'split' | 'tree' | 'preview';
  /** Paths this conversation changed; their rows are teal and say so. */
  changedPaths?: ReadonlySet<string>;
  /**
   * `tree` only: the list column's header, which takes the search, filter and
   * refresh icons in place of a toolbar row.
   */
  renderHeader?: (actions: ReactNode) => ReactNode;
}

interface ArtifactBrowserProps {
  workspaceId: string;
  files: readonly WorkspaceFileEntry[];
  artifacts: readonly Artifact[];
  artifactsPending?: boolean;
  artifactsError?: string;
  artifactsTruncated?: 'page_cap_reached' | 'cursor_cycle_detected';
  defaultSplit?: boolean;
  onReplaceArtifact: (artifact: Artifact) => void;
  /** The conversation the canvas belongs to (a stream's view watches it for this session). */
  sessionId?: string;
}

/** Keeps the workspace tree and the selected rendered file in one navigable canvas. */
export function FileBrowser({
  directory,
  onClearDirectory,
  sessionId,
  workspaceId,
  files,
  filesPending,
  filesFetching,
  filesError,
  filesTruncated,
  filesNextOffset,
  selectedPath,
  searchLocation,
  locator,
  onRefresh,
  onSelectedPathChange,
  mode = 'split',
  changedPaths,
  renderHeader,
}: FileBrowserProps) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const queryClient = useQueryClient();
  const hostRef = useRef<HTMLDivElement>(null);
  const [stacked, setStacked] = useState(false);
  const [query, setQuery] = useState('');
  const [internalSelectedPath, setInternalSelectedPath] = useState<string>();
  // This component only exists in the DOM while its tab is the active one
  // (Tabs/TabsContent unmount inactive panels) -- a mount-only effect IS
  // "opening the Files tab or panel" (owner spec), so fire an async refetch
  // then, with no blocking spinner (`isFetching` drives the button's spin,
  // not `isPending`/a full reload). A ref keeps the callback fresh without
  // making its identity part of the effect's dependencies.
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  });
  useEffect(() => {
    if (mode !== 'preview') onRefreshRef.current?.();
    // Mount-only by design (see above); one mount never changes its mode.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The "Hide dot files and folders" preference is sent to the SERVER as
  // include_hidden (use-workspace-data.ts) so a huge .clio never spends the
  // shared entry cap only to be discarded client-side — `files` here already
  // reflects the toggle. Read only for the empty-state hint below.
  const { hideDotFiles, setHideDotFiles } = useAppearancePreferences();
  const headed = mode === 'tree' && renderHeader !== undefined;
  const [searching, setSearching] = useState(false);
  const closeSearch = () => {
    setSearching(false);
    setQuery('');
  };
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredFiles = useMemo(
    () =>
      normalizedQuery
        ? files.filter(
            (entry) =>
              entry.type === 'file' &&
              `${entry.display_path ?? ''} ${entry.path}`
                .replace(/\\/gu, '/')
                .toLocaleLowerCase()
                .includes(normalizedQuery),
          )
        : files,
    [files, normalizedQuery],
  );
  const fileTree = useMemo(() => buildFileTree(filteredFiles), [filteredFiles]);
  const activePath = selectedPath ?? internalSelectedPath;
  const activeFile =
    directory === undefined
      ? files.find((entry) => entry.type === 'file' && entry.path === activePath)
      : undefined;
  const previewPath = activeFile?.path ?? activePath;
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => setStacked(host.clientWidth < 480);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const selectFile = (path: string) => {
    setInternalSelectedPath(path);
    onSelectedPathChange?.(path);
  };

  const filterLabel = filesNextOffset !== undefined ? 'Filter loaded files' : 'Filter files';
  const refreshFiles = async () => {
    onRefresh?.();
    await queryClient.invalidateQueries({ queryKey: ['workspace-directory'] });
  };
  const headerActions = headed ? (
    <>
      <IconButton
        aria-pressed={searching}
        icon={<SearchIcon />}
        label={searching ? 'Close search' : 'Search files'}
        onClick={() => (searching ? closeSearch() : setSearching(true))}
        size="sm"
        tooltipSide="bottom"
      />
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <IconButton
            aria-pressed={!hideDotFiles}
            icon={<ListFilterIcon />}
            label="Filter files"
            size="sm"
            tooltipSide="bottom"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>Show</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={!hideDotFiles}
            onCheckedChange={(checked) => setHideDotFiles(!checked)}
            onSelect={(event) => event.preventDefault()}
          >
            Dot files and folders
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setSourcesOpen(true)}>
            <DatabaseIcon />
            Manage sources…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <RefreshAction
        label="Refresh files"
        refreshing={Boolean(filesFetching)}
        onRefresh={refreshFiles}
      />
    </>
  ) : null;

  const treeSection = (
    <section aria-label="Workspace file tree" className="flex h-full min-h-0 flex-col">
      {headed ? renderHeader(headerActions) : null}
      {directory ? (
        <div className="flex min-w-0 items-center gap-2 border-b px-2 py-1.5 text-xs">
          <Button size="xs" variant="ghost" onClick={onClearDirectory}>
            All folders
          </Button>
          <span className="truncate" title={directory}>
            {directory}
          </span>
        </div>
      ) : null}
      {headed ? (
        searching ? (
          <div className="flex h-9 shrink-0 items-center border-b border-border px-1.5">
            <Input
              aria-label={filterLabel}
              autoFocus
              className="h-7 text-xs"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  closeSearch();
                }
              }}
              placeholder={filterLabel}
              value={query}
            />
          </div>
        ) : null
      ) : (
        <div
          className={cn(
            'flex shrink-0 items-center gap-1.5 border-b',
            mode === 'tree' ? 'px-2 py-1.5' : 'p-2',
          )}
        >
          {mode === 'tree' ? (
            <IconButton
              icon={<DatabaseIcon />}
              label="Sources"
              onClick={() => setSourcesOpen(true)}
              size="sm"
            />
          ) : (
            <Button size="sm" variant="outline" onClick={() => setSourcesOpen(true)}>
              Sources
            </Button>
          )}
          <div className="relative min-w-0 flex-1">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label={
                filesNextOffset !== undefined ? 'Filter loaded files' : 'Filter workspace files'
              }
              className={cn('pl-8 text-xs', mode === 'tree' ? 'h-7' : 'h-8')}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={filesNextOffset !== undefined ? 'Filter loaded files' : 'Filter files'}
              value={query}
            />
          </div>
          <RefreshAction
            label="Refresh files"
            refreshing={Boolean(filesFetching)}
            onRefresh={refreshFiles}
          />
        </div>
      )}
      {filesTruncated && filesNextOffset === undefined ? (
        <Alert className="mx-2 mt-2 shrink-0 py-1.5 text-xs">
          <TriangleAlertIcon className="size-3.5" />
          <AlertDescription className="text-xs">
            This list is truncated — the workspace has more files than can be shown at once.
          </AlertDescription>
        </Alert>
      ) : null}
      <ScrollArea className="min-h-0 flex-1 p-2">
        {directory !== undefined || filesNextOffset !== undefined ? (
          <WorkspaceDirectoryTree
            directory={directory}
            workspaceId={workspaceId}
            root={
              directory !== undefined
                ? undefined
                : {
                    entries: [...files],
                    truncated: filesTruncated ?? false,
                    next_offset: filesNextOffset,
                  }
            }
            selectedPath={activePath}
            onSelect={selectFile}
            filter={normalizedQuery}
          />
        ) : filesPending ? (
          <LoadingRows label="Loading workspace files" />
        ) : files.length ? (
          filteredFiles.length ? (
            <WorkbenchFileTree
              changedPaths={changedPaths}
              nodes={fileTree}
              onSelect={selectFile}
              selectedPath={activePath}
            />
          ) : (
            <Unavailable icon={SearchIcon} label="No files match this filter" />
          )
        ) : (
          <Unavailable
            detail={
              filesError ??
              (hideDotFiles
                ? 'The workspace contains no visible files. "Hide dot files and folders" is on in Settings > Appearance — turn it off to check for hidden ones.'
                : 'The workspace contains no visible files.')
            }
            icon={FolderIcon}
            label={filesError ? 'File tree unavailable' : 'No workspace files'}
          />
        )}
      </ScrollArea>
    </section>
  );
  const previewSection = (
    <section aria-label="Workspace file preview" className="h-full min-h-0 overflow-hidden">
      {previewPath && searchLocation && previewPath === selectedPath ? (
        <FileSearchPassage workspaceId={workspaceId} path={previewPath} location={searchLocation} />
      ) : previewPath ? (
        <Suspense fallback={<ResourceLoading label="Loading file" />}>
          <WorkspaceFileView
            key={previewPath}
            locator={previewPath === selectedPath ? locator : undefined}
            mediaType={activeFile?.media_type}
            path={previewPath}
            size={activeFile?.size}
            workspaceId={workspaceId}
          />
        </Suspense>
      ) : (
        <div className="grid h-full place-items-center p-4">
          <Unavailable
            detail="Choose a file from the workspace tree to inspect it here."
            icon={FileTextIcon}
            label="Select a file"
          />
        </div>
      )}
    </section>
  );
  const sourcePicker = (
    <ConnectedSourcePicker
      manageOnly
      workspaceId={workspaceId}
      sessionId={sessionId}
      open={sourcesOpen}
      onOpenChange={setSourcesOpen}
      onChanged={onRefresh}
    />
  );

  if (mode === 'preview') return previewSection;
  if (mode === 'tree')
    return (
      <div className="h-full min-h-0" ref={hostRef}>
        {sourcePicker}
        {treeSection}
      </div>
    );
  return (
    <div className="h-full min-h-0" ref={hostRef}>
      {sourcePicker}
      <ResizablePanelGroup orientation={stacked ? 'vertical' : 'horizontal'}>
        <ResizablePanel
          defaultSize={stacked ? '42%' : '24%'}
          id="workspace-file-tree"
          minSize={stacked ? '140px' : '190px'}
        >
          {treeSection}
        </ResizablePanel>
        <ResizableHandle aria-label="Resize file tree" withHandle />
        <ResizablePanel id="workspace-file-preview" minSize={stacked ? '180px' : '240px'}>
          {previewSection}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

/** Presents the authoritative session artifact picker for the current canvas tab. */
export function ArtifactBrowser({
  workspaceId,
  files,
  artifacts,
  artifactsPending,
  artifactsError,
  artifactsTruncated,
  defaultSplit = false,
  onReplaceArtifact,
  sessionId,
}: ArtifactBrowserProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [stacked, setStacked] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const splitArtifact =
    artifacts.find((artifact) => artifact.id === selectedId) ??
    (defaultSplit ? artifacts[0] : undefined);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => setStacked(host.clientWidth < 440);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const openArtifact = (
    artifact: Artifact,
    event: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>,
  ) => {
    if (defaultSplit || selectedId || event.shiftKey) setSelectedId(artifact.id);
    else onReplaceArtifact(artifact);
  };
  const artifactList = (
    <ScrollArea className="h-full p-2">
      <div className="grid gap-2">
        {artifactsPending ? <LoadingRows label="Loading session artifacts" /> : null}
        <ArtifactFilters artifacts={artifacts}>
          {(visible) =>
            visible.map((artifact) => (
              <ClioArtifactCard
                artifact={artifact}
                className={cn(
                  'shadow-none',
                  splitArtifact?.id === artifact.id && 'border-primary bg-primary/5',
                )}
                key={artifact.id}
                onOpen={openArtifact}
                preview={false}
              />
            ))
          }
        </ArtifactFilters>
        {!artifactsPending && !artifacts.length ? (
          <Unavailable
            detail={artifactsError}
            icon={BoxIcon}
            label={artifactsError ? 'Artifacts unavailable' : 'No session artifacts'}
          />
        ) : null}
        {artifactsTruncated ? (
          <p className="px-2 py-1 text-xs text-warning">
            The service returned a partial artifact registry.
          </p>
        ) : null}
      </div>
    </ScrollArea>
  );

  return (
    <section aria-label="Session artifact list" className="h-full min-h-0" ref={hostRef}>
      {splitArtifact ? (
        <ResizablePanelGroup orientation={stacked ? 'vertical' : 'horizontal'}>
          <ResizablePanel
            defaultSize={stacked ? '36%' : '34%'}
            id="session-artifact-list"
            minSize={stacked ? '140px' : '160px'}
          >
            {artifactList}
          </ResizablePanel>
          <ResizableHandle aria-label="Resize artifact list" withHandle />
          <ResizablePanel id="session-artifact-preview" minSize={stacked ? '220px' : '230px'}>
            <section aria-label="Selected artifact" className="h-full min-h-0 overflow-hidden">
              <Suspense fallback={<ResourceLoading label="Loading artifact" />}>
                <ArtifactView
                  artifact={splitArtifact}
                  files={files}
                  sessionId={sessionId}
                  onOpenArtifact={(artifact) => setSelectedId(artifact.id)}
                  workspaceId={splitArtifact.workspace_id ?? workspaceId}
                />
              </Suspense>
            </section>
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        artifactList
      )}
    </section>
  );
}

function LoadingRows({ label, className }: { label: string; className?: string }) {
  return (
    <div aria-label={label} className={cn('grid gap-2', className)}>
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-4/5" />
      <Skeleton className="h-8 w-11/12" />
    </div>
  );
}

function Unavailable({
  label,
  detail,
  icon: Icon,
}: {
  label: string;
  detail?: string;
  icon: typeof FolderIcon;
}) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{label}</EmptyTitle>
        {detail ? <EmptyDescription>{detail}</EmptyDescription> : null}
      </EmptyHeader>
    </Empty>
  );
}
