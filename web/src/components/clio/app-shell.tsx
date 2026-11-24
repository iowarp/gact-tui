import { PanelRightIcon } from 'lucide-react';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PanelImperativeHandle, PanelSize } from 'react-resizable-panels';
import { cn } from '@/lib/utils';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  storedSidebarOpen,
  useSidebar,
} from '@/components/ui/sidebar';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useShortcut, useShortcutPresentation } from '@/lib/shortcuts/hooks';
import { useRegionShortcuts } from '@/lib/shortcuts/regions';
import { useMenuAction } from '@/tauri/menu-actions';
import { requestClioMenuOnMount } from '@/lib/clio-menu-request';
import { settingsWindowOpen } from '@/lib/settings-window-route';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { useWorkbenchRequest, type WorkbenchRequestSource } from '@/lib/workbench-request-store';
import { WorkspaceCanvasVisibilityProvider } from './workspace-canvas-visibility';
import { usePhoneAppDock, useWorkbenchAppTabs } from './phone-app-dock';
import { appTabShare } from './workbench-app-width';
import {
  clearOfSplitGrip,
  useWorkbenchSlotBounds,
  useWorkbenchSplitDrag,
} from './workbench-keeper';
import { OPEN_TERMINAL_EVENT } from './workspace-canvas-visibility-context';
import { DesktopWorkspaceToolbar } from './desktop-workspace-toolbar';
import { ToolbarAction } from './viewer-toolbar';
import { TopBarEndHost } from './top-bar-end-context';
import { NamedTooltip } from './primitives/icon-button';
import { useUpdatePane } from './update-page-host';
import { UpdatePage } from './update-restart-overlay';
import { HeldKeyBadge, HeldKeysScrim } from './primitives/key-chip';
import { SPLIT_WORKBENCH_QUERY } from './workbench-shared';
import { ConversationRailDockContext, dockedRailWidth } from './conversation-rail-dock';
import { tourAnchor } from '@/lib/onboarding/tour-anchors';
import { t } from '@lingui/core/macro';

/** The left bar carries its hide control while open; collapsed, or as a phone sheet, the top bar shows it. */
function TopBarSidebarTrigger() {
  const { isMobile, state } = useSidebar();
  const leftPocketKey = useShortcutPresentation('left-pocket');
  if (!isMobile && state === 'expanded') return null;
  return (
    <span className="inline-flex">
      <NamedTooltip label={t`Show the left bar`} shortcut="left-pocket">
        {/* Closed or a phone sheet, the left bar is this toggle: the tour points here instead. */}
        <SidebarTrigger
          aria-keyshortcuts={leftPocketKey?.aria}
          data-tour="workspace-navigation settings"
          className="size-7 text-muted-foreground hover:bg-hover hover:text-foreground"
        />
      </NamedTooltip>
      <HeldKeyBadge id="left-pocket" />
    </span>
  );
}

/** On a phone the CLIO menu sits in the closed left sheet: its key opens the sheet, then the menu. */
function PhoneClioMenuShortcut() {
  const { isMobile, openMobile, setOpenMobile } = useSidebar();
  useShortcut(
    'app-menu',
    () => {
      requestClioMenuOnMount();
      setOpenMobile(true);
    },
    { enabled: !inTauri() && isMobile && !openMobile, when: () => !settingsWindowOpen() },
  );
  return null;
}

export interface ClioAppShellProps {
  navigation: ReactNode;
  contextBar: ReactNode;
  toolbarActions?: ReactNode;
  children: ReactNode;
  workbench: ReactNode;
  workbenchRevealKey?: string;
  /** Open requests that reveal the canvas; read here so the page need not re-render. */
  workbenchReveal?: WorkbenchRequestSource;
  /** Recovery, work needing inspection and usage, shown in the top bar's trailing group. */
  statusStrip: ReactNode;
}

