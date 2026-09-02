import type {
  Artifact as ArtifactEntity,
  ContextSnapshot,
  Run,
  Task,
  ToolInvocation,
  WorkspaceFileEntry,
} from '@clio/core/v3';
import {
  ActivityIcon,
  BoxIcon,
  BracesIcon,
  CopyIcon,
  FolderIcon,
  ListChecksIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Context,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextTrigger,
} from '@/components/ai-elements/context';
import { FileTree, FileTreeFile, FileTreeFolder } from '@/components/ai-elements/file-tree';
import {
  Timeline,
  TimelineContent,
  TimelineDate,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from '@/components/reui/timeline';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { copyText } from '@/lib/clipboard';
import { formatBytes, formatDuration } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ClioContextMeter } from './context-meter';
import { ClioArtifactCard } from './artifact-card';
import { ClioInteractiveRow } from './interactive-row';
import { ClioStatus } from './status';

export interface ClioInspectorProps {
  sessionId: string;
  tasks: readonly Task[];
  artifacts: readonly ArtifactEntity[];
  tools: readonly ToolInvocation[];
  runs: readonly Run[];
  context?: ContextSnapshot;
  contextPending?: boolean;
  contextError?: string;
  files: readonly WorkspaceFileEntry[];
  filesPending?: boolean;
  filesError?: string;
}

type ActivityItem =
  | { id: string; kind: 'run'; label: string; detail?: string; state: Run['state']; at?: string }
  | {
      id: string;
      kind: 'tool';
      label: string;
      detail?: string;
      state: ToolInvocation['state'];
      at?: string;
    };

