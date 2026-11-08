import type {
  Artifact as ArtifactEntity,
  BrowserPage,
  SessionDiff,
  SubagentRun,
  WorkspaceFileEntry,
  WorkspaceResource,
} from '@clio/core/v3';
import {
  ActivityIcon,
  BotIcon,
  BoxIcon,
  FlaskConicalIcon,
  FolderIcon,
  GlobeIcon,
  Maximize2Icon,
  Minimize2Icon,
  PaperclipIcon,
  TerminalSquareIcon,
} from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Root as DismissableLayer } from '@radix-ui/react-dismissable-layer';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useShortcut } from '@/lib/shortcuts/hooks';
import { cn } from '@/lib/utils';
import { closeEmbeddedTerminalTab } from '@/tauri/workspace-terminal';
import { IconButton } from './primitives/icon-button';
import { focusQuietly } from './primitives/quiet-focus';
import { StateView } from './primitives/state-view';
import type { SubagentOpenTarget } from './subagent-card';
import { useWorkspaceCanvasVisibility } from './workspace-canvas-visibility-context';
import { WorkbenchTabErrorBoundary } from './workbench-tab-error-boundary';
import type { CanvasResourceKind } from './canvas-launcher';
import { WorkbenchTabContent } from './workbench-tab-content';
import { tabForOpenRequest, type ClioWorkbenchOpenRequest } from './workbench-open-request';
import {
  changedPathSet,
  fileName,
  loadResourceViewers,
  type WorkbenchTab,
} from './workbench-shared';
import { PresentationNavigation } from './presentation-navigation';
import {
  htmlBrowserTarget,
  OPEN_FILE_IN_BROWSER_EVENT,
  type OpenFileInBrowserDetail,
} from '@/lib/html-in-browser';
import { useWorkbenchTabVisibility } from './use-workbench-tab-visibility';
import { scienceLogTab, useScienceLogTab } from './science-log-tab-state';
import { workbenchTabPath } from './workbench-tab-icons';
import {
  agentTab,
  restoredWorkbenchState,
  saveWorkbenchState,
  sessionTab,
  workTab,
} from './workbench-tab-storage';
import { WorkbenchTabRow } from './workbench-tab-row';
import { WorkbenchStrip, type WorkbenchListView, type WorkbenchStripItem } from './workbench-strip';
import { WorkbenchListColumn } from './workbench-list-column';

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
  /** The session belongs to a study (its science log read says so); unknown hides the tab. */
  inStudy?: boolean;
}

export type { ClioWorkbenchOpenRequest } from './workbench-open-request';

export interface ClioWorkbenchHandle {
  open: (request: ClioWorkbenchOpenRequest) => void;
}

/** Below this the list column lays over the tab instead of beside it. */
const LIST_OVERLAY_BELOW = 520;
const RUNNING_STATES = new Set<SubagentRun['state']>(['queued', 'running', 'recovering']);

