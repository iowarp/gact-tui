import type {
  AgentBlueprint,
  AgentBlueprintReference,
  Artifact as ArtifactEntity,
  SessionDiff,
  SubagentRun,
  WorkspaceFileEntry,
} from '@clio/core/v3';
import {
  ActivityIcon,
  BoxIcon,
  BoxesIcon,
  FolderIcon,
  FileCode2Icon,
  FileDiffIcon,
  Layers3Icon,
  Maximize2Icon,
  Minimize2Icon,
  XIcon,
} from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { ArtifactView, BlueprintFileEditor } from './resource-viewers';
import { ClioSubagentCanvasView } from './subagent-canvas-view';
import type { SubagentOpenTarget } from './subagent-card';
import { DiffCanvasView } from './diff-canvas-view';
import {
  ArtifactBrowser,
  BlueprintBrowser,
  BlueprintView,
  CanvasLauncher,
  FileBrowser,
  type CanvasResourceKind,
} from './workbench-resource-browser';

type WorkbenchTab =
  | { id: 'session'; kind: 'session'; label: 'Observability' }
  | { id: 'files'; kind: 'files'; label: 'Files'; path?: string }
  | { id: 'artifacts'; kind: 'artifacts'; label: 'Artifacts' }
  | { id: 'blueprints'; kind: 'blueprints'; label: 'Blueprints' }
  | { id: string; kind: 'workspace-file'; label: string; path: string; workspaceId: string }
  | {
      id: string;
      kind: 'diff';
      label: string;
      diff: SessionDiff;
      sessionId: string;
      workspaceId: string;
    }
  | {
      id: string;
      kind: 'blueprint-file';
      label: string;
      path: string;
      blueprintId: string;
      sessionId: string;
      workspaceId: string;
    }
  | {
      id: string;
      kind: 'artifact';
      label: string;
      artifact: ArtifactEntity;
      workspaceId: string;
    }
  | {
      id: string;
      kind: 'blueprint';
      label: string;
      blueprint: AgentBlueprintReference;
      sessionId: string;
      workspaceId: string;
    }
  | {
      id: string;
      kind: 'subagent';
      label: string;
      subagent: SubagentRun;
      workspaceId: string;
    };

export interface ClioWorkbenchProps {
  workspaceId: string;
  sessionId: string;
  files: readonly WorkspaceFileEntry[];
  filesPending?: boolean;
  filesError?: string;
  artifacts: readonly ArtifactEntity[];
  artifactsPending?: boolean;
  artifactsError?: string;
  artifactsTruncated?: 'page_cap_reached' | 'cursor_cycle_detected';
  blueprints: readonly AgentBlueprint[];
  blueprintsPending?: boolean;
  blueprintsError?: string;
  diffs: readonly SessionDiff[];
  diffActionError?: string;
  diffActionPending?: boolean;
  sessionView: ReactNode;
  onApplyDiff: (sessionId: string, workspaceId: string, path: string) => Promise<unknown>;
  onOpenSubagent: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
  onRejectDiff: (sessionId: string, workspaceId: string, path: string) => Promise<unknown>;
  requestedOpen?: { key: string; request: ClioWorkbenchOpenRequest };
}

export type ClioWorkbenchOpenRequest =
  | { kind: 'workspace-file'; path: string }
  | { kind: 'diff'; diff: SessionDiff }
  | { kind: 'artifact'; artifact: ArtifactEntity }
  | { kind: 'blueprint'; blueprint: AgentBlueprintReference }
  | { kind: 'subagent'; subagent: SubagentRun }
  | { kind: 'resources'; section?: Exclude<CanvasResourceKind, 'session'> }
  | { kind: 'session' };

export interface ClioWorkbenchHandle {
  open: (request: ClioWorkbenchOpenRequest) => void;
}

const sessionTab: WorkbenchTab = { id: 'session', kind: 'session', label: 'Observability' };
const fileBrowserTab: WorkbenchTab = { id: 'files', kind: 'files', label: 'Files' };
const artifactBrowserTab: WorkbenchTab = {
  id: 'artifacts',
  kind: 'artifacts',
  label: 'Artifacts',
};
const blueprintBrowserTab: WorkbenchTab = {
  id: 'blueprints',
  kind: 'blueprints',
  label: 'Blueprints',
};