export function ClioInspector({
  tasks,
  artifacts,
  tools,
  runs,
  context,
  contextPending,
  contextError,
  files,
  filesPending,
  filesError,
}: ClioInspectorProps) {
  const [selectedFilePath, setSelectedFilePath] = useState<string>();
  const activity = useMemo<ActivityItem[]>(
    () =>
      [
        ...runs.map(
          (run): ActivityItem => ({
            id: run.id,
            kind: 'run',
            label: run.summary || `Run ${run.id.slice(0, 8)}`,
            detail:
              run.elapsed_ms === undefined
                ? undefined
                : `${formatDuration(run.elapsed_ms)} elapsed`,
            state: run.state,
            at: run.completed_at ?? run.started_at,
          }),
        ),
        ...tools.map(
          (tool): ActivityItem => ({
            id: tool.id,
            kind: 'tool',
            label: tool.title ?? tool.name,
            detail: tool.title ? tool.name : undefined,
            state: tool.state,
            at: tool.completed_at ?? tool.started_at,
          }),
        ),
      ].sort((left, right) => (right.at ?? '').localeCompare(left.at ?? '')),
    [runs, tools],
  );

  const contextReading = context?.used_tokens ?? context?.live_tokens;
  const contextAvailable =
    contextReading !== undefined && context?.limit_tokens !== undefined && context.limit_tokens > 0;
  const fileTree = useMemo(() => buildFileTree(files), [files]);
  const selectedFile = files.find((file) => file.path === selectedFilePath);

  return (
    <aside className="h-full min-w-0 bg-card/45">
      <Tabs className="flex h-full flex-col" defaultValue="work">
        <div className="border-b px-3 py-2">
          <TabsList className="grid w-full grid-cols-5 bg-muted/60">
            <TabsTrigger aria-label="Work" value="work">
              <ListChecksIcon aria-hidden="true" className="size-4" />
              <span className="hidden 2xl:inline">Work</span>
            </TabsTrigger>
            <TabsTrigger aria-label="Artifacts" value="artifacts">
              <BoxIcon aria-hidden="true" className="size-4" />
              <span className="hidden 2xl:inline">Artifacts</span>
            </TabsTrigger>
            <TabsTrigger aria-label="Context" value="context">
              <BracesIcon aria-hidden="true" className="size-4" />
              <span className="hidden 2xl:inline">Context</span>
            </TabsTrigger>
            <TabsTrigger aria-label="Files" value="files">
              <FolderIcon aria-hidden="true" className="size-4" />
              <span className="hidden 2xl:inline">Files</span>
            </TabsTrigger>
            <TabsTrigger aria-label="Activity" value="activity">
              <ActivityIcon aria-hidden="true" className="size-4" />
              <span className="hidden 2xl:inline">Activity</span>
            </TabsTrigger>
          </TabsList>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <TabsContent className="m-0 grid gap-2 p-4" value="work">
            <h2 className="mb-2 text-sm font-semibold">Current work</h2>
            {tasks.map((task) => (
              <ClioInteractiveRow key={task.id} running={task.state === 'running'}>
                <p className="truncate text-sm font-medium">{task.title}</p>
                {task.detail ? (
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{task.detail}</p>
                ) : null}
                <div className="mt-2">
                  <ClioStatus value={task.state} />
                </div>
              </ClioInteractiveRow>
            ))}
            {tasks.length === 0 ? (
              <Unavailable icon={ListChecksIcon} label="Tasks unavailable" />
            ) : null}
          </TabsContent>

          <TabsContent className="m-0 grid gap-3 p-4" value="artifacts">
            <h2 className="mb-1 text-sm font-semibold">Artifacts</h2>
            {artifacts.map((artifact) => (
              <ClioArtifactCard
                artifact={artifact}
                key={artifact.id}
                onOpen={() => openArtifact(artifact.uri)}
              />
            ))}
            {artifacts.length === 0 ? (
              <Unavailable icon={BoxIcon} label="Artifacts unavailable" />
            ) : null}
          </TabsContent>

          <TabsContent className="m-0 p-4" value="context">
            <h2 className="mb-4 text-sm font-semibold">Context window</h2>
            {contextPending ? (
              <div aria-label="Loading context" className="grid gap-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : contextAvailable ? (
              <Context maxTokens={context.limit_tokens!} usedTokens={contextReading!}>
                <div className="grid gap-4">
                  <div className="grid gap-1">
                    <p className="text-xs font-medium">
                      {context.used_tokens === undefined
                        ? 'Live context attribution'
                        : 'Last model prompt'}
                    </p>
                    <ClioContextMeter limit={context.limit_tokens} used={contextReading} />
                  </div>
                  <ContextTrigger className="w-full justify-between border bg-background" />
                </div>
                <ContextContent align="end">
                  <ContextContentHeader />
                  <ContextContentBody className="grid gap-2 text-xs">
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Scope</span>
                      <span>{context.scope ?? 'Unavailable'}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Live blocks</span>
                      <span>{context.live_block_count ?? 'Unavailable'}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Observed by</span>
                      <span>{context.provenance.source}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Freshness</span>
                      <span>{context.provenance.stale ? 'Stale' : 'Current'}</span>
                    </div>
                  </ContextContentBody>
                  <ContextContentFooter>
                    <span className="text-muted-foreground">Source</span>
                    <span>{context.provenance.source}</span>
                  </ContextContentFooter>
                </ContextContent>
                {context.categories && Object.keys(context.categories).length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2" aria-label="Context categories">
                    {Object.entries(context.categories).map(([category, tokens]) => (
                      <Badge key={category} variant="secondary">
                        {category.replaceAll('_', ' ')}, {tokens.toLocaleString()} tokens
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </Context>
            ) : (
              <Unavailable
                detail={contextError ?? context?.provenance.reason}
                icon={BracesIcon}
                label="Context unavailable"
              />
            )}
          </TabsContent>

          <TabsContent className="m-0 p-4" value="files">
            <h2 className="mb-4 text-sm font-semibold">Workspace files</h2>
            {filesPending ? (
              <div aria-label="Loading workspace files" className="grid gap-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-4/5" />
                <Skeleton className="h-8 w-11/12" />
              </div>
            ) : files.length > 0 ? (
              <div className="grid gap-3">
                <FileTree onSelect={setSelectedFilePath} selectedPath={selectedFilePath}>
                  <FileNodes nodes={fileTree} />
                </FileTree>
                {selectedFile ? (
                  <div className="rounded-lg border bg-background p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {fileName(selectedFile.path)}
                        </p>
                        <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
                          {selectedFile.path}
                        </p>
                      </div>
                      <Button
                        aria-label={`Copy path for ${selectedFile.path}`}
                        onClick={() => void copyText(selectedFile.path)}
                        size="icon-sm"
                        variant="ghost"
                      >
                        <CopyIcon aria-hidden="true" />
                      </Button>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {selectedFile.type === 'dir'
                        ? 'Folder'
                        : `${selectedFile.size === undefined ? 'Size unavailable' : formatBytes(selectedFile.size)}${selectedFile.modified ? `, modified ${formatTimestamp(selectedFile.modified)}` : ''}`}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : (
              <Unavailable
                detail={filesError ?? 'The workspace contains no visible files.'}
                icon={FolderIcon}
                label={filesError ? 'File tree unavailable' : 'No workspace files'}
              />
            )}
          </TabsContent>

          <TabsContent className="m-0 p-4" value="activity">
            <h2 className="mb-4 text-sm font-semibold">Activity</h2>
            {activity.length > 0 ? (
              <Timeline defaultValue={activity.length}>
                {activity.map((item, index) => (
                  <TimelineItem key={`${item.kind}:${item.id}`} step={index + 1}>
                    <TimelineIndicator />
                    <TimelineSeparator />
                    <TimelineDate dateTime={item.at}>
                      {item.at ? formatTimestamp(item.at) : 'Time unavailable'}
                    </TimelineDate>
                    <TimelineHeader className="flex items-start justify-between gap-2">
                      <TimelineTitle className="min-w-0 truncate">{item.label}</TimelineTitle>
                      <ClioStatus value={item.state} />
                    </TimelineHeader>
                    <TimelineContent>
                      {item.detail ?? (item.kind === 'run' ? 'Agent run' : 'Tool activity')}
                    </TimelineContent>
                  </TimelineItem>
                ))}
              </Timeline>
            ) : (
              <Unavailable icon={ActivityIcon} label="Activity unavailable" />
            )}
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </aside>
  );
}

function Unavailable({
  label,
  detail,
  icon: Icon,
}: {
  label: string;
  detail?: string;
  icon: typeof ActivityIcon;
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

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Time unavailable'
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
}

function openArtifact(uri: string): void {
  window.open(uri, '_blank', 'noopener,noreferrer');
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

function fileName(path: string): string {
  return (
    path
      .split(/[\\/]+/)
      .filter(Boolean)
      .at(-1) ?? path
  );
}
