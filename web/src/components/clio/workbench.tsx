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
  startTransition,
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
import { useOverlayContainer } from '@/components/ui/overlay-container';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useShortcut } from '@/lib/shortcuts/hooks';
import { cn } from '@/lib/utils';
import { IconButton } from './primitives/icon-button';
import { focusQuietly } from './primitives/quiet-focus';
import { FrameBackContext, type FrameBack } from './primitives/frame-back';
import type { SubagentOpenTarget } from './subagent-card';
import {
  useWorkspaceCanvasControl,
  useWorkspaceCanvasVisibility,
} from './workspace-canvas-visibility-context';
import { WorkbenchTabErrorBoundary } from './workbench-tab-error-boundary';
import { WorkbenchTabContent } from './workbench-tab-content';
import {
  tabForOpenRequest,
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
import { agentTab, listTab, WORKBENCH_LIST_TITLES } from './workbench-tab-storage';
import { useWorkbenchTabState } from './use-workbench-tab-state';
import { refocusActiveCanvasTab, WorkbenchTabRow } from './workbench-tab-row';
import {
  WorkbenchStrip,
  type WorkbenchListView,
  type WorkbenchStripItem,
  type WorkbenchTabListView,
} from './workbench-strip';
import {
  WorkbenchListColumn,
  type WorkbenchActivityView,
  type WorkbenchListColumnProps,
} from './workbench-list-column';
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
      openTab,
      openSubagentTab,
      replaceTab,
      selectFilesPath,
      selectWorkspaceFilePath,
      closeTabs,
      moveTab,
      stepTab,
    } = useWorkbenchTabState(workspaceId, sessionId, inStudy);
    const [listDirectory, setListDirectory] = useState<string>();
    // Unknown until the panel is first measured.
    const [narrow, setNarrow] = useState<boolean>();
    const [maximized, setMaximized] = useState(false);
    // Tab bodies wait until the latest open request is delivered: revealing
    // the canvas must not mount the previous tab only to replace it.
    const subscribedRequest = useWorkbenchRequest(requests);
    const pendingRequest = requestedOpen ?? subscribedRequest;
    const [deliveredKey, setDeliveredKey] = useState<string>();
    const requestsSettled =
      deliveredKey !== undefined && (!pendingRequest || pendingRequest.key === deliveredKey);
    const [maximizeHost, setMaximizeHost] = useState<Element | null>(null);
    // A bare host (no sheet, no workspace section) maximizes into the overlay
    // host, never <body>: a body child restyles the whole app root.
    const overlayHost = useOverlayContainer();
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

    // Floating surfaces over the conversation (the rail) hide under a maximized
    // canvas. A body attribute, unlike `body:has(...)`, does not make every DOM
    // mutation re-check and restyle the whole document.
    useEffect(() => {
      if (!maximized) return;
      document.body.setAttribute('data-canvas-maximized', '');
      return () => document.body.removeAttribute('data-canvas-maximized');
    }, [maximized]);

    const canvasVisible = useWorkspaceCanvasVisibility();
    const canvasControl = useWorkspaceCanvasControl();
    const clearFit = canvasControl?.fitWidth;
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
          case 'work':
            setActivityView('timeline');
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
          default: {
            if (openInBrowser(request, targetWorkspaceId)) return;
            openTab(tabForOpenRequest(request, sessionId, workspaceId, targetWorkspaceId));
          }
        }
      },
      [
        openCanvasResource,
        openInBrowser,
        openSubagentTab,
        openTab,
        sessionId,
        showFolder,
        showList,
        workspaceId,
      ],
    );

    useImperativeHandle(ref, () => ({ open: openRequest }), [openRequest]);

    const toggleMaximized = (trigger?: Element | null) => {
      // Maximize covers the conversation only: the left bar stays, and the
      // strip comes along inside the canvas.
      setMaximizeHost(
        trigger?.closest('[data-slot=sheet-content]') ??
          trigger?.closest('[data-workbench-maximize-host]') ??
          overlayHost ??
          document.body,
      );
      setMaximized((value) => !value);
      // The canvas remounts in its new host, so a focused control inside it is gone:
      // return to the active tab when a tab had focus, else to Maximize/Restore.
      const fromTab = document.activeElement?.closest('[data-slot=canvas-tab-row] [role=tab]');
      requestAnimationFrame(() => {
        if (document.activeElement && document.activeElement !== document.body) return;
        let canvas = maximizeButtonRef.current?.parentElement;
        while (canvas && !canvas.querySelector('[data-slot=canvas-tab-row]')) {
          canvas = canvas.parentElement;
        }
        const activeTab = canvas?.querySelector<HTMLElement>(
          '[data-slot=canvas-tab-row] [role=tab][aria-selected=true]',
        );
        focusQuietly(fromTab && activeTab ? activeTab : maximizeButtonRef.current);
      });
    };

    const runningSubagents = subagents.filter((run) => RUNNING_STATES.has(run.state)).length;
    const listIsPressed = (id: WorkbenchListView) => activeTabId === listTab(id).id;
    const stripItems: WorkbenchStripItem[] = [];
    const listItem = (id: WorkbenchListView, label: string, icon: ReactNode, count?: number) =>
      stripItems.push({
        id,
        label,
        icon,
        position: stripItems.filter((item) => item.position).length + 1,
        pressed: listIsPressed(id),
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
    // Always on the strip: where terminals can't run, its list says so.
    listItem('terminal', 'Terminal', <TerminalSquareIcon />);
    listItem('browser', 'Browser pages', <GlobeIcon />);

    /** A launcher click: open or focus the tab; on the shown tab, go back to the one before. */
    const toggleTab = (tab: WorkbenchTab) => {
      if (activeTabId !== tab.id) {
        if (tab.kind === 'list' && tab.view === 'artifacts') void loadResourceViewers();
        openTab(tab);
      } else if (previousTab) setActiveTabId(previousTab.id);
      else closeTabOrCanvas(tab.id);
    };

    const selectStripItem = (id: WorkbenchStripItem['id']) => {
      if (id === 'agent') {
        toggleTab(agentTab);
        return;
      }
      if (id === 'science-log') {
        // The open log's strip item shows or hides its study tree; otherwise it opens the log.
        if (activeTabId === scienceLogTab.id && tabList.slot.title) {
          tabList.setShown(!tabList.slot.shown);
          return;
        }
        openTab(scienceLogTab);
        return;
      }
      toggleTab(listTab(id));
    };

    useShortcut('strip-position', (_event, position) => {
      const item = stripItems.find((candidate) => candidate.position === position);
      if (!item) return;
      if (canvasVisible) {
        selectStripItem(item.id);
        return;
      }
      // Closed: open the pocket at this item rather than toggling it off.
      canvasControl?.show();
      if (!item.pressed) selectStripItem(item.id);
    });
    // A chord pressed while the pocket was unmounted (closed Sheet) lands here.
    const takePendingStripPosition = (position: number) => {
      canvasControl?.clearPendingStripPosition();
      const item = stripItems.find((candidate) => candidate.position === position);
      if (item) selectStripItem(item.id);
    };
    useShortcut('terminal', () => onOpenTerminal?.(), { enabled: Boolean(onOpenTerminal) });
    useShortcut('new-terminal', () => onOpenTerminal?.(), { enabled: Boolean(onOpenTerminal) });
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
        onBack: () => replaceTab(tab.id, listTab(backTo)),
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
          label: page.label,
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
    const fitWidth = canvasControl?.fitWidth;
    const fitListWidth = (pixels: number, listWidth: number) => {
      const aside = asideRef.current;
      if (!aside || !fitWidth) return;
      fitWidth(pixels + aside.getBoundingClientRect().width - listWidth);
    };
    // A list tab narrows the canvas to what its rows need (never wider than the
    // stored width); Activity's timeline and context keep the stored width.
    const fitting =
      !maximized &&
      activeTab?.kind === 'list' &&
      (activeTab.view !== 'activity' || activityView === 'events' || !sessionId);
    useEffect(() => {
      if (!fitting) clearFit?.(undefined);
    }, [clearFit, fitting]);
    useEffect(() => () => clearFit?.(undefined), [clearFit]);
    // A list in a tab marks the tab it was reached from, the one a row last opened.
    const renderList = (view: WorkbenchTabListView) => (
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
          onFitWidth={fitting ? fitListWidth : undefined}
          view={view}
        />
      </div>
    );

    const canvas = (
      <aside
        aria-label="Workspace canvas"
        data-keyboard-region=""
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
                <TabsContent
                  className="isolate m-0 min-h-0 overflow-hidden"
                  key={tab.id}
                  value={tab.id}
                >
                  {/* Only the active tab: Radix Presence renders an outgoing panel once more
                    before unmounting it, which would mount a tab that is being left. */}
                  {canvasVisible && requestsSettled && tab.id === activeTab?.id ? (
                    <WorkbenchTabErrorBoundary
                      label={tab.label}
                      onClose={() => closeTabOrCanvas(tab.id)}
                    >
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
                        <FrameBackContext.Provider value={backFor(tab)}>
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
                        </FrameBackContext.Provider>
                      </PresentationNavigation.Provider>
                    </WorkbenchTabErrorBoundary>
                  ) : null}
                </TabsContent>
              ))}
            </Tabs>
            {tabList.column}
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
              maximizeHost ?? overlayHost ?? document.body,
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