export const ClioWorkbench = forwardRef<ClioWorkbenchHandle, ClioWorkbenchProps>(
  function ClioWorkbench(
    {
      workspaceId,
      sessionId,
      files,
      filesPending,
      filesError,
      artifacts,
      artifactsPending,
      artifactsError,
      artifactsTruncated,
      blueprints,
      blueprintsPending,
      blueprintsError,
      diffs,
      diffActionError,
      diffActionPending,
      sessionView,
      onApplyDiff,
      onOpenSubagent,
      onRejectDiff,
      requestedOpen,
    },
    ref,
  ) {
    const [tabs, setTabs] = useState<WorkbenchTab[]>([sessionTab]);
    const [activeTabId, setActiveTabId] = useState<string>(sessionTab.id);
    const [maximized, setMaximized] = useState(false);
    const activeTabRef = useRef<HTMLButtonElement>(null);
    const tabStripRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
      const strip = tabStripRef.current;
      const activeTab = activeTabRef.current?.parentElement;
      if (!strip || !activeTab) return;
      const left = activeTab.offsetLeft;
      const right = left + activeTab.offsetWidth;
      if (left < strip.scrollLeft) strip.scrollTo({ behavior: 'smooth', left });
      else if (right > strip.scrollLeft + strip.clientWidth) {
        strip.scrollTo({ behavior: 'smooth', left: right - strip.clientWidth });
      }
    }, [activeTabId, tabs.length]);

    const openTab = useCallback((tab: WorkbenchTab) => {
      setTabs((current) =>
        current.some((item) => item.id === tab.id)
          ? current.map((item) => (item.id === tab.id ? tab : item))
          : [...current, tab],
      );
      setActiveTabId(tab.id);
    }, []);
    const replaceTab = useCallback((tabId: string, replacement: WorkbenchTab) => {
      setTabs((current) =>
        current.some((item) => item.id === replacement.id && item.id !== tabId)
          ? current.filter((item) => item.id !== tabId)
          : current.map((item) => (item.id === tabId ? replacement : item)),
      );
      setActiveTabId(replacement.id);
    }, []);
    const closeTab = (tabId: string) => {
      const index = tabs.findIndex((tab) => tab.id === tabId);
      const next = tabs.filter((tab) => tab.id !== tabId);
      setTabs(next);
      if (activeTabId === tabId) {
        setActiveTabId(next[Math.max(0, index - 1)]?.id ?? '');
      }
    };

    const openCanvasResource = useCallback(
      (kind: CanvasResourceKind) => {
        if (kind === 'session') openTab(sessionTab);
        else if (kind === 'files') openTab(fileBrowserTab);
        else if (kind === 'artifacts') openTab(artifactBrowserTab);
        else openTab(blueprintBrowserTab);
      },
      [openTab],
    );

    const openRequest = useCallback(
      (request: ClioWorkbenchOpenRequest) => {
        if (request.kind === 'workspace-file') {
          openTab({
            id: `workspace-file:${request.path}`,
            kind: 'workspace-file',
            label: fileName(request.path),
            path: request.path,
            workspaceId,
          });
        } else if (request.kind === 'diff') {
          openTab({
            id: `diff:${sessionId}:${request.diff.path}`,
            kind: 'diff',
            label: fileName(request.diff.path),
            diff: request.diff,
            sessionId,
            workspaceId,
          });
        } else if (request.kind === 'artifact') {
          openTab({
            id: `artifact:${request.artifact.id}`,
            kind: 'artifact',
            label: request.artifact.name,
            artifact: request.artifact,
            workspaceId: request.artifact.workspace_id ?? workspaceId,
          });
        } else if (request.kind === 'blueprint') {
          openTab({
            id: `blueprint:${request.blueprint.id}`,
            kind: 'blueprint',
            label: request.blueprint.display_name,
            blueprint: request.blueprint,
            sessionId,
            workspaceId,
          });
        } else if (request.kind === 'subagent') {
          openTab({
            id: `subagent:${request.subagent.child_session_id ?? request.subagent.id}`,
            kind: 'subagent',
            label: request.subagent.title,
            subagent: request.subagent,
            workspaceId,
          });
        } else if (request.kind === 'resources') {
          openCanvasResource(request.section ?? 'files');
        } else {
          openTab(sessionTab);
        }
      },
      [openCanvasResource, openTab, sessionId, workspaceId],
    );

    useImperativeHandle(ref, () => ({ open: openRequest }), [openRequest]);

    useEffect(() => {
      if (!maximized) return;
      const restore = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        setMaximized(false);
      };
      window.addEventListener('keydown', restore, true);
      return () => window.removeEventListener('keydown', restore, true);
    }, [maximized]);

    const canvas = (
      <aside
        aria-label="Workspace canvas"
        data-maximized={maximized || undefined}
        className={cn(
          'flex h-full min-w-0 flex-col bg-card/45',
          maximized && 'fixed inset-0 z-[80] bg-background shadow-2xl',
        )}
      >
        <WorkbenchRequestDispatcher onOpen={openRequest} requestedOpen={requestedOpen} />
        <Tabs className="min-h-0 flex-1 gap-0" onValueChange={setActiveTabId} value={activeTabId}>
          <div className="flex h-12 shrink-0 items-center gap-1 border-b bg-background/80 px-1.5">
            <div
              className="no-scrollbar min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
              ref={tabStripRef}
            >
              <TabsList className="h-10 w-max justify-start gap-1 rounded-lg bg-transparent p-1">
                {tabs.map((tab) => (
                  <div
                    className={cn(
                      'group/tab flex h-8 min-w-24 max-w-56 shrink-0 items-center rounded-lg transition-colors',
                      tab.id === activeTabId
                        ? 'bg-muted text-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-muted/55 hover:text-foreground',
                    )}
                    key={tab.id}
                  >
                    <TabsTrigger
                      className="h-8 min-w-0 flex-1 justify-start rounded-lg border-transparent bg-transparent px-2 data-active:border-transparent data-active:bg-transparent data-active:shadow-none dark:data-active:border-transparent dark:data-active:bg-transparent"
                      ref={tab.id === activeTabId ? activeTabRef : undefined}
                      value={tab.id}
                    >
                      <TabIcon kind={tab.kind} />
                      <span className="truncate">{tab.label}</span>
                    </TabsTrigger>
                    <Button
                      aria-label={`Close ${tab.label}`}
                      className="mr-1 size-6 opacity-60 hover:opacity-100 focus-visible:opacity-100"
                      onClick={() => closeTab(tab.id)}
                      size="icon-xs"
                      variant="ghost"
                    >
                      <XIcon aria-hidden="true" />
                    </Button>
                  </div>
                ))}
              </TabsList>
            </div>
            <CanvasLauncher onOpen={openCanvasResource} />
            <Button
              aria-label={maximized ? 'Restore canvas beside conversation' : 'Maximize canvas'}
              className="size-9 shrink-0 rounded-lg"
              onClick={() => setMaximized((value) => !value)}
              size="icon"
              title={maximized ? 'Restore canvas' : 'Maximize canvas'}
              variant="ghost"
            >
              {maximized ? (
                <Minimize2Icon aria-hidden="true" />
              ) : (
                <Maximize2Icon aria-hidden="true" />
              )}
            </Button>
          </div>
          {tabs.map((tab) => (
            <TabsContent className="m-0 min-h-0 overflow-hidden" key={tab.id} value={tab.id}>
              {tab.kind === 'session' ? (
                sessionView
              ) : tab.kind === 'files' ? (
                <FileBrowser
                  files={files}
                  filesError={filesError}
                  filesPending={filesPending}
                  onSelectedPathChange={(path) =>
                    setTabs((current) =>
                      current.map((candidate) =>
                        candidate.id === tab.id && candidate.kind === 'files'
                          ? { ...candidate, path }
                          : candidate,
                      ),
                    )
                  }
                  selectedPath={tab.path}
                  workspaceId={workspaceId}
                />
              ) : tab.kind === 'artifacts' ? (
                <ArtifactBrowser
                  artifacts={artifacts}
                  artifactsError={artifactsError}
                  artifactsPending={artifactsPending}
                  artifactsTruncated={artifactsTruncated}
                  defaultSplit={maximized}
                  files={files}
                  onReplaceArtifact={(artifact) =>
                    replaceTab(tab.id, {
                      id: `artifact:${artifact.id}`,
                      kind: 'artifact',
                      label: artifact.name,
                      artifact,
                      workspaceId: artifact.workspace_id ?? workspaceId,
                    })
                  }
                  workspaceId={workspaceId}
                />
              ) : tab.kind === 'blueprints' ? (
                <BlueprintBrowser
                  blueprints={blueprints}
                  blueprintsError={blueprintsError}
                  blueprintsPending={blueprintsPending}
                  onOpenBlueprint={(blueprint) =>
                    openTab({
                      id: `blueprint:${blueprint.id}`,
                      kind: 'blueprint',
                      label: blueprint.display_name,
                      blueprint,
                      sessionId,
                      workspaceId,
                    })
                  }
                />
              ) : tab.kind === 'workspace-file' ? (
                <FileBrowser
                  files={files}
                  filesError={filesError}
                  filesPending={filesPending}
                  onSelectedPathChange={(path) =>
                    setTabs((current) =>
                      current.map((candidate) =>
                        candidate.id === tab.id && candidate.kind === 'workspace-file'
                          ? { ...candidate, label: fileName(path), path }
                          : candidate,
                      ),
                    )
                  }
                  selectedPath={tab.path}
                  workspaceId={tab.workspaceId}
                />
              ) : tab.kind === 'diff' ? (
                <DiffCanvasView
                  diff={
                    tab.sessionId === sessionId
                      ? (diffs.find((candidate) => candidate.path === tab.diff.path) ?? tab.diff)
                      : tab.diff
                  }
                  error={diffActionError}
                  onApply={(path) => onApplyDiff(tab.sessionId, tab.workspaceId, path)}
                  onOpenFile={(path) =>
                    openTab({
                      id: `workspace-file:${tab.workspaceId}:${path}`,
                      kind: 'workspace-file',
                      label: fileName(path),
                      path,
                      workspaceId: tab.workspaceId,
                    })
                  }
                  onReject={(path) => onRejectDiff(tab.sessionId, tab.workspaceId, path)}
                  pending={diffActionPending}
                />
              ) : tab.kind === 'blueprint-file' ? (
                <BlueprintFileEditor
                  blueprintId={tab.blueprintId}
                  path={tab.path}
                  sessionId={tab.sessionId}
                  workspaceId={tab.workspaceId}
                />
              ) : tab.kind === 'artifact' ? (
                <ArtifactView
                  artifact={tab.artifact}
                  files={tab.workspaceId === workspaceId ? files : []}
                  onOpenArtifact={(artifact) =>
                    openTab({
                      id: `artifact:${artifact.id}`,
                      kind: 'artifact',
                      label: artifact.name,
                      artifact,
                      workspaceId: artifact.workspace_id ?? tab.workspaceId,
                    })
                  }
                  workspaceId={tab.workspaceId}
                />
              ) : tab.kind === 'blueprint' ? (
                <BlueprintView
                  blueprint={tab.blueprint}
                  sessionId={tab.sessionId}
                  workspaceId={tab.workspaceId}
                />
              ) : (
                <ClioSubagentCanvasView
                  activeSessionId={sessionId}
                  onOpenArtifact={(artifact) =>
                    openTab({
                      id: `artifact:${artifact.id}`,
                      kind: 'artifact',
                      label: artifact.name,
                      artifact,
                      workspaceId: artifact.workspace_id ?? tab.workspaceId,
                    })
                  }
                  onOpenConversation={(subagent) => onOpenSubagent(subagent, 'conversation')}
                  onOpenFile={(path) =>
                    openTab({
                      id: `workspace-file:${path}`,
                      kind: 'workspace-file',
                      label: fileName(path),
                      path,
                      workspaceId: tab.workspaceId,
                    })
                  }
                  onOpenSubagent={(subagent, target) => {
                    if (target === 'conversation') onOpenSubagent(subagent, target);
                    else
                      openTab({
                        id: `subagent:${subagent.child_session_id ?? subagent.id}`,
                        kind: 'subagent',
                        label: subagent.title,
                        subagent,
                        workspaceId: tab.workspaceId,
                      });
                  }}
                  subagent={tab.subagent}
                  workspaceId={tab.workspaceId}
                />
              )}
            </TabsContent>
          ))}
          {tabs.length === 0 ? (
            <Empty className="h-full border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Layers3Icon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>Canvas is empty</EmptyTitle>
                <EmptyDescription>
                  Use the add button to open observability, files, artifacts, or blueprints.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
        </Tabs>
      </aside>
    );

    return maximized ? createPortal(canvas, document.body) : canvas;
  },
);

