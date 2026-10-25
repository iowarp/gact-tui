import type {
  Artifact as ArtifactEntity,
  SessionDiff,
  SubagentRun,
  WorkspaceFileEntry,
  WorkspaceResource,
} from '@clio/core/v3';
import {
  ActivityIcon,
  BotIcon,
  BoxesIcon,
  BoxIcon,
  FileCode2Icon,
  FileDiffIcon,
  FolderIcon,
  Layers3Icon,
  Maximize2Icon,
  Minimize2Icon,
  PaperclipIcon,
  TerminalSquareIcon,
  WorkflowIcon,
} from 'lucide-react';
import { CloseIcon } from '@/lib/icon-vocabulary';
import { ArtifactTypeIcon } from './artifact-type-icon';
import { artifactDisplayName } from '@/lib/dashboard-presentation';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
  type ComponentType,
} from 'react';
import { createPortal } from 'react-dom';
import { Root as DismissableLayer } from '@radix-ui/react-dismissable-layer';
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
import { closeEmbeddedTerminalTab } from '@/tauri/workspace-terminal';
import type { SubagentOpenTarget } from './subagent-card';
import { useWorkspaceCanvasVisibility } from './workspace-canvas-visibility-context';
import { WorkbenchTabErrorBoundary } from './workbench-tab-error-boundary';
import { CanvasLauncher, type CanvasResourceKind } from './workbench-resource-browser';
import { WorkbenchTabContent } from './workbench-tab-content';
import { assertNever, fileName, loadResourceViewers, type WorkbenchTab } from './workbench-shared';
import { PresentationNavigation } from './presentation-navigation';
import { workspaceFilePath } from '@/lib/workspace-file-path';
import { useLiveStore } from '@/store/live-store';
import { useWorkbenchTabVisibility } from './use-workbench-tab-visibility';

export interface ClioWorkbenchProps {
  workspaceId: string;
  sessionId: string;
  files: readonly WorkspaceFileEntry[];
  filesPending?: boolean;
  filesFetching?: boolean;
  filesError?: string;
  filesTruncated?: boolean;
  filesNextOffset?: number | null;
  onRefreshFiles?: () => void;
  onFilesViewActiveChange?: (active: boolean) => void;
  artifacts: readonly ArtifactEntity[];
  artifactsPending?: boolean;
  artifactsError?: string;
  artifactsTruncated?: 'page_cap_reached' | 'cursor_cycle_detected';
  resources?: readonly WorkspaceResource[];
  resourcesPending?: boolean;
  resourcesError?: string;
  diffs: readonly SessionDiff[];
  diffActionError?: string;
  diffActionPending?: boolean;
  sessionView: ReactNode;
  /** The Agent tab before the conversation exists (a new conversation's draft agent). */
  agentView?: ReactNode;
  onOpenTerminal?: () => void;
  onOpenSubagent: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
  onUndoDiff: (sessionId: string, workspaceId: string, changeId: string) => Promise<unknown>;
  subagents?: readonly SubagentRun[];
  /** Finished child agents are not loaded yet (they sit behind Show completed work). */
  finishedWorkHidden?: boolean;
  requestedOpen?: { key: string; request: ClioWorkbenchOpenRequest };
}

export type ClioWorkbenchOpenRequest =
  | { kind: 'knowledge'; sourceId: string; label: string }
  | { kind: 'workspace-file'; path: string; workspaceId?: string; line?: number; find?: string }
  | { kind: 'workspace-folder'; path: string; workspaceId?: string }
  | { kind: 'diff'; diff: SessionDiff }
  | { kind: 'artifact'; artifact: ArtifactEntity }
  | {
      kind: 'resource';
      resource: WorkspaceResource;
      relatedResources?: readonly WorkspaceResource[];
    }
  | { kind: 'subagent'; subagent: SubagentRun }
  /** A flow run (a workflow, a council, ...) recorded under the task `handle`. */
  | { kind: 'flow'; handle: string; label?: string }
  | { kind: 'resources'; section?: Exclude<CanvasResourceKind, 'session'> }
  | { kind: 'session' }
  | { kind: 'terminal'; cwd: string };

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
    typeof row.id === 'string' &&
    typeof row.kind === 'string' &&
    row.kind in workbenchTabIcons &&
    typeof row.label === 'string'
  );
}