function parentDirectory(path: string): string {
  const index = path.lastIndexOf('/');
  return index > 0 ? path.slice(0, index) : '';
}

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
      inStudy,
    },
    ref,
  ) {
    // Lazy useState initializer (not useRef().current, which reads a ref
    // during render) computes the restored state exactly once.
    const [initialState] = useState(() => restoredWorkbenchState(workspaceId, Boolean(sessionId)));
    const [tabs, setTabs] = useState<WorkbenchTab[]>(initialState.tabs);
    const [activeTabId, setActiveTabId] = useState<string>(initialState.activeTabId);
    const [listView, setListView] = useState<WorkbenchListView | undefined>(initialState.listView);
    const [listDirectory, setListDirectory] = useState<string>();
    const [pinnedIds, setPinnedIds] = useState<string[]>(initialState.pinnedIds);
    // Unknown until the panel is first measured.
    const [narrow, setNarrow] = useState<boolean>();
    // Over a narrow panel the list lays over the tab: open only after a pick on the strip.
    const [overlayOpen, setOverlayOpen] = useState(false);
    const [maximized, setMaximized] = useState(false);
    const [maximizeHost, setMaximizeHost] = useState<Element | null>(null);
    const asideRef = useRef<HTMLElement>(null);
    const maximizeButtonRef = useRef<HTMLButtonElement>(null);
    const activeTabRef = useRef<HTMLDivElement>(null);
    const tabStripRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      saveWorkbenchState(workspaceId, { activeTabId, tabs, listView, pinnedIds });
    }, [activeTabId, listView, pinnedIds, tabs, workspaceId]);

    useEffect(() => {
      const aside = asideRef.current;
      if (!aside) return;
      const update = () => {
        // A hidden panel measures 0: keep the last known width class.
        if (aside.clientWidth > 0) setNarrow(aside.clientWidth < LIST_OVERLAY_BELOW);
      };
      update();
      const observer = new ResizeObserver(update);
      observer.observe(aside);
      return () => observer.disconnect();
    }, [maximized]);

    // A list shown beside the tabs does not turn into an overlay when the panel narrows.
    const [overlayNarrow, setOverlayNarrow] = useState(narrow);
    if (overlayNarrow !== narrow) {
      if (overlayNarrow !== undefined) setOverlayOpen(false);
      setOverlayNarrow(narrow);
    }

    const study = useScienceLogTab(inStudy, sessionId, tabs, setTabs, activeTabId);
    const shown = study;
    const pinned = useMemo(() => new Set(pinnedIds), [pinnedIds]);
    const orderedTabs = useMemo(
      () => [
        ...shown.tabs.filter((tab) => pinned.has(tab.id)),
        ...shown.tabs.filter((tab) => !pinned.has(tab.id)),
      ],
      [pinned, shown.tabs],
    );
    const activeTab = orderedTabs.find((tab) => tab.id === shown.activeTabId);
    // An empty narrow panel shows its list rather than nothing.
    const listShown = listView !== undefined && (!narrow || overlayOpen || !activeTab);
    const changedPaths = useMemo(() => changedPathSet(diffs), [diffs]);

    // `TabsContent` unmounts inactive panels (Radix Presence, no forceMount),
    // so "the Files list is showing, or a foreign workspace's Files tab is
    // active" is exactly "a file tree is mounted" -- the signal
    // use-workspace-data.ts gates its poll on (refetchInterval).
    const filesViewActive = (listShown && listView === 'files') || activeTab?.kind === 'files';
    useEffect(() => {
      onFilesViewActiveChange?.(filesViewActive);
      return () => onFilesViewActiveChange?.(false);
    }, [filesViewActive, onFilesViewActiveChange]);

    useWorkbenchTabVisibility(tabStripRef, activeTabRef, shown.activeTabId, orderedTabs, maximized);

    const showList = useCallback((view: WorkbenchListView) => {
      setListView(view);
      setOverlayOpen(true);
    }, []);
    const afterListPick = useCallback(() => {
      if (narrow) setOverlayOpen(false);
    }, [narrow]);

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
    const closeTabs = (ids: readonly string[]) => {
      if (!ids.length) return;
      const closing = new Set(ids);
      const index = orderedTabs.findIndex((tab) => tab.id === shown.activeTabId);
      const next = tabs.filter((tab) => !closing.has(tab.id));
      setTabs(next);
      setPinnedIds((current) => current.filter((id) => !closing.has(id)));
      for (const tab of tabs) {
        // The pty and its xterm instance live in the module-level registry,
        // keyed by tab id — a closed tab is the one place that registry
        // entry is ever explicitly torn down (a mere unmount, e.g. switching
        // tabs, must not kill a running job).
        if (closing.has(tab.id) && tab.kind === 'terminal') void closeEmbeddedTerminalTab(tab.id);
      }
      if (closing.has(shown.activeTabId)) {
        const before = orderedTabs.slice(0, Math.max(0, index)).reverse();
        const after = orderedTabs.slice(index + 1);
        const fallback = [...before, ...after].find((tab) => !closing.has(tab.id));
        setActiveTabId(fallback?.id ?? '');
      }
    };
    const closeTab = (tabId: string) => closeTabs([tabId]);
    const moveTab = (tabId: string, delta: -1 | 1) => {
      const index = orderedTabs.findIndex((tab) => tab.id === tabId);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= orderedTabs.length) return;
      const next = [...orderedTabs];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      setTabs(next);
    };
    const stepTab = (delta: -1 | 1) => {
      if (orderedTabs.length < 2) return;
      const index = orderedTabs.findIndex((tab) => tab.id === shown.activeTabId);
      const next = orderedTabs[(index + delta + orderedTabs.length) % orderedTabs.length];
      setActiveTabId(next.id);
    };
    const canvasVisible = useWorkspaceCanvasVisibility();

    const openCanvasResource = useCallback(
      (kind: CanvasResourceKind) => {
        switch (kind) {
          case 'files':
            showList('files');
            return;
          case 'resources':
            showList('sources');
            return;
          case 'artifacts':
            void loadResourceViewers();
            showList('artifacts');
            return;
          case 'session':
            openTab(sessionTab);
            return;
          case 'work':
            openTab(workTab);
            return;
          case 'agent':
            openTab(agentTab);
            return;
          case 'science-log':
            openTab(scienceLogTab);
            return;
        }
      },
      [openTab, showList],
    );
    const showFolder = useCallback(
      (directory: string) => {
        setListDirectory(directory === '.' ? '' : directory);
        showList('files');
      },
      [showList],
    );

    const openRequest = useCallback(
      (request: ClioWorkbenchOpenRequest, targetWorkspaceId: string = workspaceId) => {
        switch (request.kind) {
          case 'subagent':
            openSubagentTab(request.subagent);
            return;
          case 'resources':
            openCanvasResource(request.section ?? 'files');
            return;
          case 'session':
            openTab(sessionTab);
            return;
          case 'science-log':
            openTab(scienceLogTab);
            return;
          case 'workspace-folder':
            if ((request.workspaceId ?? targetWorkspaceId) === workspaceId) {
              showFolder(request.path);
              return;
            }
            openTab(tabForOpenRequest(request, sessionId, workspaceId, targetWorkspaceId));
            return;
          default: {
            const html = htmlBrowserTarget(request); // HTML files open in the shared browser
            if (html && targetWorkspaceId === workspaceId) {
              window.dispatchEvent(
                new CustomEvent<OpenFileInBrowserDetail>(OPEN_FILE_IN_BROWSER_EVENT, {
                  detail: {
                    target: html,
                    sessionId,
                    label: 'path' in html ? fileName(html.path) : 'HTML file',
                  },
                }),
              );
              return;
            }
            openTab(tabForOpenRequest(request, sessionId, workspaceId, targetWorkspaceId));
          }
        }
      },
      [openCanvasResource, openSubagentTab, openTab, sessionId, showFolder, workspaceId],
    );

    useImperativeHandle(ref, () => ({ open: openRequest }), [openRequest]);

    const toggleMaximized = (trigger?: Element | null) => {
      setMaximizeHost(trigger?.closest('[data-slot=sheet-content]') ?? document.body);
      setMaximized((value) => !value);
    };

    const runningSubagents = subagents.filter((run) => RUNNING_STATES.has(run.state)).length;
    const stripItems: WorkbenchStripItem[] = [];
    const listItem = (id: WorkbenchListView, label: string, icon: ReactNode, count?: number) =>
      stripItems.push({
        id,
        label,
        icon,
        position: stripItems.filter((item) => item.position).length + 1,
        pressed: listShown && listView === id,
        count,
      });
    listItem('files', 'Files', <FolderIcon />);
    listItem('sources', 'Sources', <PaperclipIcon />);
    listItem('artifacts', 'Artifacts', <BoxIcon />);
    listItem('activity', 'Activity', <ActivityIcon />, runningSubagents);
    stripItems.push({
      id: 'agent',
      label: 'Agent',
      icon: <BotIcon />,
      position: 5,
      pressed: shown.activeTabId === agentTab.id,
    });
    if (inStudy === true)
      stripItems.push({
        id: 'science-log',
        label: 'Science log',
        icon: <FlaskConicalIcon />,
        pressed: shown.activeTabId === scienceLogTab.id,
      });
    if (onOpenTerminal) listItem('terminal', 'Terminal', <TerminalSquareIcon />);
    listItem('browser', 'Browser pages', <GlobeIcon />);

    const selectStripItem = (id: WorkbenchStripItem['id']) => {
      if (id === 'agent') {
        openTab(agentTab);
        return;
      }
      if (id === 'science-log') {
        openTab(scienceLogTab);
        return;
      }
      if (listShown && listView === id) {
        setListView(undefined);
        setOverlayOpen(false);
        return;
      }
      if (id === 'artifacts') void loadResourceViewers();
      showList(id);
    };

    useShortcut('strip-position', (_event, position) => {
      const item = stripItems.find((candidate) => candidate.position === position);
      if (item) selectStripItem(item.id);
    });
    useShortcut('terminal', () => onOpenTerminal?.(), { enabled: Boolean(onOpenTerminal) });
    useShortcut('new-terminal', () => onOpenTerminal?.(), { enabled: Boolean(onOpenTerminal) });
    useShortcut('previous-tab', () => stepTab(-1), { region: asideRef });
    useShortcut('next-tab', () => stepTab(1), { region: asideRef });
    useShortcut('maximize', () => toggleMaximized(maximizeButtonRef.current), {
      region: asideRef,
    });

    const list = listShown ? (
      <WorkbenchListColumn
        activeTabId={shown.activeTabId}
        artifacts={artifacts}
        artifactsError={artifactsError}
        artifactsPending={artifactsPending}
        artifactsTruncated={artifactsTruncated}
        changedPaths={changedPaths}
        directory={listDirectory}
        files={files}
        filesError={filesError}
        filesFetching={filesFetching}
        filesNextOffset={filesNextOffset}
        filesPending={filesPending}
        filesTruncated={filesTruncated}
        finishedWorkHidden={finishedWorkHidden}
        onClearDirectory={() => setListDirectory('')}
        onHide={() => {
          setListView(undefined);
          setOverlayOpen(false);
        }}
        onOpenActivity={() => {
          openTab(sessionTab);
          afterListPick();
        }}
        onOpenArtifact={(artifact) => {
          openRequest({ kind: 'artifact', artifact });
          afterListPick();
        }}
        onOpenBrowserPage={(page: BrowserPage) => {
          openRequest({
            kind: 'browser',
            pageId: page.id,
            sessionId: page.session_id,
            label: page.label,
          });
          afterListPick();
        }}
        onOpenFile={(path) => {
          // A picked file always gets its tab, even HTML: its viewer opens the
          // shared browser on show and keeps the source if that fails.
          openTab(
            tabForOpenRequest(
              { kind: 'workspace-file', path },
              sessionId,
              workspaceId,
              workspaceId,
            ),
          );
          afterListPick();
        }}
        onOpenResource={(resource) => {
          openRequest({ kind: 'resource', resource, relatedResources: resources });
          afterListPick();
        }}
        onOpenSubagent={(subagent) => {
          openSubagentTab(subagent);
          afterListPick();
        }}
        onOpenTerminal={
          onOpenTerminal
            ? () => {
                onOpenTerminal();
                afterListPick();
              }
            : undefined
        }
        onOpenWork={() => {
          openTab(workTab);
          afterListPick();
        }}
        onRefreshFiles={onRefreshFiles}
        onSelectTab={(tabId) => {
          setActiveTabId(tabId);
          afterListPick();
        }}
        overlay={narrow === true}
        resources={resources}
        resourcesError={resourcesError}
        resourcesPending={resourcesPending}
        sessionId={sessionId}
        subagents={subagents}
        tabs={orderedTabs}
        view={listView}
        workspaceId={workspaceId}
      />
    ) : null;

    const canvas = (
      <aside
        aria-label="Workspace canvas"
        data-maximized={maximized || undefined}
        ref={asideRef}
        className={cn(
          'relative z-30 flex h-full min-w-0 flex-row bg-card/45',
          maximized && 'fixed inset-0 z-[80] bg-background shadow-2xl',
        )}
      >
        <TooltipProvider delayDuration={450}>
          <Tabs
            className="min-h-0 min-w-0 flex-1 gap-0"
            onValueChange={setActiveTabId}
            value={shown.activeTabId}
          >
            <WorkbenchTabRow
              activeTabId={shown.activeTabId}
              activeTabRef={activeTabRef}
              changedPaths={changedPaths}
              onClose={closeTab}
              onCloseOthers={(tabId) =>
                closeTabs(
                  orderedTabs
                    .filter((tab) => tab.id !== tabId && !pinned.has(tab.id))
                    .map((tab) => tab.id),
                )
              }
              onCloseToRight={(tabId) =>
                closeTabs(
                  orderedTabs
                    .slice(orderedTabs.findIndex((tab) => tab.id === tabId) + 1)
                    .filter((tab) => !pinned.has(tab.id))
                    .map((tab) => tab.id),
                )
              }
              onMove={moveTab}
              onReorder={setTabs}
              onSelect={setActiveTabId}
              onShowInFiles={(tab) => {
                const path = workbenchTabPath(tab);
                if (path === undefined) return;
                openRequest({
                  kind: 'workspace-folder',
                  path: parentDirectory(path),
                  workspaceId: 'workspaceId' in tab ? tab.workspaceId : workspaceId,
                });
              }}
              onTogglePin={(tabId) =>
                setPinnedIds((current) =>
                  current.includes(tabId)
                    ? current.filter((id) => id !== tabId)
                    : [...current, tabId],
                )
              }
              pinnedIds={pinned}
              stripRef={tabStripRef}
              tabs={orderedTabs}
              trailing={
                <IconButton
                  icon={maximized ? <Minimize2Icon /> : <Maximize2Icon />}
                  label={maximized ? 'Restore canvas beside conversation' : 'Maximize canvas'}
                  onClick={(event) => toggleMaximized(event.currentTarget)}
                  ref={maximizeButtonRef}
                  shortcut="maximize"
                  tooltipSide="bottom"
                />
              }
            />
            {orderedTabs.map((tab) => (
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
                        onShowFolder={showFolder}
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
            {orderedTabs.length === 0 ? (
              <StateView
                className="h-full"
                detail="Pick a list on the strip, or open a file from the conversation."
                kind="empty"
                size="panel"
                title="No tabs open"
              />
            ) : null}
          </Tabs>
          {list}
          <WorkbenchStrip items={stripItems} onSelect={selectStripItem} />
        </TooltipProvider>
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
                  requestAnimationFrame(() => focusQuietly(maximizeButtonRef.current));
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
  // request instead of silently showing only the default Activity tab.
  useEffect(() => {
    if (requestedOpen) onOpen(requestedOpen.request);
  }, [onOpen, requestedOpen]);
  return null;
}
