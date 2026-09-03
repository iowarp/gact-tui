import type {
  AgentBlueprint,
  AgentBlueprintReference,
  Artifact as ArtifactEntity,
  SessionDiff,
  SubagentRun,
  WorkspaceFileEntry,
  WorkspaceResource,
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
  PaperclipIcon,
  XIcon,
} from 'lucide-react';
import {
  forwardRef,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type ComponentType,
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
import { ClioSubagentCanvasView } from './subagent-canvas-view';
import type { SubagentOpenTarget } from './subagent-card';
import { DiffCanvasView } from './diff-canvas-view';
import { useWorkspaceCanvasVisibility } from './workspace-canvas-visibility-context';
import { WorkspaceResourceBrowser } from './workspace-resource-browser';
import { WorkbenchTabErrorBoundary } from './workbench-tab-error-boundary';
import {
  ArtifactBrowser,
  BlueprintBrowser,
  BlueprintView,
  CanvasLauncher,
  FileBrowser,
  type CanvasResourceKind,
} from './workbench-resource-browser';

const loadResourceViewers = () => import('./resource-viewers');
const ArtifactView = lazy(() =>
  loadResourceViewers().then((module) => ({ default: module.ArtifactView })),
);
const BlueprintFileEditor = lazy(() =>
  loadResourceViewers().then((module) => ({ default: module.BlueprintFileEditor })),
);
const WorkspaceResourceView = lazy(() =>
  import('./workspace-resource-view').then((module) => ({
    default: module.WorkspaceResourceView,
  })),
);

type WorkbenchTab =
  | { id: 'session'; kind: 'session'; label: 'Observability' }
  | { id: 'files'; kind: 'files'; label: 'Files'; path?: string }
  | { id: 'artifacts'; kind: 'artifacts'; label: 'Artifacts' }
  | { id: 'blueprints'; kind: 'blueprints'; label: 'Blueprints' }
  | { id: 'resources'; kind: 'resources'; label: 'Resources' }
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
      kind: 'resource';
      label: string;
      resource: WorkspaceResource;
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
  resources?: readonly WorkspaceResource[];
  resourcesPending?: boolean;
  resourcesError?: string;
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
  | { kind: 'resource'; resource: WorkspaceResource }
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
const resourceBrowserTab: WorkbenchTab = {
  id: 'resources',
  kind: 'resources',
  label: 'Resources',
};

const canvasResourceTabs = {
  session: sessionTab,
  files: fileBrowserTab,
  artifacts: artifactBrowserTab,
  blueprints: blueprintBrowserTab,
  resources: resourceBrowserTab,
} satisfies Record<CanvasResourceKind, WorkbenchTab>;

const workbenchTabIcons = {
  session: ActivityIcon,
  files: FolderIcon,
  artifacts: BoxIcon,
  blueprints: BoxesIcon,
  resources: PaperclipIcon,
  'workspace-file': FileCode2Icon,
  diff: FileDiffIcon,
  'blueprint-file': FileCode2Icon,
  artifact: BoxIcon,
  resource: PaperclipIcon,
  blueprint: BoxesIcon,
  subagent: BoxesIcon,
} satisfies Record<
  WorkbenchTab['kind'],
  ComponentType<{ 'aria-hidden'?: boolean; className?: string }>
>;

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
      resources = [],
      resourcesPending,
      resourcesError,
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
    const activeTabRef = useRef<HTMLDivElement>(null);
    const tabStripRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
      const strip = tabStripRef.current;
      const activeTab = activeTabRef.current;
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
    const canvasVisible = useWorkspaceCanvasVisibility();

    const openCanvasResource = useCallback(
      (kind: CanvasResourceKind) => {
        if (kind === 'artifacts') void loadResourceViewers();
        openTab(canvasResourceTabs[kind]);
      },
      [openTab],
    );

    const openRequest = useCallback(
      (request: ClioWorkbenchOpenRequest) => {
        switch (request.kind) {
          case 'workspace-file':
            openTab({
              id: `workspace-file:${request.path}`,
              kind: 'workspace-file',
              label: fileName(request.path),
              path: request.path,
              workspaceId,
            });
            return;
          case 'diff':
            openTab({
              id: `diff:${sessionId}:${request.diff.path}`,
              kind: 'diff',
              label: fileName(request.diff.path),
              diff: request.diff,
              sessionId,
              workspaceId,
            });
            return;
          case 'artifact':
            openTab({
              id: `artifact:${request.artifact.id}`,
              kind: 'artifact',
              label: request.artifact.name,
              artifact: request.artifact,
              workspaceId: request.artifact.workspace_id ?? workspaceId,
            });
            return;
          case 'resource':
            openTab({
              id: `resource:${request.resource.id}`,
              kind: 'resource',
              label: request.resource.name,
              resource: request.resource,
              workspaceId: request.resource.workspace_id || workspaceId,
            });
            return;
          case 'blueprint':
            openTab({
              id: `blueprint:${request.blueprint.id}`,
              kind: 'blueprint',
              label: request.blueprint.display_name,
              blueprint: request.blueprint,
              sessionId,
              workspaceId,
            });
            return;
          case 'subagent':
            openTab({
              id: `subagent:${request.subagent.child_session_id ?? request.subagent.id}`,
              kind: 'subagent',
              label: request.subagent.title,
              subagent: request.subagent,
              workspaceId,
            });
            return;
          case 'resources':
            openCanvasResource(request.section ?? 'files');
            return;
          case 'session':
            openTab(sessionTab);
            return;
          default:
            assertNever(request);
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

    const renderTabContent = (tab: WorkbenchTab): ReactNode => {
      switch (tab.kind) {
        case 'session':
          return sessionView;
        case 'files':
          return (
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
          );
        case 'artifacts':
          return (
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
          );
        case 'resources':
          return (
            <WorkspaceResourceBrowser
              defaultSplit={maximized}
              error={resourcesError}
              onOpenResource={(resource) =>
                openTab({
                  id: `resource:${resource.id}`,
                  kind: 'resource',
                  label: resource.name,
                  resource,
                  workspaceId: resource.workspace_id || workspaceId,
                })
              }
              pending={resourcesPending}
              resources={resources}
              workspaceId={workspaceId}
            />
          );
        case 'blueprints':
          return (
            <BlueprintBrowser
              blueprints={blueprints}
              blueprintsError={blueprintsError}
              blueprintsPending={blueprintsPending}
              onOpenBlueprint={(blueprint, event) => {
                const blueprintTab: WorkbenchTab = {
                  id: `blueprint:${blueprint.id}`,
                  kind: 'blueprint',
                  label: blueprint.display_name,
                  blueprint,
                  sessionId,
                  workspaceId,
                };
                if (event.shiftKey) openTab(blueprintTab);
                else replaceTab(tab.id, blueprintTab);
              }}
            />
          );
        case 'workspace-file':
          return (
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
          );
        case 'diff':
          return (
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
          );
        case 'blueprint-file':
          return (
            <Suspense fallback={<CanvasLoading label="Loading blueprint file" />}>
              <BlueprintFileEditor
                blueprintId={tab.blueprintId}
                path={tab.path}
                sessionId={tab.sessionId}
                workspaceId={tab.workspaceId}
              />
            </Suspense>
          );
        case 'artifact':
          return (
            <Suspense fallback={<CanvasLoading label="Loading artifact" />}>
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
            </Suspense>
          );
        case 'resource':
          return (
            <Suspense fallback={<CanvasLoading label="Loading resource" />}>
              <WorkspaceResourceView resource={tab.resource} workspaceId={tab.workspaceId} />
            </Suspense>
          );
        case 'blueprint':
          return (
            <BlueprintView
              blueprint={tab.blueprint}
              sessionId={tab.sessionId}
              workspaceId={tab.workspaceId}
            />
          );
        case 'subagent':
          return (
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
          );
        default:
          return assertNever(tab);
      }
    };

    const canvas = (
      <aside
        aria-label="Workspace canvas"
        data-maximized={maximized || undefined}
        className={cn(
          'relative z-30 flex h-full min-w-0 flex-col bg-card/45',
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
                {tabs.map((tab) => {
                  const active = tab.id === activeTabId;
                  return (
                    // The close button below is a SIBLING, not a child, of TabsTrigger: Radix's
                    // Tabs.Trigger renders a real <button role="tab">, whose content model
                    // forbids interactive descendants and whose ARIA role treats descendants as
                    // presentational (stripped from the accessibility tree) — nesting a control
                    // in it, real <button> or otherwise, cannot carry its own accessible name to
                    // assistive tech, and adds a stray tab stop inside the tablist's roving-
                    // tabindex model. Wrapping keeps both as ordinary flex siblings; Radix finds
                    // TabsTrigger by DOM query regardless of this wrapper, so roving tabindex
                    // between tabs is unaffected.
                    <div
                      className="group/canvas-tab relative flex min-w-24 max-w-56 shrink-0"
                      key={tab.id}
                      ref={active ? activeTabRef : undefined}
                    >
                      <TabsTrigger
                        aria-keyshortcuts="Delete"
                        className={cn(
                          'h-8 w-full justify-start rounded-lg border-transparent bg-transparent py-0.5 pr-8 pl-2 transition-colors data-active:border-transparent data-active:bg-muted data-active:text-foreground data-active:shadow-sm dark:data-active:border-transparent dark:data-active:bg-muted',
                          active
                            ? 'text-foreground'
                            : 'text-muted-foreground hover:bg-muted/55 hover:text-foreground',
                        )}
                        onKeyDown={(event) => {
                          if (event.key !== 'Delete') return;
                          event.preventDefault();
                          closeTab(tab.id);
                        }}
                        value={tab.id}
                      >
                        <TabIcon kind={tab.kind} />
                        <span className="truncate">{tab.label}</span>
                      </TabsTrigger>
                      {/*
                        A pointer affordance, deliberately outside the accessibility tree. A
                        tablist may own nothing but tabs and a tab's own children are
                        presentational, so a real <button> is a critical violation on either side
                        of the trigger: aria-required-children as a sibling, nested-interactive as
                        a child. Assistive tech closes the tab through the aria-keyshortcuts
                        "Delete" announced with the tab and handled above — so this control must
                        also stay unfocusable, which is why it is a span and not a disabled-looking
                        button. Always at least faintly visible, since touch has no hover to reveal
                        it on; hover and keyboard focus within the tab only strengthen it.
                      */}
                      <span
                        aria-hidden="true"
                        className="absolute top-1/2 right-1 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-70 transition-opacity group-hover/canvas-tab:opacity-100 group-focus-within/canvas-tab:opacity-100 hover:bg-muted hover:text-foreground"
                        data-slot="canvas-tab-close"
                        onClick={(event) => {
                          event.stopPropagation();
                          closeTab(tab.id);
                        }}
                        title={`Close ${tab.label}`}
                      >
                        <XIcon aria-hidden="true" className="size-3.5" />
                      </span>
                    </div>
                  );
                })}
              </TabsList>
            </div>
            <CanvasLauncher onOpen={openCanvasResource} />
            <Button
              aria-label={maximized ? 'Restore canvas beside conversation' : 'Maximize canvas'}
              className="relative z-10 size-9 shrink-0 rounded-lg"
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
              {canvasVisible ? (
                <WorkbenchTabErrorBoundary label={tab.label} onClose={() => closeTab(tab.id)}>
                  {renderTabContent(tab)}
                </WorkbenchTabErrorBoundary>
              ) : null}
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
                  Use the add button to open observability, files, resources, artifacts, or
                  blueprints.
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
  const Icon = workbenchTabIcons[kind];
  return <Icon aria-hidden="true" className="size-3.5" />;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported workbench item: ${JSON.stringify(value)}`);
}

function CanvasLoading({ label }: { label: string }) {
  return (
    <div className="grid h-full place-items-center p-6 text-sm text-muted-foreground">{label}…</div>
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