function WorkbenchRequestDispatcher({
  onOpen,
  requestedOpen,
}: {
  onOpen: (request: ClioWorkbenchOpenRequest) => void;
  requestedOpen?: { key: string; request: ClioWorkbenchOpenRequest };
}) {
  // Compact layouts mount the workbench only after their sheet opens. Keeping
  // the event in props lets this mounted child deliver the first resource
  // request instead of silently showing only the default Observability tab.
  useEffect(() => {
    if (requestedOpen) onOpen(requestedOpen.request);
  }, [onOpen, requestedOpen]);
  return null;
}

function TabIcon({ kind }: { kind: WorkbenchTab['kind'] }) {
  const Icon =
    kind === 'session'
      ? ActivityIcon
      : kind === 'files'
        ? FolderIcon
        : kind === 'artifacts'
          ? BoxIcon
          : kind === 'blueprints'
            ? BoxesIcon
            : kind === 'diff'
              ? FileDiffIcon
              : kind === 'subagent'
                ? BoxesIcon
                : kind === 'artifact'
                  ? BoxIcon
                  : kind === 'blueprint'
                    ? BoxesIcon
                    : FileCode2Icon;
  return <Icon aria-hidden="true" className="size-3.5" />;
}

function fileName(path: string): string {
  return (
    path
      .split(/[\\/]+/)
      .filter(Boolean)
      .at(-1) ?? path
  );
}
