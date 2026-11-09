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
  useEffectEvent,
  useImperativeHandle,
  useLayoutEffect,
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
import { IconButton } from './primitives/icon-button';
import { focusQuietly } from './primitives/quiet-focus';
import { StateView } from './primitives/state-view';
import type { SubagentOpenTarget } from './subagent-card';
import {
  useWorkspaceCanvasControl,
  useWorkspaceCanvasVisibility,
} from './workspace-canvas-visibility-context';
import { WorkbenchTabErrorBoundary } from './workbench-tab-error-boundary';
import type { CanvasResourceKind } from './canvas-launcher';
import { WorkbenchTabContent } from './workbench-tab-content';
import { tabForOpenRequest, type ClioWorkbenchOpenRequest } from './workbench-open-request';
import { changedPathSet, fileName, loadResourceViewers } from './workbench-shared';
import { PresentationNavigation } from './presentation-navigation';
import {
  htmlBrowserTarget,
  OPEN_FILE_IN_BROWSER_EVENT,
  type OpenFileInBrowserDetail,
} from '@/lib/html-in-browser';
import { useWorkbenchRequest, type WorkbenchRequestSource } from '@/lib/workbench-request-store';
import { useWorkbenchTabVisibility } from './use-workbench-tab-visibility';
import { scienceLogTab } from './science-log-tab-state';
import { workbenchTabPath } from './workbench-tab-icons';
import { agentTab, sessionTab } from './workbench-tab-storage';
import { useWorkbenchTabState } from './use-workbench-tab-state';
import { WorkbenchTabRow } from './workbench-tab-row';
import { WorkbenchStrip, type WorkbenchListView, type WorkbenchStripItem } from './workbench-strip';
import { WorkbenchListColumn } from './workbench-list-column';
import { useWorkbenchTabListSlot } from './use-workbench-tab-list-slot';
import { WorkbenchTabListProvider } from './workbench-tab-list';

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
  /** Open requests from the page, read here so the page need not re-render. */
  requests?: WorkbenchRequestSource;
  /** The session belongs to a study (its science log read says so); unknown hides the tab. */
  inStudy?: boolean;
}

export type { ClioWorkbenchOpenRequest } from './workbench-open-request';

export interface ClioWorkbenchHandle {
  open: (request: ClioWorkbenchOpenRequest) => void;
}

