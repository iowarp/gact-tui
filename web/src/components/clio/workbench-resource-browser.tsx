import { queryKeys } from '@/lib/query-keys';
import type {
  AgentBlueprint,
  AgentBlueprintReference,
  Artifact,
  WorkspaceFileEntry,
} from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import {
  ActivityIcon,
  BoxIcon,
  BoxesIcon,
  FileTextIcon,
  FolderIcon,
  PlusIcon,
  SearchIcon,
} from 'lucide-react';
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { FileTree, FileTreeFile, FileTreeFolder } from '@/components/ai-elements/file-tree';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { useRepository } from '@/hooks/use-repository';
import { cn } from '@/lib/utils';
import { ClioArtifactCard } from './artifact-card';
import { ClioInteractiveRow } from './interactive-row';
import { ClioStatus } from './status';

const ArtifactView = lazy(() =>
  import('./resource-viewers').then((module) => ({ default: module.ArtifactView })),
);
const BlueprintFileEditor = lazy(() =>
  import('./resource-viewers').then((module) => ({ default: module.BlueprintFileEditor })),
);
const WorkspaceFileView = lazy(() =>
  import('./resource-viewers').then((module) => ({ default: module.WorkspaceFileView })),
);

export type CanvasResourceKind = 'session' | 'files' | 'artifacts' | 'blueprints';

interface FileBrowserProps {
  workspaceId: string;
  files: readonly WorkspaceFileEntry[];
  filesPending?: boolean;
  filesError?: string;
  selectedPath?: string;
  onSelectedPathChange?: (path: string) => void;
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
}

interface BlueprintBrowserProps {
  blueprints: readonly AgentBlueprint[];
  blueprintsPending?: boolean;
  blueprintsError?: string;
  onOpenBlueprint: (
    blueprint: AgentBlueprint,
    event: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>,
  ) => void;
}

/** Opens one peer canvas tab instead of nesting unrelated resource types. */
export function CanvasLauncher({ onOpen }: { onOpen: (kind: CanvasResourceKind) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Open a canvas tab"
          className="size-9 shrink-0 rounded-lg"
          size="icon"
          title="Open a canvas tab"
          variant="ghost"
        >
          <PlusIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Add to canvas</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onOpen('session')}>
          <ActivityIcon aria-hidden="true" /> Observability
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onOpen('files')}>
          <FolderIcon aria-hidden="true" /> File explorer
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onOpen('artifacts')}>
          <BoxIcon aria-hidden="true" /> Session artifacts
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onOpen('blueprints')}>
          <BoxesIcon aria-hidden="true" /> Agent blueprints
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          Terminal
          <span className="ml-auto text-[10px] text-muted-foreground">Unavailable</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Keeps the workspace tree and the selected rendered file in one navigable canvas. */