function restoredWorkbenchState(
  workspaceId: string,
  hasSession = true,
): {
  tabs: WorkbenchTab[];
  activeTabId: string;
} {
  const defaultTab = hasSession ? sessionTab : fileBrowserTab;
  if (typeof window === 'undefined') return { tabs: [defaultTab], activeTabId: defaultTab.id };
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(workbenchTabsStorageKey(workspaceId)) ?? 'null',
    ) as unknown;
    if (!parsed || typeof parsed !== 'object')
      return { tabs: [defaultTab], activeTabId: defaultTab.id };
    const record = parsed as Record<string, unknown>;
    const storedTabs = Array.isArray(record.tabs)
      ? record.tabs
          .filter(isWorkbenchTab)
          .map((tab) =>
            tab.kind === 'knowledge'
              ? { ...tab, label: tab.label.replace(/ · Knowledge$/, '') }
              : tab,
          )
      : [];
    const tabs = storedTabs.length ? storedTabs : [defaultTab];
    const requestedActive = typeof record.activeTabId === 'string' ? record.activeTabId : '';
    return {
      tabs,
      activeTabId: tabs.some((tab) => tab.id === requestedActive) ? requestedActive : tabs[0].id,
    };
  } catch {
    return { tabs: [defaultTab], activeTabId: defaultTab.id };
  }
}

const workbenchTabId = (tab: WorkbenchTab) => tab.id;
const fileBrowserTab: WorkbenchTab = { id: 'files', kind: 'files', label: 'Files' };
const artifactBrowserTab: WorkbenchTab = {
  id: 'artifacts',
  kind: 'artifacts',
  label: 'Artifacts',
};
const agentTab: WorkbenchTab = { id: 'agent', kind: 'agent', label: 'Agent' };
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
  agent: agentTab,
  resources: resourceBrowserTab,
} satisfies Record<CanvasResourceKind, WorkbenchTab>;

