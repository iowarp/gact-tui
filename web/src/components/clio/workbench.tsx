import type {
  AgentBlueprint,
  AgentBlueprintReference,
  Artifact as ArtifactEntity,
  SessionDiff,
  SubagentRun,
  ToolInvocation,
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
  WorkflowIcon,
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
import { Sortable, SortableItem, SortableItemHandle } from '@/components/reui/sortable';
import { cn } from '@/lib/utils';
import type { SubagentOpenTarget } from './subagent-card';
import { useWorkspaceCanvasVisibility } from './workspace-canvas-visibility-context';
import { WorkbenchTabErrorBoundary } from './workbench-tab-error-boundary';
import { workflowDescriptor } from './workflow-tool-presentation';
import { CanvasLauncher, type CanvasResourceKind } from './workbench-resource-browser';
import { WorkbenchTabContent } from './workbench-tab-content';
import { assertNever, fileName, loadResourceViewers, type WorkbenchTab } from './workbench-shared';

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
  subagents?: readonly SubagentRun[];
  requestedOpen?: { key: string; request: ClioWorkbenchOpenRequest };
}

export type ClioWorkbenchOpenRequest =
  | { kind: 'workspace-file'; path: string }
  | { kind: 'diff'; diff: SessionDiff }
  | { kind: 'artifact'; artifact: ArtifactEntity }
  | {
      kind: 'resource';
      resource: WorkspaceResource;
      relatedResources?: readonly WorkspaceResource[];
    }
  | { kind: 'blueprint'; blueprint: AgentBlueprintReference }
  | { kind: 'subagent'; subagent: SubagentRun }
  | { kind: 'workflow'; tool: ToolInvocation }
  | { kind: 'resources'; section?: Exclude<CanvasResourceKind, 'session'> }
  | { kind: 'session' };

export interface ClioWorkbenchHandle {
  open: (request: ClioWorkbenchOpenRequest) => void;
}

const sessionTab: WorkbenchTab = { id: 'session', kind: 'session', label: 'Observability' };
const WORKBENCH_TABS_STORAGE_PREFIX = 'clio.workbench-tabs.v1';

function workbenchTabsStorageKey(workspaceId: string): string {
  return `${WORKBENCH_TABS_STORAGE_PREFIX}:${workspaceId}`;
}

function isWorkbenchTab(value: unknown): value is WorkbenchTab {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'string' && typeof row.kind === 'string' && typeof row.label === 'string'
  );
}

function restoredWorkbenchState(workspaceId: string): {
  tabs: WorkbenchTab[];
  activeTabId: string;
} {
  if (typeof window === 'undefined') return { tabs: [sessionTab], activeTabId: sessionTab.id };
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(workbenchTabsStorageKey(workspaceId)) ?? 'null',
    ) as unknown;
    if (!parsed || typeof parsed !== 'object')
      return { tabs: [sessionTab], activeTabId: sessionTab.id };
    const record = parsed as Record<string, unknown>;
    const storedTabs = Array.isArray(record.tabs) ? record.tabs.filter(isWorkbenchTab) : [];
    const tabs = storedTabs.length ? storedTabs : [sessionTab];
    const requestedActive = typeof record.activeTabId === 'string' ? record.activeTabId : '';
    return {
      tabs,
      activeTabId: tabs.some((tab) => tab.id === requestedActive) ? requestedActive : tabs[0].id,
    };
  } catch {
    return { tabs: [sessionTab], activeTabId: sessionTab.id };
  }
}

const workbenchTabId = (tab: WorkbenchTab) => tab.id;
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
  work: { id: 'work', kind: 'work', label: 'Work' },
  session: sessionTab,
  files: fileBrowserTab,
  artifacts: artifactBrowserTab,
  blueprints: blueprintBrowserTab,
  resources: resourceBrowserTab,
} satisfies Record<CanvasResourceKind, WorkbenchTab>;