export function FileBrowser({
  workspaceId,
  files,
  filesPending,
  filesError,
  selectedPath,
  onSelectedPathChange,
}: FileBrowserProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [stacked, setStacked] = useState(false);
  const [query, setQuery] = useState('');
  const [internalSelectedPath, setInternalSelectedPath] = useState<string>();
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredFiles = useMemo(
    () =>
      normalizedQuery
        ? files.filter(
            (entry) =>
              entry.type === 'file' &&
              entry.path.replace(/\\/gu, '/').toLocaleLowerCase().includes(normalizedQuery),
          )
        : files,
    [files, normalizedQuery],
  );
  const fileTree = useMemo(() => buildFileTree(filteredFiles), [filteredFiles]);
  const activePath = selectedPath ?? internalSelectedPath;
  const activeFile = files.find((entry) => entry.type === 'file' && entry.path === activePath);
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

  return (
    <div className="h-full min-h-0" ref={hostRef}>
      <ResizablePanelGroup orientation={stacked ? 'vertical' : 'horizontal'}>
        <ResizablePanel
          defaultSize={stacked ? '42%' : '44%'}
          id="workspace-file-tree"
          minSize={stacked ? '140px' : '190px'}
        >
          <section aria-label="Workspace file tree" className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 border-b p-2">
              <div className="relative">
                <SearchIcon
                  aria-hidden="true"
                  className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  aria-label="Filter workspace files"
                  className="h-8 pl-8 text-xs"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filter files"
                  value={query}
                />
              </div>
            </div>
            <ScrollArea className="min-h-0 flex-1 p-2">
              {filesPending ? (
                <LoadingRows label="Loading workspace files" />
              ) : files.length ? (
                filteredFiles.length ? (
                  <FileTree
                    className="rounded-none border-0 bg-transparent"
                    onSelect={selectFile}
                    selectedPath={activePath}
                  >
                    <FileNodes nodes={fileTree} />
                  </FileTree>
                ) : (
                  <Unavailable icon={SearchIcon} label="No files match this filter" />
                )
              ) : (
                <Unavailable
                  detail={filesError ?? 'The workspace contains no visible files.'}
                  icon={FolderIcon}
                  label={filesError ? 'File tree unavailable' : 'No workspace files'}
                />
              )}
            </ScrollArea>
          </section>
        </ResizablePanel>
        <ResizableHandle aria-label="Resize file tree" withHandle />
        <ResizablePanel id="workspace-file-preview" minSize={stacked ? '180px' : '240px'}>
          <section aria-label="Workspace file preview" className="h-full min-h-0 overflow-hidden">
            {activeFile ? (
              <Suspense fallback={<ResourceLoading label="Loading file" />}>
                <WorkspaceFileView
                  path={activeFile.path}
                  size={activeFile.size}
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
        {artifacts.map((artifact) => (
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
        ))}
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

/** Browses installed blueprints using replace-by-default canvas navigation. */
export function BlueprintBrowser({
  blueprints,
  blueprintsPending,
  blueprintsError,
  onOpenBlueprint,
}: BlueprintBrowserProps) {
  return (
    <ScrollArea className="h-full p-3">
      <div className="grid gap-2">
        {blueprintsPending ? <LoadingRows label="Loading blueprints" /> : null}
        {blueprints.map((blueprint) => (
          <ClioInteractiveRow
            className="cursor-pointer"
            key={blueprint.id}
            onClick={(event) => onOpenBlueprint(blueprint, event)}
            onKeyDown={(event) => {
              if (!event.shiftKey || (event.key !== 'Enter' && event.key !== ' ')) return;
              event.preventDefault();
              onOpenBlueprint(blueprint, event);
            }}
            role="button"
            tabIndex={0}
          >
            <div className="flex items-start gap-3">
              <BoxesIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{blueprint.display_name}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                  {blueprint.description || 'No description provided.'}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <ClioStatus value={blueprint.enabled ? 'healthy' : 'degraded'} />
                  <Badge variant="outline">{blueprint.scope}</Badge>
                </div>
              </div>
            </div>
          </ClioInteractiveRow>
        ))}
        {!blueprintsPending && !blueprints.length ? (
          <Unavailable
            detail={blueprintsError}
            icon={BoxesIcon}
            label={blueprintsError ? 'Blueprints unavailable' : 'No blueprints installed'}
          />
        ) : null}
      </div>
    </ScrollArea>
  );
}

interface BlueprintViewProps {
  blueprint: AgentBlueprintReference;
  workspaceId: string;
  sessionId: string;
}

/** Renders an installed blueprint and its real server-owned files in the canvas. */
export function BlueprintView({ blueprint, workspaceId, sessionId }: BlueprintViewProps) {
  const repository = useRepository();
  const hostRef = useRef<HTMLDivElement>(null);
  const [stacked, setStacked] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string>();
  const files = useQuery({
    queryKey: queryKeys.key('blueprint-files', blueprint.id, workspaceId, sessionId),
    queryFn: ({ signal }) =>
      repository.agentBlueprintFiles(blueprint.id, { workspaceId, sessionId }, signal),
  });
  const tree = useMemo(() => buildFileTree(files.data ?? []), [files.data]);
  const resolvedSelectedPath = useMemo(() => {
    const entries = files.data ?? [];
    if (selectedPath && entries.some((entry) => entry.path === selectedPath)) return selectedPath;
    const initial =
      entries.find((entry) => entry.type === 'file' && entry.path.toLowerCase() === 'agent.md') ??
      entries.find((entry) => entry.type === 'file');
    return initial?.path;
  }, [files.data, selectedPath]);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => setStacked(host.clientWidth < 480);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="h-full min-h-0" ref={hostRef}>
      <ResizablePanelGroup orientation={stacked ? 'vertical' : 'horizontal'}>
        <ResizablePanel
          defaultSize={stacked ? '38%' : '34%'}
          id={`blueprint-${blueprint.id}-tree`}
          minSize={stacked ? '150px' : '210px'}
        >
          <section aria-label={`${blueprint.display_name} files`} className="flex h-full flex-col">
            <div className="shrink-0 border-b p-3">
              <div className="flex items-start gap-2">
                <BoxesIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{blueprint.display_name}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {blueprint.enabled === undefined ? null : (
                      <ClioStatus value={blueprint.enabled ? 'healthy' : 'degraded'} />
                    )}
                    {blueprint.version ? (
                      <Badge variant="outline">Version {blueprint.version}</Badge>
                    ) : null}
                    {blueprint.scope ? <Badge variant="outline">{blueprint.scope}</Badge> : null}
                  </div>
                </div>
              </div>
            </div>
            <ScrollArea className="min-h-0 flex-1 p-2">
              {files.isPending ? (
                <LoadingRows label="Loading blueprint files" />
              ) : files.data?.length ? (
                <FileTree
                  className="rounded-none border-0 bg-transparent"
                  onSelect={setSelectedPath}
                  selectedPath={resolvedSelectedPath}
                >
                  <FileNodes nodes={tree} />
                </FileTree>
              ) : (
                <Unavailable
                  detail={files.error?.message}
                  icon={FolderIcon}
                  label={
                    files.error ? 'Blueprint files unavailable' : 'Blueprint has no visible files'
                  }
                />
              )}
            </ScrollArea>
          </section>
        </ResizablePanel>
        <ResizableHandle aria-label="Resize blueprint file tree" withHandle />
        <ResizablePanel minSize={stacked ? '220px' : '320px'}>
          {resolvedSelectedPath ? (
            <Suspense fallback={<ResourceLoading label="Loading blueprint file" />}>
              <BlueprintFileEditor
                blueprintId={blueprint.id}
                path={resolvedSelectedPath}
                sessionId={sessionId}
                workspaceId={workspaceId}
              />
            </Suspense>
          ) : (
            <div className="grid h-full place-items-center p-4">
              <Unavailable
                detail="Choose a blueprint file to inspect and edit it here."
                icon={FileTextIcon}
                label="Select a blueprint file"
              />
            </div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

function ResourceLoading({ label }: { label: string }) {
  return (
    <div className="grid h-full place-items-center p-6 text-sm text-muted-foreground">{label}…</div>
  );
}

interface WorkspaceFileNode {
  entry: WorkspaceFileEntry;
  name: string;
  children: Map<string, WorkspaceFileNode>;
}

function buildFileTree(entries: readonly WorkspaceFileEntry[]): WorkspaceFileNode[] {
  const roots = new Map<string, WorkspaceFileNode>();
  for (const entry of entries) {
    const parts = entry.path.split(/[\\/]+/).filter(Boolean);
    let children = roots;
    parts.forEach((name, index) => {
      const isLeaf = index === parts.length - 1;
      const existing = children.get(name);
      const node = existing ?? {
        entry: {
          path: parts.slice(0, index + 1).join('/'),
          type: isLeaf ? entry.type : 'dir',
          internal: false,
        },
        name,
        children: new Map<string, WorkspaceFileNode>(),
      };
      if (isLeaf) node.entry = entry;
      children.set(name, node);
      children = node.children;
    });
  }
  return sortedNodes(roots);
}

function sortedNodes(nodes: Map<string, WorkspaceFileNode>): WorkspaceFileNode[] {
  return [...nodes.values()].sort((left, right) => {
    if (left.entry.type !== right.entry.type) return left.entry.type === 'dir' ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
}

function FileNodes({ nodes }: { nodes: readonly WorkspaceFileNode[] }) {
  const alignFilesWithFolders = nodes.some((node) => node.entry.type === 'dir');
  return nodes.map((node) =>
    node.entry.type === 'dir' ? (
      <FileTreeFolder key={node.entry.path} name={node.name} path={node.entry.path}>
        <FileNodes nodes={sortedNodes(node.children)} />
      </FileTreeFolder>
    ) : (
      <FileTreeFile
        alignWithFolders={alignFilesWithFolders}
        key={node.entry.path}
        name={node.name}
        path={node.entry.path}
      />
    ),
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