function DesktopNavigationLayout({
  navigation,
  children,
  collapseForWorkbench,
  onFoldChange,
}: {
  navigation: ReactNode;
  children: ReactNode;
  collapseForWorkbench: boolean;
  /** Runs once the bar has folded or unfolded, when the content's width has changed. */
  onFoldChange?: () => void;
}) {
  const { open, setOpen, toggleSidebar } = useSidebar();
  useMenuAction('toggle-left-bar', toggleSidebar);
  const panelRef = useRef<PanelImperativeHandle>(null);
  // Resize callbacks can arrive before a fold commits; they read the latest request.
  const openRef = useRef(open);
  const previousCollapseForWorkbenchRef = useRef(false);
  // Below 1024px the bar shrinks to its icon strip by itself; the panel icon still reopens it.
  const narrow = useMediaQuery('(max-width: 1023px)');
  const collapse = collapseForWorkbench || narrow;

  useEffect(() => {
    const wasCollapsedForWorkbench = previousCollapseForWorkbenchRef.current;
    previousCollapseForWorkbenchRef.current = collapse;

    if (collapse && !wasCollapsedForWorkbench) {
      if (open) {
        setOpen(false);
      }
      return;
    }
  }, [collapse, open, setOpen]);

  useEffect(() => {
    openRef.current = open;
    const panel = panelRef.current;
    if (!panel) return;
    if (!open) {
      panel.collapse();
      return;
    }
    panel.expand();
    // With no remembered width the library expands to its 216 px minimum.
    if (panel.getSize().inPixels <= 216) panel.resize(`${OPEN_NAVIGATION_WIDTH}px`);
  }, [open]);

  const synchronizeCollapsedState = (
    size: PanelSize,
    _id: string | number | undefined,
    previous?: PanelSize,
  ) => {
    if (!previous) return;
    if (size.inPixels <= 64 !== previous.inPixels <= 64) onFoldChange?.();
    if (size.inPixels <= 64) {
      if (openRef.current) setOpen((openRef.current = false));
      return;
    }
    if (openRef.current) return;
    // Only a drag out of the strip reopens the bar. A viewport resize scales
    // the panel too, and must not undo the fold below 1024px.
    if (previous.inPixels <= 64 && size.inPixels >= 216) setOpen((openRef.current = true));
    else panelRef.current?.collapse();
  };

  return (
    <main className="h-full min-h-0 min-w-0 flex-1">
      <ResizablePanelGroup className="h-full min-h-0 w-full" orientation="horizontal">
        <ResizablePanel
          collapsedSize="56px"
          collapsible
          defaultSize="292px"
          groupResizeBehavior="preserve-pixel-size"
          id="workspace-navigation"
          maxSize="440px"
          minSize="216px"
          onResize={synchronizeCollapsedState}
          panelRef={panelRef}
          style={{ overflow: 'visible' }}
        >
          {navigation}
        </ResizablePanel>
        <ResizableHandle
          aria-label={t`Resize navigation`}
          className="z-20 bg-border/60 after:w-3 hover:bg-primary/50 focus-visible:bg-primary/60"
        />
        {/* The conversation keeps 400 px, so at 768 the open bar keeps its full 292 px. */}
        <ResizablePanel id="workspace-content" minSize={`${MIN_CONVERSATION_WIDTH}px`}>
          {children}
        </ResizablePanel>
      </ResizablePanelGroup>
    </main>
  );
}

const WORKBENCH_SHARE_KEY = 'clio.workbench-share.v1';
/** The open or closed canvas, kept for this browser tab so a reload shows what was on screen. */
const WORKBENCH_OPEN_KEY = 'clio.workbench-open.v1';
const DEFAULT_WORKBENCH_SHARE = 0.4;
const MAX_WORKBENCH_SHARE = 0.7;
const MIN_WORKBENCH_WIDTH = 320;
const MIN_CONVERSATION_WIDTH = 400;
/** The left bar's open width; folded, it is the 56 px icon column. */
const OPEN_NAVIGATION_WIDTH = 292;

/** The workbench width as a share of the window: 40% to start, then what the user dragged. */
function storedWorkbenchShare(): number {
  if (typeof window === 'undefined') return DEFAULT_WORKBENCH_SHARE;
  const value = Number(window.localStorage.getItem(WORKBENCH_SHARE_KEY));
  return Number.isFinite(value) && value >= 0.15 && value <= MAX_WORKBENCH_SHARE
    ? value
    : DEFAULT_WORKBENCH_SHARE;
}

function workbenchWidth(share: number, windowWidth: number): number {
  return Math.max(MIN_WORKBENCH_WIDTH, Math.min(share, MAX_WORKBENCH_SHARE) * windowWidth);
}

function storedWorkbenchOpen(): boolean | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const value = window.sessionStorage.getItem(WORKBENCH_OPEN_KEY);
    return value === 'open' ? true : value === 'closed' ? false : undefined;
  } catch {
    return undefined;
  }
}