const workbenchTabIcons = {
  work: ActivityIcon,
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
  workflow: WorkflowIcon,
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
      subagents = [],
      requestedOpen,
    },
    ref,
  ) {
    // Lazy useState initializer (not useRef().current, which reads a ref
    // during render) computes the restored state exactly once.
    const [initialState] = useState(() => restoredWorkbenchState(workspaceId));
    const [tabs, setTabs] = useState<WorkbenchTab[]>(initialState.tabs);
    const [activeTabId, setActiveTabId] = useState<string>(initialState.activeTabId);
    const [maximized, setMaximized] = useState(false);
    const activeTabRef = useRef<HTMLDivElement>(null);
    const tabStripRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      window.localStorage.setItem(
        workbenchTabsStorageKey(workspaceId),
        JSON.stringify({ activeTabId, tabs }),
      );
    }, [activeTabId, tabs, workspaceId]);

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
    const selectFilesPath = useCallback((tabId: string, path: string) => {
      setTabs((current) =>
        current.map((candidate) =>
          candidate.id === tabId && candidate.kind === 'files' ? { ...candidate, path } : candidate,
        ),
      );
    }, []);
    const selectWorkspaceFilePath = useCallback((tabId: string, path: string) => {
      setTabs((current) =>
        current.map((candidate) =>
          candidate.id === tabId && candidate.kind === 'workspace-file'
            ? { ...candidate, label: fileName(path), path }
            : candidate,
        ),
      );
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
              relatedResources: request.relatedResources ?? [request.resource],
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
          case 'workflow': {
            const descriptor = workflowDescriptor(request.tool);
            openTab({
              id: `workflow:${request.tool.id}`,
              kind: 'workflow',
              label: descriptor?.label ?? request.tool.title ?? 'Workflow',
              tool: request.tool,
              workspaceId,
            });
            return;
          }
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
              <Sortable
                asChild
                getItemValue={workbenchTabId}
                onValueChange={setTabs}
                strategy="horizontal"
                value={tabs}
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
                      // dnd-kit's useSortable defaults this element's role to
                      // "button" (drag keyboard activation) via {...attributes};
                      // that or an explicit role="presentation" both become a
                      // disallowed direct child of the TabsList's
                      // role="tablist" (axe aria-required-children, critical)
                      // and sever the required tablist->tab parent
                      // relationship for the real TabsTrigger nested inside
                      // (aria-required-parent). This wrapper does not need
                      // dnd-kit's own interactive semantics at all: the drag
                      // handle is SortableItemHandle on the TabsTrigger below,
                      // which only takes {...listeners} (the pointer/keyboard
                      // drag activation), never {...attributes}. Overriding
                      // every ARIA attribute {...attributes} sets to undefined
                      // (props spread after attributes) drops them from the
                      // DOM entirely, leaving a plain, role-less div the
                      // tablist does not enumerate as an owned child.
                      <SortableItem
                        aria-describedby={undefined}
                        aria-disabled={undefined}
                        aria-roledescription={undefined}
                        asChild
                        key={tab.id}
                        role={undefined}
                        tabIndex={undefined}
                        value={tab.id}
                      >
                        <div
                          className="group/canvas-tab relative flex min-w-24 max-w-56 shrink-0"
                          ref={active ? activeTabRef : undefined}
                        >
                          <SortableItemHandle asChild>
                            <TabsTrigger
                              aria-keyshortcuts="Delete Alt+ArrowLeft Alt+ArrowRight"
                              className={cn(
                                'h-8 w-full justify-start rounded-lg border-transparent bg-transparent py-0.5 pr-8 pl-2 transition-colors data-active:border-transparent data-active:bg-muted data-active:text-foreground data-active:shadow-sm dark:data-active:border-transparent dark:data-active:bg-muted',
                                active
                                  ? 'text-foreground'
                                  : 'text-muted-foreground hover:bg-muted/55 hover:text-foreground',
                              )}
                              onAuxClick={(event) => {
                                if (event.button !== 1) return;
                                event.preventDefault();
                                event.stopPropagation();
                                closeTab(tab.id);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Delete') {
                                  event.preventDefault();
                                  closeTab(tab.id);
                                  return;
                                }
                                if (
                                  !event.altKey ||
                                  (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
                                )
                                  return;
                                event.preventDefault();
                                setTabs((current) => {
                                  const index = current.findIndex((item) => item.id === tab.id);
                                  const target = Math.max(
                                    0,
                                    Math.min(
                                      current.length - 1,
                                      index + (event.key === 'ArrowLeft' ? -1 : 1),
                                    ),
                                  );
                                  if (index < 0 || index === target) return current;
                                  const next = [...current];
                                  const [moved] = next.splice(index, 1);
                                  next.splice(target, 0, moved);
                                  return next;
                                });
                              }}
                              value={tab.id}
                            >
                              <TabIcon kind={tab.kind} />
                              <span className="truncate">{tab.label}</span>
                            </TabsTrigger>
                          </SortableItemHandle>
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
                      </SortableItem>
                    );
                  })}
                </TabsList>
              </Sortable>
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
                  <WorkbenchTabContent
                    artifacts={artifacts}
                    artifactsError={artifactsError}
                    artifactsPending={artifactsPending}
                    artifactsTruncated={artifactsTruncated}
                    blueprints={blueprints}
                    blueprintsError={blueprintsError}
                    blueprintsPending={blueprintsPending}
                    diffActionError={diffActionError}
                    diffActionPending={diffActionPending}
                    diffs={diffs}
                    files={files}
                    filesError={filesError}
                    filesPending={filesPending}
                    maximized={maximized}
                    onApplyDiff={onApplyDiff}
                    onOpenSubagent={onOpenSubagent}
                    onOpenTab={openTab}
                    onRejectDiff={onRejectDiff}
                    onReplaceTab={replaceTab}
                    onSelectFilesPath={selectFilesPath}
                    onSelectWorkspaceFilePath={selectWorkspaceFilePath}
                    resources={resources}
                    resourcesError={resourcesError}
                    resourcesPending={resourcesPending}
                    sessionId={sessionId}
                    sessionView={sessionView}
                    subagents={subagents}
                    tab={tab}
                    workspaceId={workspaceId}
                  />
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