// Beside the tabs down to the spec's laptop width (a 40% panel at 1280 keeps
// ~280px for the tab after the strip and the 36% list); narrower, the list is
// a sheet over the tab body.
const LIST_OVERLAY_BELOW = 440;
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
      requests,
      inStudy,
    },
    ref,
  ) {
    const {
      setTabs,
      orderedTabs,
      activeTabId,
      activeTab,
      setActiveTabId,
      pinned,
      setPinnedIds,
      listView,
      setListView,
      openTab,
      openSubagentTab,
      replaceTab,
      selectFilesPath,
      selectWorkspaceFilePath,
      closeTabs,
      closeTab,
      moveTab,
      stepTab,
    } = useWorkbenchTabState(workspaceId, sessionId, inStudy);
    const [listDirectory, setListDirectory] = useState<string>();
    // Unknown until the panel is first measured.
    const [narrow, setNarrow] = useState<boolean>();
    // Over a narrow panel the list lays over the tab: open only after a pick on the strip.
    const [overlayOpen, setOverlayOpen] = useState(false);
    const [maximized, setMaximized] = useState(false);
    // Tab bodies wait until the latest open request is delivered: revealing
    // the canvas must not mount the previous tab only to replace it.
    const subscribedRequest = useWorkbenchRequest(requests);
    const pendingRequest = requestedOpen ?? subscribedRequest;
    const [deliveredKey, setDeliveredKey] = useState<string>();
    const requestsSettled =
      deliveredKey !== undefined && (!pendingRequest || pendingRequest.key === deliveredKey);
    const [maximizeHost, setMaximizeHost] = useState<Element | null>(null);
    const asideRef = useRef<HTMLElement>(null);
    const maximizeButtonRef = useRef<HTMLButtonElement>(null);
    const activeTabRef = useRef<HTMLDivElement>(null);
    const tabStripRef = useRef<HTMLDivElement>(null);

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

    // An empty narrow panel shows its list rather than nothing.
    const listShown = listView !== undefined && (!narrow || overlayOpen || !activeTab);
    const hideStripList = useCallback(() => setListView(undefined), [setListView]);
    const tabList = useWorkbenchTabListSlot({
      narrow,
      activeTabId,
      stripListShown: listShown,
      hideStripList,
    });
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

    useWorkbenchTabVisibility(tabStripRef, activeTabRef, activeTabId, orderedTabs, maximized);

    const showList = useCallback(
      (view: WorkbenchListView) => {
        setListView(view);
        setOverlayOpen(true);
      },
      [setListView],
    );
    const afterListPick = useCallback(() => {
      if (narrow) setOverlayOpen(false);
    }, [narrow]);

    const canvasVisible = useWorkspaceCanvasVisibility();
    const canvasControl = useWorkspaceCanvasControl();

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
          case 'work':
            showList('activity');
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
            // The timeline and context views stay a tab; everything else is the Activity list.
            if (request.view === 'work' || request.view === 'context') openTab(sessionTab);
            else showList('activity');
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
      [openCanvasResource, openSubagentTab, openTab, sessionId, showFolder, showList, workspaceId],
    );

    useImperativeHandle(ref, () => ({ open: openRequest }), [openRequest]);

    const toggleMaximized = (trigger?: Element | null) => {
      // Maximize covers the conversation only: the left bar stays, and the
      // strip comes along inside the canvas. Body is the bare-host fallback.
      setMaximizeHost(
        trigger?.closest('[data-slot=sheet-content]') ??
          trigger?.closest('[data-workbench-maximize-host]') ??
          document.body,
      );
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
      pressed: activeTabId === agentTab.id,
    });
    if (inStudy === true)
      stripItems.push({
        id: 'science-log',
        label: 'Science log',
        icon: <FlaskConicalIcon />,
        pressed: activeTabId === scienceLogTab.id,
      });
    if (onOpenTerminal) listItem('terminal', 'Terminal', <TerminalSquareIcon />);
    listItem('browser', 'Browser pages', <GlobeIcon />);

    const selectStripItem = (id: WorkbenchStripItem['id']) => {
      if (id === 'agent') {
        openTab(agentTab);
        return;
      }
      if (id === 'science-log') {
        // The open log's strip item shows or hides its study tree; otherwise it opens the log.
        if (activeTabId === scienceLogTab.id && tabList.slot.title) {
          tabList.setShown(!tabList.slot.shown);
          return;
        }
        hideStripList();
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
      if (!item) return;
      if (canvasVisible) {
        selectStripItem(item.id);
        return;
      }
      // Closed: open the pocket at this item rather than toggling its list off.
      canvasControl?.show();
      if (!(listShown && listView === item.id)) selectStripItem(item.id);
    });
    // A chord pressed while the pocket was unmounted (closed Sheet) lands here.
    const takePendingStripPosition = (position: number) => {
      canvasControl?.clearPendingStripPosition();
      const item = stripItems.find((candidate) => candidate.position === position);
      if (item) selectStripItem(item.id);
    };
    useShortcut('terminal', () => onOpenTerminal?.(), { enabled: Boolean(onOpenTerminal) });
    useShortcut('new-terminal', () => onOpenTerminal?.(), { enabled: Boolean(onOpenTerminal) });
    useShortcut('previous-tab', () => stepTab(-1), { region: asideRef });
    useShortcut('next-tab', () => stepTab(1), { region: asideRef });
    useShortcut('maximize', () => toggleMaximized(maximizeButtonRef.current), {
      region: asideRef,
    });

    const list = listShown ? (
      <WorkbenchListColumn
        activeTabId={activeTabId}
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
        onOpenTab={(tab) => {
          openTab(tab);
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
          'relative z-30 flex h-full min-w-0 flex-row bg-background',
          maximized &&
            (maximizeHost?.hasAttribute('data-workbench-maximize-host')
              ? 'absolute inset-0 z-[80] bg-background'
              : 'fixed inset-0 z-[80] bg-background shadow-2xl'),
        )}
      >
        <WorkbenchTabListProvider slot={tabList.slot}>
          <TooltipProvider delayDuration={450}>
            <Tabs
              className="min-h-0 min-w-0 flex-1 gap-0"
              onValueChange={setActiveTabId}
              value={activeTabId}
            >
              <WorkbenchTabRow
                workspaceId={workspaceId}
                activeTabId={activeTabId}
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
                    // Hugging its icon, clear of the file toolbar's More button under it.
                    shortcutSide="under-icon"
                    tooltipSide="bottom"
                  />
                }
              />
              {orderedTabs.map((tab) => (
                // `isolate`: a tab's own stacking (charts, sticky headers) stays under the list sheet.
                <TabsContent
                  className="isolate m-0 min-h-0 overflow-hidden"
                  key={tab.id}
                  value={tab.id}
                >
                  {/* Only the active tab: Radix Presence renders an outgoing panel once more
                    before unmounting it, which would mount a tab that is being left. */}
                  {canvasVisible && requestsSettled && tab.id === activeTab?.id ? (
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
            {list ?? tabList.column}
            <WorkbenchStrip items={stripItems} onSelect={selectStripItem} />
          </TooltipProvider>
        </WorkbenchTabListProvider>
      </aside>
    );

    return (
      <>
        {/* Keep request delivery outside the portal: maximizing remounts its
            contents and must not replay a previously handled open request. */}
        <WorkbenchRequestDispatcher
          active={pendingRequest}
          onDelivered={setDeliveredKey}
          onOpen={openRequest}
        />
        <PendingStripDispatcher
          onTake={takePendingStripPosition}
          position={canvasControl?.pendingStripPosition}
        />
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

function PendingStripDispatcher({
  onTake,
  position,
}: {
  onTake: (position: number) => void;
  position?: number;
}) {
  const take = useEffectEvent(onTake);
  useEffect(() => {
    if (position !== undefined) take(position);
  }, [position]);
  return null;
}

function WorkbenchRequestDispatcher({
  active,
  onDelivered,
  onOpen,
}: {
  active?: { key: string; request: ClioWorkbenchOpenRequest };
  onDelivered: (key: string) => void;
  onOpen: (request: ClioWorkbenchOpenRequest) => void;
}) {
  // Compact layouts mount the workbench only after their sheet opens. Keeping
  // the event in props lets this mounted child deliver the first resource
  // request instead of silently showing only the default Activity tab.
  // Layout effects: the first request lands before paint, in the mount's own commit.
  useLayoutEffect(() => {
    if (active) onOpen(active.request);
    onDelivered(active?.key ?? '');
  }, [onDelivered, onOpen, active]);
  return null;
}