function storeWorkbenchOpen(open: boolean): void {
  try {
    window.sessionStorage.setItem(WORKBENCH_OPEN_KEY, open ? 'open' : 'closed');
  } catch {
    // Storage may be off; the choice then lasts while the shell is mounted.
  }
}

/** Up to this the left bar folds whenever the workbench is open (spec "Laptop, 1280px"). */
const LAPTOP_WIDTH = 1280;

/**
 * The left bar folds first when the open bar would push the conversation under
 * 400 px, and always at laptop widths and below.
 */
function conversationNeedsFoldedNavigation(share: number, windowWidth: number): boolean {
  return (
    windowWidth <= LAPTOP_WIDTH ||
    OPEN_NAVIGATION_WIDTH + workbenchWidth(share, windowWidth) + MIN_CONVERSATION_WIDTH >
      windowWidth
  );
}

function currentWindowWidth(): number {
  return typeof window === 'undefined' ? 1280 : window.innerWidth;
}

export function ClioAppShell({
  navigation,
  contextBar,
  toolbarActions,
  children,
  workbench,
  workbenchRevealKey: revealKeyProp,
  workbenchReveal,
  statusStrip,
}: ClioAppShellProps) {
  const subscribedRevealKey = useWorkbenchRequest(workbenchReveal)?.key;
  const workbenchRevealKey = revealKeyProp ?? subscribedRevealKey;
  const updating = useUpdatePane();
  const desktopNavigation = useMediaQuery('(min-width: 768px)');
  // Side by side needs the 400 px conversation, the 320 px workbench and the
  // folded 56 px left bar; under 900 px the workbench slides over at 86%.
  const desktopWorkbench = useMediaQuery(SPLIT_WORKBENCH_QUERY);
  const [initialWorkbenchShare] = useState(storedWorkbenchShare);
  const workbenchShareRef = useRef(initialWorkbenchShare);
  const [conversationCrowded, setConversationCrowded] = useState(() =>
    conversationNeedsFoldedNavigation(initialWorkbenchShare, currentWindowWidth()),
  );
  const [workbenchPreference, setWorkbenchPreference] = useState<boolean | undefined>(
    storedWorkbenchOpen,
  );
  const [dismissedRevealKey, setDismissedRevealKey] = useState<string>();
  const revealRequested = Boolean(workbenchRevealKey && workbenchRevealKey !== dismissedRevealKey);
  // A pocket a reference opened stays open across conversations, like one the
  // canvas button opened. A phone sheet still closes when you leave.
  const [recordedRevealKey, setRecordedRevealKey] = useState<string>();
  if (revealRequested && desktopWorkbench && workbenchRevealKey !== recordedRevealKey) {
    setRecordedRevealKey(workbenchRevealKey);
    setWorkbenchPreference(true);
  }
  // A wide viewport makes the canvas available, but it does not imply that the
  // user asked to open it. Explicit resource requests still reveal it, and an
  // open/closed choice survives route changes and reloads of this browser tab.
  const hasWorkbench = Boolean(workbench);
  const workbenchOpen = hasWorkbench && (revealRequested || (workbenchPreference ?? false));
  useEffect(() => {
    if (workbenchPreference !== undefined) storeWorkbenchOpen(workbenchPreference);
  }, [workbenchPreference]);
  const collapseNavigationForWorkbench = workbenchOpen && conversationCrowded;
  const workbenchPanelRef = useRef<PanelImperativeHandle>(null);
  const workbenchSheetRef = useRef<HTMLDivElement>(null);
  // The canvas lives in one keeper at the shell's root, fixed over the slot the
  // current layout keeps for it (the split panel or the phone sheet). Crossing the
  // split breakpoint swaps the slot, never the canvas's place in the DOM, so an
  // App view's iframe is not reloaded by a resize.
  const workbenchKeeperRef = useRef<HTMLDivElement>(null);
  const [workbenchSlot, setWorkbenchSlot] = useState<HTMLDivElement | null>(null);
  const workbenchSlotBounds = useWorkbenchSlotBounds(workbenchSlot);
  // An App tab shown on a phone docks between the conversation's header and composer.
  const appTabShown = useWorkbenchAppTabs((state) => state.shown);
  // With an App tab open the closed sheet stays mounted and hidden, so it opens
  // straight back to its box over the docked App.
  const keepSheetMounted = useWorkbenchAppTabs((state) => state.open);
  const appDock = usePhoneAppDock(
    hasWorkbench && !desktopWorkbench && workbenchOpen && appTabShown,
  );
  // Opens at the remembered share of the window; the panel keeps those pixels
  // until the window itself resizes (below), so folding the left bar widens
  // the conversation rather than the workbench. A closed canvas mounts
  // collapsed: mounting it open and collapsing it in an effect lays the
  // conversation out at the wrong width first and re-renders it on every
  // workspace mount. Opening then expands and applies the share.
  const [workbenchDefaultSize] = useState(() =>
    workbenchOpen
      ? `${Math.round(workbenchWidth(initialWorkbenchShare, currentWindowWidth()))}px`
      : '0px',
  );
  // The width belongs to the person: only their drag and window resizes change
  // it. Opening or switching tabs never does; a list in a wide pocket fills it.
  const applyWorkbenchShare = useCallback(() => {
    const share = workbenchShareRef.current;
    const width = currentWindowWidth();
    setConversationCrowded(conversationNeedsFoldedNavigation(share, width));
    const pixels = Math.round(workbenchWidth(share, width));
    const panel = workbenchPanelRef.current;
    if (panel && !panel.isCollapsed()) panel.resize(`${pixels}px`);
  }, []);
  const setWorkbenchOpen = useCallback(
    (open: boolean) => {
      setWorkbenchPreference(open);
      if (!open && workbenchRevealKey) setDismissedRevealKey(workbenchRevealKey);
    },
    [workbenchRevealKey],
  );

  const toggleWorkbench = useCallback(
    () => setWorkbenchOpen(!workbenchOpen),
    [setWorkbenchOpen, workbenchOpen],
  );
  // A drag on the separator ends here: remember the new width as a share of the
  // window, or follow a drag that collapsed the panel. The size is read two
  // frames after the release, once the group has applied the drag's last move;
  // read on pointerup, a quick release saved the width from one move earlier.
  const synchronizeFrameRef = useRef(0);
  const synchronizeWorkbenchPanel = useCallback(() => {
    window.cancelAnimationFrame(synchronizeFrameRef.current);
    synchronizeFrameRef.current = window.requestAnimationFrame(() => {
      synchronizeFrameRef.current = window.requestAnimationFrame(() => {
        synchronizeFrameRef.current = 0;
        const panel = workbenchPanelRef.current;
        if (!panel) return;
        const collapsed = panel.isCollapsed();
        const pixels = panel.getSize().inPixels;
        if (!collapsed && window.innerWidth) {
          const share = Math.round((pixels / window.innerWidth) * 1000) / 1000;
          if (share !== workbenchShareRef.current) {
            workbenchShareRef.current = share;
            window.localStorage.setItem(WORKBENCH_SHARE_KEY, String(share));
            setConversationCrowded(conversationNeedsFoldedNavigation(share, window.innerWidth));
          }
        }
        setWorkbenchOpen(!collapsed);
      });
    });
  }, [setWorkbenchOpen]);
  useEffect(() => () => window.cancelAnimationFrame(synchronizeFrameRef.current), []);

  useEffect(() => {
    if (!desktopWorkbench) return;
    if (workbenchOpen) {
      workbenchPanelRef.current?.expand();
      applyWorkbenchShare();
    } else workbenchPanelRef.current?.collapse();
  }, [applyWorkbenchShare, desktopWorkbench, workbenchOpen]);

  // An app view opens at half the window until the person sizes the canvas themselves.
  useEffect(() => {
    if (!desktopWorkbench || !workbenchOpen || !appTabShown) return;
    const personSized = Boolean(window.localStorage.getItem(WORKBENCH_SHARE_KEY));
    const share = appTabShare(workbenchShareRef.current, currentWindowWidth(), personSized);
    if (share === workbenchShareRef.current) return;
    workbenchShareRef.current = share;
    applyWorkbenchShare();
  }, [appTabShown, applyWorkbenchShare, desktopWorkbench, workbenchOpen]);

  // Under the split breakpoint the canvas is a sheet over the conversation, so
  // the floating conversation rail hides under it: one sheet at a time.
  const workbenchSheetOpen = workbenchOpen && !desktopWorkbench;
  useEffect(() => {
    if (!workbenchSheetOpen) return;
    document.body.setAttribute('data-canvas-sheet', '');
    return () => document.body.removeAttribute('data-canvas-sheet');
  }, [workbenchSheetOpen]);

  // The width is a share of the window, so a window resize re-applies it. It
  // applies once the canvas's group has settled at its new width: two frames
  // after the group's host changes width. Applied any sooner, a single large
  // shrink (un-maximizing) landed before the group re-laid its panels out, and
  // the pocket kept a few pixels too many.
  const [workbenchHost, setWorkbenchHost] = useState<HTMLElement | null>(null);
  const splitDragging = useWorkbenchSplitDrag(workbenchHost);
  useEffect(() => {
    const host = workbenchHost;
    if (!hasWorkbench || !host) return;
    let frame = 0;
    let hostWidth = Math.round(host.getBoundingClientRect().width);
    const observer = new ResizeObserver(() => {
      const width = Math.round(host.getBoundingClientRect().width);
      if (width === hostWidth) return;
      hostWidth = width;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          applyWorkbenchShare();
        });
      });
    });
    observer.observe(host);
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [applyWorkbenchShare, hasWorkbench, workbenchHost]);

  useShortcut('right-pocket', toggleWorkbench, { enabled: hasWorkbench });
  useRegionShortcuts();
  useMenuAction('toggle-workbench', toggleWorkbench, hasWorkbench);
  const [topBarEnd, setTopBarEnd] = useState<HTMLDivElement | null>(null);

  // A strip chord with the pocket closed opens it at that strip item. The
  // desktop panel keeps the workbench mounted (it handles the chord itself);
  // the closed Sheet does not, so the shell holds the position until it mounts.
  const [pendingStripPosition, setPendingStripPosition] = useState<number | 'terminal'>();
  const sheetClosed = hasWorkbench && !desktopWorkbench && !workbenchOpen;
  useShortcut(
    'strip-position',
    (_event, position) => {
      setPendingStripPosition(position);
      setWorkbenchOpen(true);
    },
    { enabled: sheetClosed },
  );
  const openTerminalPocket = useCallback(() => {
    setPendingStripPosition('terminal');
    setWorkbenchOpen(true);
  }, [setWorkbenchOpen]);
  useShortcut('terminal', openTerminalPocket, { enabled: sheetClosed });
  useEffect(() => {
    if (!sheetClosed) return;
    window.addEventListener(OPEN_TERMINAL_EVENT, openTerminalPocket);
    return () => window.removeEventListener(OPEN_TERMINAL_EVENT, openTerminalPocket);
  }, [openTerminalPocket, sheetClosed]);
  // User-directed: the conversation rail docks beside the conversation while the
  // pocket is closed, as long as the conversation keeps its minimum width. Under
  // the spec's 900 px rail rule, or with the pocket open, it floats or hides.
  const [railHost, setRailHost] = useState<HTMLDivElement | null>(null);
  const [conversationAreaWidth, setConversationAreaWidth] = useState(0);
  useEffect(() => {
    const area = railHost?.parentElement;
    if (!area) return;
    const measure = () => setConversationAreaWidth(Math.round(area.getBoundingClientRect().width));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    return () => observer.disconnect();
  }, [railHost]);
  const railDock = useMemo(
    () => ({
      host: railHost,
      pocketOpen: workbenchOpen,
      dockable:
        desktopWorkbench &&
        !workbenchOpen &&
        conversationAreaWidth - dockedRailWidth(currentWindowWidth()) >= MIN_CONVERSATION_WIDTH,
    }),
    [conversationAreaWidth, desktopWorkbench, railHost, workbenchOpen],
  );

  const workbenchControl = useMemo(
    () => ({
      show: () => setWorkbenchOpen(true),
      hide: () => setWorkbenchOpen(false),
      pendingStripPosition,
      clearPendingStripPosition: () => setPendingStripPosition(undefined),
    }),
    [pendingStripPosition, setWorkbenchOpen],
  );

  const sessionSurface = (
    <ConversationRailDockContext.Provider value={railDock}>
      <section
        className="flex h-full min-w-0 flex-col bg-background"
        aria-label={t`Conversation workspace`}
        data-keyboard-region=""
        data-slot="conversation-surface"
      >
        <DesktopWorkspaceToolbar navigation={<TopBarSidebarTrigger />}>
          {/* The update page brings its own header; the conversation's is stale while it runs. */}
          <div className="min-w-0 flex-1">
            {updating ? null : (
              <TopBarEndHost.Provider value={topBarEnd}>{contextBar}</TopBarEndHost.Provider>
            )}
          </div>
          {/* Each slot sits in its own keyed fragment: the page keys every conversation
              region by endpoint and conversation, so the two siblings would otherwise
              share one key. */}
          <Fragment key="status-strip">{updating ? null : statusStrip}</Fragment>
          <Fragment key="toolbar-actions">{updating ? null : toolbarActions}</Fragment>
          {hasWorkbench && !updating && (
            <ToolbarAction
              label={workbenchOpen ? t`Close workspace canvas` : t`Open workspace canvas`}
              onClick={toggleWorkbench}
              shortcut="right-pocket"
              aria-pressed={workbenchOpen}
              {...tourAnchor('workbench-lists')}
            >
              <PanelRightIcon aria-hidden="true" />
            </ToolbarAction>
          )}
          <div className="flex shrink-0 items-center empty:hidden" ref={setTopBarEnd} />
        </DesktopWorkspaceToolbar>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div
            className="min-h-0 min-w-0 flex-1 overflow-hidden"
            {...tourAnchor('conversation-area')}
          >
            {updating ? <UpdatePage /> : children}
          </div>
          <div
            className="flex shrink-0 empty:hidden"
            data-slot="conversation-rail-dock"
            ref={setRailHost}
          />
        </div>
      </section>
    </ConversationRailDockContext.Provider>
  );

  const visibleWorkbench = (
    <WorkspaceCanvasVisibilityProvider control={workbenchControl} visible={workbenchOpen}>
      {workbench}
    </WorkspaceCanvasVisibilityProvider>
  );
  // The empty box each layout keeps for the canvas; the keeper below covers it.
  const workbenchSlotElement = (
    <div
      className="h-full min-h-0 w-full flex-1"
      data-slot="workbench-slot"
      ref={setWorkbenchSlot}
    />
  );
  const workbenchShown = workbenchOpen && Boolean(workbenchSlotBounds?.width);

  const workspace = (
    <SidebarInset
      asChild
      className="relative isolate h-full min-h-0 min-w-0 overflow-hidden bg-background md:m-0 md:rounded-none md:shadow-none"
    >
      {/* The maximized canvas covers this section (the conversation), not the
          left bar; the rail hides while it is maximized. */}
      <section
        aria-label={t`Session workspace`}
        data-workbench-maximize-host=""
        ref={setWorkbenchHost}
      >
        {hasWorkbench && desktopWorkbench ? (
          <ResizablePanelGroup className="h-full" orientation="horizontal">
            <ResizablePanel minSize="400px">{sessionSurface}</ResizablePanel>
            <ResizableHandle
              aria-label={t`Resize workspace canvas`}
              // Collapsed, the handle sits on the window edge and its 12 px grip
              // would cover the toolbar's last button; the toolbar toggle opens it.
              className={cn(
                'z-20 bg-border/60 after:w-3 hover:bg-primary/50 focus-visible:bg-primary/60',
                !workbenchOpen && 'pointer-events-none',
              )}
              // Collapsed, the handle, the canvas and its scroller leave the Tab order.
              inert={!workbenchOpen}
              onKeyUp={synchronizeWorkbenchPanel}
              onPointerUp={synchronizeWorkbenchPanel}
            />
            {/* A stable default retains the resized width across collapse/expand. */}
            <ResizablePanel
              collapsedSize="0px"
              collapsible
              defaultSize={workbenchDefaultSize}
              groupResizeBehavior="preserve-pixel-size"
              inert={!workbenchOpen}
              maxSize="70%"
              minSize="320px"
              panelRef={workbenchPanelRef}
            >
              {workbenchSlotElement}
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          sessionSurface
        )}
      </section>
    </SidebarInset>
  );

  return (
    // The route can remount the shell (a draft, a new workspace); keep the bar as left.
    <SidebarProvider defaultOpen={storedSidebarOpen()}>
      <PhoneClioMenuShortcut />
      {desktopNavigation ? (
        <DesktopNavigationLayout
          collapseForWorkbench={collapseNavigationForWorkbench}
          // The workbench opens while the bar is still open; once the bar folds,
          // the content has room for the workbench's full share.
          onFoldChange={applyWorkbenchShare}
          navigation={navigation}
        >
          {workspace}
        </DesktopNavigationLayout>
      ) : (
        <main className="flex h-full min-h-0 w-full">
          {navigation}
          {workspace}
        </main>
      )}
      {/* Non-modal: an App tab docks beside the conversation's composer (below), and
          switching the sheet's modality while it is open would remount its contents. */}
      {hasWorkbench && !desktopWorkbench ? (
        <Sheet modal={false} onOpenChange={setWorkbenchOpen} open={workbenchOpen}>
          <SheetContent
            // Under the split breakpoint the workbench slides over the conversation at 86%,
            // whichever tab is open; the spec's shadow sets the conversation strip beside
            // it underneath, not cut off. The sheet is the canvas's box: the keeper over it
            // draws the canvas and takes its input, so the sheet itself is see-through.
            className="w-[86vw] bg-transparent p-0 pointer-events-none shadow-[-14px_0_30px_color-mix(in_srgb,var(--shadow-color)_60%,transparent)] data-[side=right]:w-[86vw] data-[side=right]:sm:max-w-none dark:shadow-[-14px_0_30px_color-mix(in_srgb,var(--shadow-color)_75%,transparent)] [&>[data-slot=sheet-close]]:right-12 [body[data-canvas-maximized]_&]:inset-0 [body[data-canvas-maximized]_&]:w-screen [body[data-canvas-maximized]_&]:max-w-none [body[data-canvas-maximized]_&]:border-0 sm:[body[data-canvas-maximized]_&]:max-w-none data-[state=closed]:invisible"
            // Land on the canvas rather than on whichever icon button comes first (which
            // would also pop its tooltip); the keeper is placed over the sheet a frame on.
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              workbenchSheetRef.current?.focus();
              window.requestAnimationFrame(() =>
                workbenchKeeperRef.current?.focus({ preventScroll: true }),
              );
            }}
            forceMount={keepSheetMounted || undefined}
            inert={!workbenchOpen || undefined}
            // The canvas is drawn by the keeper, outside the sheet's DOM: a press in it is
            // inside the sheet. Docked beside the composer, typing in the conversation
            // keeps the App shown.
            onInteractOutside={(event) => {
              const target = event.detail.originalEvent.target;
              if (
                appDock ||
                (target instanceof Node && workbenchKeeperRef.current?.contains(target))
              )
                event.preventDefault();
            }}
            // Non-modal, the sheet would close whenever focus leaves it, including when
            // the conversation moves focus itself (a #message- link refocusing its turn
            // after a resize). Only a click outside or Close dismisses it, as when it
            // was modal.
            onFocusOutside={(event) => event.preventDefault()}
            style={appDock}
            data-app-dock={appDock ? '' : undefined}
            // A list search field closes itself on Escape; that press must not close the sheet.
            onEscapeKeyDown={(event) => {
              if ((event.target as Element | null)?.closest?.('[data-escape-owner]'))
                event.preventDefault();
            }}
            // The spec's narrow layout keeps the folded left bar visible and undimmed.
            overlayClassName="bg-transparent"
            ref={workbenchSheetRef}
            showCloseButton={false}
            side="right"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>{t`Workspace canvas`}</SheetTitle>
              <SheetDescription>
                {t`Session activity, child conversations, files, artifacts, and the conversation’s agent.`}
              </SheetDescription>
            </SheetHeader>
            {workbenchSlotElement}
          </SheetContent>
        </Sheet>
      ) : null}
      {/* Last at the root with a stable key, so a layout change never remounts it. */}
      {hasWorkbench ? (
        <div
          className={cn(
            'fixed z-50 outline-none',
            (!workbenchShown || splitDragging) && 'pointer-events-none',
            !workbenchShown && 'invisible',
          )}
          data-slot="workbench-keeper"
          data-workbench-keeper={desktopWorkbench ? 'section' : 'sheet'}
          inert={!workbenchShown}
          key="workbench-keeper"
          ref={workbenchKeeperRef}
          style={desktopWorkbench ? clearOfSplitGrip(workbenchSlotBounds) : workbenchSlotBounds}
          tabIndex={-1}
        >
          {visibleWorkbench}
        </div>
      ) : null}
      <HeldKeysScrim />
    </SidebarProvider>
  );
}
