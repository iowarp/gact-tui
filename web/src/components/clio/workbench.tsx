import type {
  Artifact as ArtifactEntity,
  BrowserPage,
  SessionDiff,
  SubagentRun,
  WorkspaceFileEntry,
  WorkspaceResource,
} from '@clio/core/v3';
import { Maximize2Icon, Minimize2Icon } from 'lucide-react';
import {
  forwardRef,
  startTransition,
  useCallback,
  useEffect,
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
import type { FrameBack } from './primitives/frame-back';
import type { SubagentOpenTarget } from './subagent-card';
import {
  useWorkspaceCanvasControl,
  useWorkspaceCanvasVisibility,
} from './workspace-canvas-visibility-context';
import { WorkbenchTabContent } from './workbench-tab-content';
import { WorkbenchTabFrame } from './workbench-tab-frame';
import { PendingStripDispatcher, WorkbenchRequestDispatcher } from './workbench-dispatchers';
import { useWorkbenchMaximize } from './use-workbench-maximize';
import { useWorkbenchStrip } from './use-workbench-strip';
import {
  tabForOpenRequest,
  variantTryTab,
  type CanvasResourceKind,
  type ClioWorkbenchOpenRequest,
  type TabOpenRequest,
} from './workbench-open-request';
import {
  changeCountMap,
  changedPathSet,
  fileName,
  loadResourceViewers,
  subagentTab,
  type WorkbenchTab,
} from './workbench-shared';
import {
  htmlBrowserTarget,
  OPEN_FILE_IN_BROWSER_EVENT,
  type OpenFileInBrowserDetail,
} from '@/lib/html-in-browser';
import { useWorkbenchRequest, type WorkbenchRequestSource } from '@/lib/workbench-request-store';
import { useWorkbenchTabVisibility } from './use-workbench-tab-visibility';
import { scienceLogTab } from './science-log-tab-state';
import { workbenchTabPath } from './workbench-tab-icons';
import {
  agentTab,
  listTab,
  newBrowserPageTab,
  WORKBENCH_LIST_TITLES,
} from './workbench-tab-storage';
import { browserPageLabel } from './use-browser-pages';
import { useBrowserPageTabs } from './use-browser-page-tabs';
import { useWorkbenchTabState } from './use-workbench-tab-state';
import { focusListRow, focusOpenedFrame, refocusActiveCanvasTab } from './workbench-focus';
import { WorkbenchTabRow } from './workbench-tab-row';
import {
  WorkbenchStrip,
  type WorkbenchListView,
  type WorkbenchTabListView,
} from './workbench-strip';
import {
  WorkbenchListColumn,
  type WorkbenchActivityView,
  type WorkbenchListColumnProps,
} from './workbench-list-column';
import { useWorkbenchTabListSlot } from './use-workbench-tab-list-slot';
import { WorkbenchTabListProvider } from './workbench-tab-list';
import { useMcpAppTabSync } from './mcp-app-tab-sync';
import { usePublishWorkbenchAppTabs } from './phone-app-dock';

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
  /** A new conversation's Browser address: starts the conversation with the page open in it. */
  onOpenDraftBrowserPage?: (url: string) => Promise<void>;
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

// A tab's own list (a study tree) sits beside it down to the spec's laptop
// width (a 40% panel at 1280 keeps ~280px for the tab after the strip and the
// 36% list); narrower, it is a sheet over the tab body.
const LIST_OVERLAY_BELOW = 440;
// A pick in a list tab shows the item in that tab; these kinds draw a frame bar,
// whose Back returns to the list. Anything else opens a tab of its own.
const REPLACING_KINDS = new Set<WorkbenchTab['kind']>([
  'activity',
  'artifact',
  'diff',
  'resource',
  'subagent',
  'workspace-file',
]);

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
      onOpenDraftBrowserPage,
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
      openTab,
      openInstance,
      openSubagentTab,
      replaceTab,
      selectFilesPath,
      selectWorkspaceFilePath,
      closeTabs,
      moveTab,
      stepTab,
    } = useWorkbenchTabState(workspaceId, sessionId, inStudy);
    useBrowserPageTabs({ sessionId, workspaceId, activeTabId, setTabs, setActiveTabId });
    // Read by open requests, so their callback keeps its identity as tabs change.
    const latestTabs = useRef({ active: activeTab, tabs: orderedTabs });
    useLayoutEffect(() => {
      latestTabs.current = { active: activeTab, tabs: orderedTabs };
    }, [activeTab, orderedTabs]);
    const [listDirectory, setListDirectory] = useState<string>();
    // Unknown until the panel is first measured.
    const [narrow, setNarrow] = useState<boolean>();
    const {
      maximized,
      setMaximized,
      toggleMaximized,
      restore,
      maximizeButtonRef,
      portalHost,
      inSection,
    } = useWorkbenchMaximize();
    // Tab bodies wait until the latest open request is delivered: revealing
    // the canvas must not mount the previous tab only to replace it.
    const subscribedRequest = useWorkbenchRequest(requests);
    const pendingRequest = requestedOpen ?? subscribedRequest;
    const [deliveredKey, setDeliveredKey] = useState<string>();
    const requestsSettled =
      deliveredKey !== undefined && (!pendingRequest || pendingRequest.key === deliveredKey);
    const asideRef = useRef<HTMLElement>(null);
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

    const canvasVisible = useWorkspaceCanvasVisibility();
    const canvasControl = useWorkspaceCanvasControl();
    const [activityView, setActivityView] = useState<WorkbenchActivityView>('timeline');

    // A shown canvas never has an empty pane: with nothing open it shows Files.
    const canvasEmpty = orderedTabs.length === 0;
    useLayoutEffect(() => {
      if (canvasEmpty && canvasVisible) openTab(listTab('files'));
    }, [canvasEmpty, canvasVisible, openTab]);
    const tabList = useWorkbenchTabListSlot({ narrow, activeTabId });
    const changedPaths = useMemo(() => changedPathSet(diffs), [diffs]);
    const changeCounts = useMemo(() => changeCountMap(diffs), [diffs]);

    // `TabsContent` unmounts inactive panels (Radix Presence, no forceMount),
    // so "the Files tab or a foreign workspace's Files tab is active" is
    // exactly "a file tree is mounted" -- the signal use-workspace-data.ts
    // gates its poll on (refetchInterval).
    const filesViewActive =
      activeTab?.kind === 'files' || (activeTab?.kind === 'list' && activeTab.view === 'files');
    useEffect(() => {
      // The owner re-renders the page (and its transcript) on this change; a
      // pick that replaces the Files tab must not pay for that in the click.
      startTransition(() => onFilesViewActiveChange?.(filesViewActive));
      return () => startTransition(() => onFilesViewActiveChange?.(false));
    }, [filesViewActive, onFilesViewActiveChange]);

    useWorkbenchTabVisibility(tabStripRef, activeTabRef, activeTabId, orderedTabs, maximized);

    // The tab shown before the current one: a strip icon clicked again returns there.
    const [tabHistory, setTabHistory] = useState({ active: activeTabId, previous: '' });
    if (tabHistory.active !== activeTabId)
      setTabHistory({ active: activeTabId, previous: tabHistory.active });
    const previousTab = orderedTabs.find(
      (tab) => tab.id === tabHistory.previous && tab.id !== activeTabId,
    );

    /** Every strip list opens (or focuses) its tab. */
    const showList = useCallback(
      (view: WorkbenchListView) => {
        if (view === 'artifacts') void loadResourceViewers();
        openTab(listTab(view));
      },
      [openTab],
    );

    /** Closing the last tab closes the canvas rather than leaving it empty. */
    const closeTabsOrCanvas = (ids: readonly string[]) => {
      if (!ids.length) return;
      const closing = new Set(ids);
      closeTabs(ids);
      if (!orderedTabs.every((tab) => closing.has(tab.id))) return;
      setMaximized(false);
      canvasControl?.hide?.();
    };
    const closeTabOrCanvas = (tabId: string) => closeTabsOrCanvas([tabId]);
    useMcpAppTabSync(orderedTabs, closeTabsOrCanvas, canvasControl?.hide);
    usePublishWorkbenchAppTabs(orderedTabs, activeTab);

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
            showList('artifacts');
            return;
          case 'session':
            setActivityView('timeline');
            showList('activity');
            return;
          // Todos, plans, goals and schedules are rows of the Events list, not the timeline.
          case 'work':
            setActivityView('events');
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

    /** HTML files open in the shared browser. */
    const openInBrowser = useCallback(
      (request: ClioWorkbenchOpenRequest, targetWorkspaceId: string) => {
        const html = htmlBrowserTarget(request);
        if (!html || targetWorkspaceId !== workspaceId) return false;
        window.dispatchEvent(
          new CustomEvent<OpenFileInBrowserDetail>(OPEN_FILE_IN_BROWSER_EVENT, {
            detail: {
              target: html,
              sessionId,
              label: 'path' in html ? fileName(html.path) : 'HTML file',
            },
          }),
        );
        return true;
      },
      [sessionId, workspaceId],
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
            // A named view picks Activity's Timeline or Context; without one, it stays as it was.
            if (request.view)
              setActivityView(
                request.view === 'context' || request.view === 'relationships'
                  ? request.view
                  : 'timeline',
              );
            showList('activity');
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
          case 'variant-try':
            // Every try gets its tab, in try order; the asked-for one is then shown.
            for (const item of request.tries)
              openTab(variantTryTab(request, item.tryIndex, sessionId, workspaceId));
            openTab(variantTryTab(request, request.tryIndex, sessionId, workspaceId));
            return;
          // Every terminal request is a person opening one more terminal.
          case 'terminal':
            openInstance(tabForOpenRequest(request, sessionId, workspaceId, targetWorkspaceId));
            return;
          // A new conversation's first page arrives after it starts: the New page
          // tab its address was typed in becomes the page, as pickTab does in a conversation.
          case 'browser': {
            const tab = tabForOpenRequest(request, sessionId, workspaceId, targetWorkspaceId);
            const current = latestTabs.current;
            const blank = request.fromNewPage
              ? current.active?.kind === 'list' && current.active.newPage
                ? current.active
                : current.tabs.findLast((open) => open.kind === 'list' && open.newPage)
              : undefined;
            if (blank) replaceTab(blank.id, tab);
            else openTab(tab);
            return;
          }
          default: {
            if (openInBrowser(request, targetWorkspaceId)) return;
            openTab(tabForOpenRequest(request, sessionId, workspaceId, targetWorkspaceId));
          }
        }
      },
      [
        openCanvasResource,
        openInBrowser,
        openInstance,
        openSubagentTab,
        openTab,
        replaceTab,
        sessionId,
        showFolder,
        showList,
        workspaceId,
      ],
    );

    useImperativeHandle(ref, () => ({ open: openRequest }), [openRequest]);

    const { stripItems, selectStripItem, takePendingStripPosition, pendingStripPosition } =
      useWorkbenchStrip({
        activeTabId,
        closeTabOrCanvas,
        inStudy,
        onOpenTerminal,
        openInstance,
        openTab,
        previousTab,
        setActiveTabId,
        subagents,
        tabList,
      });
    const stepTabByKey = (delta: -1 | 1) => {
      stepTab(delta);
      refocusActiveCanvasTab(asideRef.current);
    };
    useShortcut('previous-tab', () => stepTabByKey(-1), { region: asideRef });
    useShortcut('next-tab', () => stepTabByKey(1), { region: asideRef });
    useShortcut('maximize', () => toggleMaximized(maximizeButtonRef.current), {
      region: asideRef,
    });

    // A pick in a list tab shows the item in the tab (Back returns to the list);
    // with Shift, or from a pinned list, it opens a tab of its own.
    const pickShiftRef = useRef(false);
    const pickTab = (tab: WorkbenchTab) => {
      const shift = pickShiftRef.current;
      pickShiftRef.current = false;
      const host = activeTab?.kind === 'list' ? activeTab : undefined;
      focusOpenedFrame(asideRef.current);
      // A new page becomes the page it opens (or the open page picked from its list).
      if (host?.newPage && tab.kind === 'browser' && !shift) {
        replaceTab(host.id, tab);
        return;
      }
      if (!host || shift || pinned.has(host.id) || !REPLACING_KINDS.has(tab.kind)) {
        openTab(tab);
        return;
      }
      if (orderedTabs.some((open) => open.id === tab.id)) {
        setActiveTabId(tab.id);
        return;
      }
      replaceTab(host.id, { ...tab, backTo: host.view });
    };
    const pickRequest = (request: TabOpenRequest) => {
      if (openInBrowser(request, workspaceId)) return;
      pickTab(tabForOpenRequest(request, sessionId, workspaceId, workspaceId));
    };
    const backFor = (tab: WorkbenchTab): FrameBack | undefined => {
      const backTo = tab.backTo;
      if (!backTo) return undefined;
      return {
        label: WORKBENCH_LIST_TITLES[backTo],
        onBack: () => {
          replaceTab(tab.id, listTab(backTo));
          focusListRow(
            asideRef.current,
            'path' in tab && tab.path ? tab.path.split(/[\\/]/u).at(-1) : tab.label,
          );
        },
      };
    };

    const listProps: Omit<WorkbenchListColumnProps, 'view'> = {
      activeTabId,
      activityView,
      artifacts,
      artifactsError,
      artifactsPending,
      artifactsTruncated,
      changeCounts,
      changedPaths,
      directory: listDirectory,
      files,
      filesError,
      filesFetching,
      filesNextOffset,
      filesPending,
      filesTruncated,
      finishedWorkHidden,
      onActivityViewChange: setActivityView,
      onClearDirectory: () => setListDirectory(''),
      onOpenTab: pickTab,
      onOpenArtifact: (artifact) => pickRequest({ kind: 'artifact', artifact }),
      onOpenBrowserPage: (page: BrowserPage) =>
        pickRequest({
          kind: 'browser',
          pageId: page.id,
          sessionId: page.session_id,
          label: browserPageLabel(page),
        }),
      // A picked file always gets its tab, even HTML: its viewer opens the
      // shared browser on show and keeps the source if that fails.
      onOpenFile: (path) =>
        pickTab(
          tabForOpenRequest({ kind: 'workspace-file', path }, sessionId, workspaceId, workspaceId),
        ),
      onOpenResource: (resource) =>
        pickRequest({ kind: 'resource', resource, relatedResources: resources }),
      onOpenSubagent: (subagent) => pickTab(subagentTab(subagent, workspaceId)),
      onOpenDraftBrowserPage,
      onNewBrowserPage: () => openInstance(newBrowserPageTab),
      onOpenTerminal,
      onRefreshFiles,
      onSelectTab: setActiveTabId,
      resources,
      resourcesError,
      resourcesPending,
      sessionId,
      sessionView,
      subagents,
      tabs: orderedTabs,
      workspaceId,
    };
    // A list in a tab marks the tab it was reached from, the one a row last opened.
    const renderList = (view: WorkbenchTabListView, newPage?: boolean) => (
      // Shift on the pick (click, Enter or Space) opens the item in a tab of its own.
      <div
        className="contents"
        onClickCapture={(event) => {
          pickShiftRef.current = event.shiftKey;
        }}
        onKeyDownCapture={(event) => {
          if (event.key === 'Enter' || event.key === ' ') pickShiftRef.current = event.shiftKey;
        }}
        role="presentation"
      >
        <WorkbenchListColumn
          {...listProps}
          activeTabId={previousTab?.id ?? ''}
          newPage={newPage}
          view={view}
        />
      </div>
    );

    const canvas = (
      <aside
        aria-label="Workspace canvas"
        data-keyboard-region=""
        data-workbench-pocket=""
        data-maximized={maximized || undefined}
        ref={asideRef}
        className={cn(
          'relative z-30 flex h-full min-w-0 flex-row bg-background',
          maximized &&
            (inSection
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
                onClose={closeTabOrCanvas}
                onCloseOthers={(tabId) =>
                  closeTabsOrCanvas(
                    orderedTabs
                      .filter((tab) => tab.id !== tabId && !pinned.has(tab.id))
                      .map((tab) => tab.id),
                  )
                }
                onCloseToRight={(tabId) =>
                  closeTabsOrCanvas(
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
                // Every tab holds its own controls, so the panel itself is not a stop.
                <TabsContent
                  className="isolate m-0 min-h-0 overflow-hidden data-[state=inactive]:hidden"
                  // An App's tab stays mounted while hidden: its view must not reload.
                  forceMount={tab.kind === 'mcp-app' || undefined}
                  key={tab.id}
                  tabIndex={-1}
                  value={tab.id}
                >
                  {/* Only the active tab: Radix Presence renders an outgoing panel once more
                    before unmounting it, which would mount a tab that is being left. */}
                  {(canvasVisible && requestsSettled && tab.id === activeTab?.id) ||
                  tab.kind === 'mcp-app' ? (
                    <WorkbenchTabFrame
                      artifacts={artifacts}
                      back={backFor(tab)}
                      onClose={() => closeTabOrCanvas(tab.id)}
                      onOpen={openRequest}
                      onOpenSubagent={onOpenSubagent}
                      resources={resources}
                      sessionId={sessionId}
                      subagents={subagents}
                      tab={tab}
                      workspaceId={workspaceId}
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
                        renderList={renderList}
                        resources={resources}
                        resourcesError={resourcesError}
                        resourcesPending={resourcesPending}
                        sessionId={sessionId}
                        sessionView={sessionView}
                        agentView={agentView}
                        tab={tab}
                        workspaceId={workspaceId}
                      />
                    </WorkbenchTabFrame>
                  ) : null}
                </TabsContent>
              ))}
            </Tabs>
            {tabList.column}
            <WorkbenchStrip items={stripItems} onSelect={selectStripItem} onShowList={showList} />
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
        <PendingStripDispatcher onTake={takePendingStripPosition} position={pendingStripPosition} />
        {maximized
          ? createPortal(
              <DismissableLayer
                asChild
                onEscapeKeyDown={(event) => {
                  // Closing a child can expose this layer during the same key
                  // event. A handled Escape must never dismiss its parent too.
                  if (event.defaultPrevented) return;
                  event.preventDefault();
                  restore();
                }}
                onInteractOutside={(event) => event.preventDefault()}
              >
                {canvas}
              </DismissableLayer>,
              portalHost,
            )
          : canvas}
      </>
    );
  },
);