const workbenchTabIcons = {
  knowledge: BoxesIcon,
  work: ActivityIcon,
  session: ActivityIcon,
  files: FolderIcon,
  artifacts: BoxIcon,
  agent: BotIcon,
  resources: PaperclipIcon,
  'workspace-file': FileCode2Icon,
  diff: FileDiffIcon,
  artifact: BoxIcon,
  resource: PaperclipIcon,
  subagent: BoxesIcon,
  flow: WorkflowIcon,
  terminal: TerminalSquareIcon,
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
      filesFetching,
      filesError,
      filesTruncated,
      filesNextOffset,
      onRefreshFiles,
      onFilesViewActiveChange,
      artifacts,
      artifactsPending,
      artifactsError,
      artifactsTruncated,
      resources = [],
      resourcesPending,
      resourcesError,
      diffs,
      diffActionError,
      diffActionPending,
      sessionView,
      agentView,
      onOpenTerminal,
      onOpenSubagent,
      onUndoDiff,
      subagents = [],
      finishedWorkHidden = false,
      requestedOpen,
    },
    ref,
  ) {
    // Lazy useState initializer (not useRef().current, which reads a ref
    // during render) computes the restored state exactly once.
    const [initialState] = useState(() => restoredWorkbenchState(workspaceId, Boolean(sessionId)));
    const [tabs, setTabs] = useState<WorkbenchTab[]>(initialState.tabs);
    const [activeTabId, setActiveTabId] = useState<string>(initialState.activeTabId);
    const [maximized, setMaximized] = useState(false);
    const [maximizeHost, setMaximizeHost] = useState<Element | null>(null);
    const maximizeButtonRef = useRef<HTMLButtonElement>(null);
    const activeTabRef = useRef<HTMLDivElement>(null);
    const tabStripRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      window.localStorage.setItem(
        workbenchTabsStorageKey(workspaceId),
        JSON.stringify({ activeTabId, tabs }),
      );
    }, [activeTabId, tabs, workspaceId]);

    // `TabsContent` unmounts inactive panels (Radix Presence, no forceMount),
    // so the fixed-id 'files' tab being ACTIVE is exactly "the Files view is
    // mounted" -- the signal use-workspace-data.ts gates its poll on
    // (refetchInterval), rather than polling for every open session regardless
    // of which tab is showing.
    useEffect(() => {
      onFilesViewActiveChange?.(activeTabId === 'files');
      return () => onFilesViewActiveChange?.(false);
    }, [activeTabId, onFilesViewActiveChange]);

    useWorkbenchTabVisibility(tabStripRef, activeTabRef, activeTabId, tabs, maximized);

    const openTab = useCallback((tab: WorkbenchTab) => {
      setTabs((current) =>
        current.some((item) => item.id === tab.id)
          ? current.map((item) => (item.id === tab.id ? tab : item))
          : [...current, tab],
      );
      setActiveTabId(tab.id);
    }, []);
    const openSubagentTab = useCallback(
      (subagent: SubagentRun) =>
        openTab({
          id: `subagent:${subagent.child_session_id ?? subagent.id}`,
          kind: 'subagent',
          label: subagent.title,
          subagent,
          workspaceId,
        }),
      [openTab, workspaceId],
    );
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
            ? { ...candidate, label: fileName(path), path, line: undefined, find: undefined }
            : candidate,
        ),
      );
    }, []);
    const closeTab = (tabId: string) => {
      const index = tabs.findIndex((tab) => tab.id === tabId);
      const closed = tabs[index];
      const next = tabs.filter((tab) => tab.id !== tabId);
      setTabs(next);
      // The pty and its xterm instance live in the module-level registry,
      // keyed by tab id — a closed tab is the one place that registry
      // entry is ever explicitly torn down (a mere unmount, e.g. switching
      // tabs, must not kill a running job).
      if (closed && closed.kind === 'terminal') void closeEmbeddedTerminalTab(closed.id);
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
      (request: ClioWorkbenchOpenRequest, targetWorkspaceId: string = workspaceId) => {
        switch (request.kind) {
          case 'workspace-folder':
            targetWorkspaceId = request.workspaceId ?? targetWorkspaceId;
            openTab({
              id: targetWorkspaceId === workspaceId ? 'files' : `files:${targetWorkspaceId}`,
              kind: 'files',
              label: 'Files',
              workspaceId: targetWorkspaceId,
              directory: request.path === '.' ? '' : request.path,
            });
            return;
          case 'knowledge':
            openTab({
              id: `knowledge:${request.sourceId}`,
              kind: 'knowledge',
              sourceId: request.sourceId,
              label: request.label,
              workspaceId,
            });
            return;
          case 'workspace-file': {
            targetWorkspaceId = request.workspaceId ?? targetWorkspaceId;
            const root = useLiveStore.getState().entities.workspaces[targetWorkspaceId]?.path;
            const path = workspaceFilePath(request.path, root);
            openTab({
              id: `workspace-file:${targetWorkspaceId === workspaceId ? '' : `${targetWorkspaceId}:`}${path}`,
              kind: 'workspace-file',
              label: fileName(path),
              path,
              workspaceId: targetWorkspaceId,
              line: request.line,
              find: request.find,
            });
            return;
          }
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
              label: artifactDisplayName(request.artifact),
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
          case 'subagent':
            openSubagentTab(request.subagent);
            return;
          case 'flow':
            openTab({
              id: `flow:${request.handle}`,
              kind: 'flow',
              label: request.label ?? 'Flow run',
              handle: request.handle,
              sessionId,
              workspaceId,
            });
            return;
          case 'resources':
            openCanvasResource(request.section ?? 'files');
            return;
          case 'session':
            openTab(sessionTab);
            return;
          case 'terminal':
            openTab({
              id: `terminal:${sessionId}`,
              kind: 'terminal',
              label: 'Terminal',
              cwd: request.cwd,
              sessionId,
              workspaceId,
            });
            return;
          default:
            assertNever(request);
        }
      },
      [openCanvasResource, openSubagentTab, openTab, sessionId, workspaceId],
    );

    useImperativeHandle(ref, () => ({ open: openRequest }), [openRequest]);

    const canvas = (
      <aside
        aria-label="Workspace canvas"
        data-maximized={maximized || undefined}
        className={cn(
          'relative z-30 flex h-full min-w-0 flex-col bg-card/45',
          maximized && 'fixed inset-0 z-[80] bg-background shadow-2xl',
        )}
      >
        <Tabs className="min-h-0 flex-1 gap-0" onValueChange={setActiveTabId} value={activeTabId}>
          <div
            className="flex h-10 shrink-0 items-center gap-1 border-b bg-background/80 px-1.5"
            data-slot="canvas-header"
          >
            <div
              className="@container no-scrollbar min-w-0 flex-1 overflow-x-auto overflow-y-hidden data-[scrolled-start=true]:[mask-image:linear-gradient(to_right,transparent,black_2rem)]"
              ref={tabStripRef}
            >
              <Sortable
                asChild
                getItemValue={workbenchTabId}
                onValueChange={setTabs}
                strategy="horizontal"
                value={tabs}
              >
                <TabsList className="h-8 w-max justify-start gap-0.5 rounded-lg bg-transparent p-0.5">
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
                          className="group/canvas-tab relative flex min-w-[min(6rem,100cqw)] max-w-[min(14rem,100cqw)] shrink-0"
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
                              <TabIcon tab={tab} />
                              <span className="truncate">
                                {tab.kind === 'artifact'
                                  ? artifactDisplayName(tab.artifact)
                                  : tab.label}
                              </span>
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
                            title={`Close ${tab.kind === 'artifact' ? artifactDisplayName(tab.artifact) : tab.label}`}
                          >
                            <CloseIcon aria-hidden="true" className="size-3.5" />
                          </span>
                        </div>
                      </SortableItem>
                    );
                  })}
                </TabsList>
              </Sortable>
            </div>
            <CanvasLauncher
              onOpen={openCanvasResource}
              onOpenSubagent={openSubagentTab}
              onOpenTerminal={onOpenTerminal}
              subagents={subagents}
              finishedWorkHidden={finishedWorkHidden}
            />
            <Button
              aria-label={maximized ? 'Restore canvas beside conversation' : 'Maximize canvas'}
              ref={maximizeButtonRef}
              className="relative z-10 size-7 shrink-0 rounded-md"
              onClick={(event) => {
                setMaximizeHost(
                  event.currentTarget.closest('[data-slot=sheet-content]') ?? document.body,
                );
                setMaximized((value) => !value);
              }}
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
                  <PresentationNavigation.Provider
                    value={{
                      workspaceId: 'workspaceId' in tab ? tab.workspaceId : workspaceId,
                      sessionId,
                      artifacts: Object.fromEntries(artifacts.map((item) => [item.id, item])),
                      resources: Object.fromEntries(resources.map((item) => [item.id, item])),
                      subagents: Object.fromEntries(subagents.map((item) => [item.id, item])),
                      onOpenFile: (path) =>
                        openRequest(
                          { kind: 'workspace-file', path },
                          'workspaceId' in tab ? tab.workspaceId : workspaceId,
                        ),
                      onOpenFolder: (path) =>
                        openRequest(
                          { kind: 'workspace-folder', path },
                          'workspaceId' in tab ? tab.workspaceId : workspaceId,
                        ),
                      onOpenFileReference: (path, location) =>
                        openRequest(
                          { ...location, kind: 'workspace-file', path },
                          'workspaceId' in tab ? tab.workspaceId : workspaceId,
                        ),
                      onOpenArtifact: (artifact) => openRequest({ kind: 'artifact', artifact }),
                      onOpenResource: (resource) => openRequest({ kind: 'resource', resource }),
                      onOpenSubagent,
                    }}
                  >
                    <WorkbenchTabContent
                      artifacts={artifacts}
                      artifactsError={artifactsError}
                      artifactsPending={artifactsPending}
                      artifactsTruncated={artifactsTruncated}
                      diffActionError={diffActionError}
                      diffActionPending={diffActionPending}
                      diffs={diffs}
                      files={files}
                      filesError={filesError}
                      filesFetching={filesFetching}
                      filesPending={filesPending}
                      filesTruncated={filesTruncated}
                      filesNextOffset={filesNextOffset}
                      maximized={maximized}
                      onOpenSubagent={onOpenSubagent}
                      onOpenTab={openTab}
                      onRefreshFiles={onRefreshFiles}
                      onUndoDiff={onUndoDiff}
                      onReplaceTab={replaceTab}
                      onSelectFilesPath={selectFilesPath}
                      onSelectWorkspaceFilePath={selectWorkspaceFilePath}
                      resources={resources}
                      resourcesError={resourcesError}
                      resourcesPending={resourcesPending}
                      sessionId={sessionId}
                      sessionView={sessionView}
                      agentView={agentView}
                      tab={tab}
                      workspaceId={workspaceId}
                    />
                  </PresentationNavigation.Provider>
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
                  Use the add button to open observability, files, resources, artifacts, or the
                  conversation&apos;s agent.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
        </Tabs>
      </aside>
    );

    return (
      <>
        {/* Keep request delivery outside the portal: maximizing remounts its
            contents and must not replay a previously handled open request. */}
        <WorkbenchRequestDispatcher onOpen={openRequest} requestedOpen={requestedOpen} />
        {maximized
          ? createPortal(
              <DismissableLayer
                asChild
                onEscapeKeyDown={(event) => {
                  // Closing a child can expose this layer during the same key
                  // event. A handled Escape must never dismiss its parent too.
                  if (event.defaultPrevented) return;
                  event.preventDefault();
                  setMaximized(false);
                  requestAnimationFrame(() => maximizeButtonRef.current?.focus());
                }}
                onInteractOutside={(event) => event.preventDefault()}
              >
                {canvas}
              </DismissableLayer>,
              maximizeHost ?? document.body,
            )
          : canvas}
      </>
    );
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

function TabIcon({ tab }: { tab: WorkbenchTab }) {
  if (tab.kind === 'artifact' && tab.artifact)
    return <ArtifactTypeIcon artifact={tab.artifact} className="size-3.5" />;
  const Icon = workbenchTabIcons[tab.kind];
  return <Icon aria-hidden="true" className="size-3.5" />;
}
