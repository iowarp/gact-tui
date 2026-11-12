import { PanelRightIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { OPEN_TERMINAL_EVENT } from './workspace-canvas-visibility-context';
import { DesktopWorkspaceToolbar } from './desktop-workspace-toolbar';
import { ToolbarAction } from './viewer-toolbar';
import { TopBarEndHost } from './top-bar-end-context';
import { NamedTooltip } from './primitives/icon-button';
import { useUpdatePane } from './update-page-host';
import { UpdatePage } from './update-restart-overlay';
import { HeldKeyBadge, HeldKeysScrim } from './primitives/key-chip';
import { SPLIT_WORKBENCH_QUERY } from './workbench-shared';
import { tourAnchor } from '@/lib/onboarding/tour-anchors';

/** The left bar carries its hide control while open; collapsed, or as a phone sheet, the top bar shows it. */
function TopBarSidebarTrigger() {
  const { isMobile, state } = useSidebar();
  const leftPocketKey = useShortcutPresentation('left-pocket');
  if (!isMobile && state === 'expanded') return null;
  return (
    <span className="inline-flex">
      <NamedTooltip label="Show the left bar" shortcut="left-pocket">
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
          aria-label="Resize navigation"
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
  const [workbenchPreference, setWorkbenchPreference] = useState<boolean>();
  const [dismissedRevealKey, setDismissedRevealKey] = useState<string>();
  const revealRequested = Boolean(workbenchRevealKey && workbenchRevealKey !== dismissedRevealKey);
  // A wide viewport makes the canvas available, but it does not imply that the
  // user asked to open it. Explicit resource requests still reveal it, and an
  // open/closed choice survives route changes while this shell stays mounted.
  const hasWorkbench = Boolean(workbench);
  const workbenchOpen = hasWorkbench && (revealRequested || (workbenchPreference ?? false));
  const collapseNavigationForWorkbench = workbenchOpen && conversationCrowded;
  const workbenchPanelRef = useRef<PanelImperativeHandle>(null);
  const workbenchSheetRef = useRef<HTMLDivElement>(null);
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
  // window, or follow a drag that collapsed the panel.
  const synchronizeWorkbenchPanel = useCallback(() => {
    const panel = workbenchPanelRef.current;
    if (!panel) return;
    const collapsed = panel.isCollapsed();
    const pixels = panel.getSize().inPixels;
    if (!collapsed && typeof window !== 'undefined' && window.innerWidth) {
      const share = Math.round((pixels / window.innerWidth) * 1000) / 1000;
      if (share !== workbenchShareRef.current) {
        workbenchShareRef.current = share;
        window.localStorage.setItem(WORKBENCH_SHARE_KEY, String(share));
        setConversationCrowded(conversationNeedsFoldedNavigation(share, window.innerWidth));
      }
    }
    setWorkbenchOpen(!collapsed);
  }, [setWorkbenchOpen]);

  useEffect(() => {
    if (!desktopWorkbench) return;
    if (workbenchOpen) {
      workbenchPanelRef.current?.expand();
      applyWorkbenchShare();
    } else workbenchPanelRef.current?.collapse();
  }, [applyWorkbenchShare, desktopWorkbench, workbenchOpen]);

  // Under the split breakpoint the canvas is a sheet over the conversation, so
  // the floating conversation rail hides under it: one sheet at a time.
  const workbenchSheetOpen = workbenchOpen && !desktopWorkbench;
  useEffect(() => {
    if (!workbenchSheetOpen) return;
    document.body.setAttribute('data-canvas-sheet', '');
    return () => document.body.removeAttribute('data-canvas-sheet');
  }, [workbenchSheetOpen]);

  // The width is a share of the window, so a window resize re-applies it. It
  // applies once the canvas's group has its new width: applied on the window's
  // resize event, a narrower window's width would land before the group had
  // shrunk, and the group then kept the wider pixels.
  const [workbenchHost, setWorkbenchHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const host = workbenchHost;
    if (!hasWorkbench || !host) return;
    let frame = 0;
    let lastWidth = currentWindowWidth();
    const observer = new ResizeObserver(() => {
      const width = currentWindowWidth();
      if (frame || width === lastWidth) return;
      lastWidth = width;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        applyWorkbenchShare();
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
    <section
      className="flex h-full min-w-0 flex-col bg-background"
      aria-label="Conversation workspace"
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
        {updating ? null : statusStrip}
        {updating ? null : toolbarActions}
        {hasWorkbench && !updating && (
          <ToolbarAction
            label={workbenchOpen ? 'Close workspace canvas' : 'Open workspace canvas'}
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
      <div className="min-h-0 flex-1 overflow-hidden" {...tourAnchor('conversation-area')}>
        {updating ? <UpdatePage /> : children}
      </div>
    </section>
  );

  const visibleWorkbench = (
    <WorkspaceCanvasVisibilityProvider control={workbenchControl} visible={workbenchOpen}>
      {workbench}
    </WorkspaceCanvasVisibilityProvider>
  );

  const workspace = (
    <SidebarInset
      asChild
      className="relative isolate h-full min-h-0 min-w-0 overflow-hidden bg-background md:m-0 md:rounded-none md:shadow-none"
    >
      {/* The maximized canvas covers this section (the conversation), not the
          left bar; the rail hides while it is maximized. */}
      <section aria-label="Session workspace" data-workbench-maximize-host="" ref={setWorkbenchHost}>
        {hasWorkbench && desktopWorkbench ? (
          <ResizablePanelGroup className="h-full" orientation="horizontal">
            <ResizablePanel minSize="400px">{sessionSurface}</ResizablePanel>
            <ResizableHandle
              aria-label="Resize workspace canvas"
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
              {visibleWorkbench}
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
      {hasWorkbench && !desktopWorkbench ? (
        <Sheet onOpenChange={setWorkbenchOpen} open={workbenchOpen}>
          <SheetContent
            // Under the split breakpoint the workbench slides over the conversation at 86%,
            // whichever tab is open; the spec's shadow sets the conversation strip beside
            // it underneath, not cut off.
            className="w-[86vw] p-0 shadow-[-14px_0_30px_color-mix(in_srgb,var(--shadow-color)_60%,transparent)] data-[side=right]:w-[86vw] data-[side=right]:sm:max-w-none dark:shadow-[-14px_0_30px_color-mix(in_srgb,var(--shadow-color)_75%,transparent)] [&>[data-slot=sheet-close]]:right-12 has-[aside[data-maximized=true]]:inset-0 has-[aside[data-maximized=true]]:w-screen has-[aside[data-maximized=true]]:max-w-none has-[aside[data-maximized=true]]:border-0 sm:has-[aside[data-maximized=true]]:max-w-none"
            // Land on the sheet itself, announced by its title, rather than on whichever icon
            // button comes first (which would also pop its tooltip).
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              workbenchSheetRef.current?.focus();
            }}
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
              <SheetTitle>Workspace canvas</SheetTitle>
              <SheetDescription>
                Session activity, child conversations, files, artifacts, and the conversation’s
                agent.
              </SheetDescription>
            </SheetHeader>
            {visibleWorkbench}
          </SheetContent>
        </Sheet>
      ) : null}
      <HeldKeysScrim />
    </SidebarProvider>
  );
}
