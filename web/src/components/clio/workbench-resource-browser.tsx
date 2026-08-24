import type { AgentBlueprint, Artifact, WorkspaceFileEntry } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { BoxIcon, BoxesIcon, FolderIcon, PlusIcon } from 'lucide-react';
import { useMemo } from 'react';
import { FileTree, FileTreeFile, FileTreeFolder } from '@/components/ai-elements/file-tree';
import { Frame, FrameHeader, FramePanel, FrameTitle } from '@/components/reui/frame';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRepository } from '@/hooks/use-repository';
import { cn } from '@/lib/utils';
import { visibleWorkspaceFiles } from '@/lib/workspace-files';
import { ClioArtifactCard } from './artifact-card';
import { ClioInteractiveRow } from './interactive-row';
import { ClioStatus } from './status';

export type ResourceSection = 'files' | 'artifacts' | 'blueprints';

interface ResourceBrowserProps {
  files: readonly WorkspaceFileEntry[];
  filesPending?: boolean;
  filesError?: string;
  artifacts: readonly Artifact[];
  blueprints: readonly AgentBlueprint[];
  blueprintsPending?: boolean;
  blueprintsError?: string;
  onOpenFile: (path: string) => void;
  onOpenArtifact: (artifact: Artifact) => void;
  onOpenBlueprint: (blueprint: AgentBlueprint) => void;
  section: ResourceSection;
  onSectionChange: (section: ResourceSection) => void;
}

/** Opens the sourced workspace, artifact, and blueprint explorers in the canvas. */
export function CanvasLauncher({ onOpen }: { onOpen: (section: ResourceSection) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Open a canvas tab"
          className="h-14 w-12 rounded-none border-l"
          size="icon"
          title="Open a canvas tab"
          variant="ghost"
        >
          <PlusIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Add to canvas</DropdownMenuLabel>
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

/** Provides the canvas resource browser through AI Elements file trees and shared artifact cards. */
export function ResourceBrowser({
  files,
  filesPending,
  filesError,
  artifacts,
  blueprints,
  blueprintsPending,
  blueprintsError,
  onOpenFile,
  onOpenArtifact,
  onOpenBlueprint,
  section,
  onSectionChange,
}: ResourceBrowserProps) {
  const visibleFiles = useMemo(() => visibleWorkspaceFiles(files), [files]);
  const fileTree = useMemo(() => buildFileTree(visibleFiles), [visibleFiles]);
  return (
    <Tabs
      className="h-full gap-0"
      onValueChange={(value) => onSectionChange(value as ResourceSection)}
      value={section}
    >
      <div className="border-b px-3 py-2">
        <TabsList className="grid w-full grid-cols-3 bg-muted/60">
          <TabsTrigger value="files">
            <FolderIcon aria-hidden="true" /> Files
          </TabsTrigger>
          <TabsTrigger value="artifacts">
            <BoxIcon aria-hidden="true" /> Artifacts
          </TabsTrigger>
          <TabsTrigger value="blueprints">
            <BoxesIcon aria-hidden="true" /> Blueprints
          </TabsTrigger>
        </TabsList>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <TabsContent className="m-0 p-3" value="files">
          {filesPending ? (
            <LoadingRows label="Loading workspace files" />
          ) : visibleFiles.length ? (
            <FileTree onSelect={onOpenFile}>
              <FileNodes nodes={fileTree} />
            </FileTree>
          ) : (
            <Unavailable
              detail={filesError ?? 'The workspace contains no visible files.'}
              icon={FolderIcon}
              label={filesError ? 'File tree unavailable' : 'No workspace files'}
            />
          )}
        </TabsContent>
        <TabsContent className="m-0 grid gap-2 p-3" value="artifacts">
          {artifacts.map((artifact) => (
            <ClioArtifactCard artifact={artifact} key={artifact.id} onOpen={onOpenArtifact} />
          ))}
          {!artifacts.length ? (
            <Unavailable icon={BoxIcon} label="No artifacts produced in this session" />
          ) : null}
        </TabsContent>
        <TabsContent className="m-0 grid gap-2 p-3" value="blueprints">
          {blueprintsPending ? <LoadingRows label="Loading blueprints" /> : null}
          {blueprints.map((blueprint) => (
            <ClioInteractiveRow
              className="cursor-pointer"
              key={blueprint.id}
              onClick={() => onOpenBlueprint(blueprint)}
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
        </TabsContent>
      </ScrollArea>
    </Tabs>
  );
}

interface BlueprintViewProps {
  blueprint: AgentBlueprint;
  workspaceId: string;
  sessionId: string;
  onOpenFile: (path: string) => void;
}

/** Renders an installed blueprint and its real server-owned files in the canvas. */
export function BlueprintView({
  blueprint,
  workspaceId,
  sessionId,
  onOpenFile,
}: BlueprintViewProps) {
  const repository = useRepository();
  const files = useQuery({
    queryKey: ['blueprint-files', blueprint.id, workspaceId, sessionId],
    queryFn: ({ signal }) =>
      repository.agentBlueprintFiles(blueprint.id, { workspaceId, sessionId }, signal),
  });
  const tree = useMemo(() => buildFileTree(files.data ?? []), [files.data]);
  return (
    <ScrollArea className="h-full p-3">
      <Frame spacing="sm" variant="ghost">
        <FrameHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <FrameTitle>{blueprint.display_name}</FrameTitle>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {blueprint.description || 'No description provided.'}
              </p>
            </div>
            <ClioStatus value={blueprint.enabled ? 'healthy' : 'degraded'} />
          </div>
        </FrameHeader>
        <FramePanel>
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge variant="outline">Version {blueprint.version || 'Unavailable'}</Badge>
            <Badge variant="outline">{blueprint.scope}</Badge>
          </div>
          {blueprint.validation_errors.length ? (
            <ul className="mb-4 grid gap-1 text-xs text-destructive">
              {blueprint.validation_errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}
          {files.isPending ? (
            <LoadingRows label="Loading blueprint files" />
          ) : files.data?.length ? (
            <FileTree onSelect={onOpenFile}>
              <FileNodes nodes={tree} />
            </FileTree>
          ) : (
            <Unavailable
              detail={files.error?.message}
              icon={FolderIcon}
              label={files.error ? 'Blueprint files unavailable' : 'Blueprint has no visible files'}
            />
          )}
        </FramePanel>
      </Frame>
    </ScrollArea>
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
  return nodes.map((node) =>
    node.entry.type === 'dir' ? (
      <FileTreeFolder key={node.entry.path} name={node.name} path={node.entry.path}>
        <FileNodes nodes={sortedNodes(node.children)} />
      </FileTreeFolder>
    ) : (
      <FileTreeFile key={node.entry.path} name={node.name} path={node.entry.path} />
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
