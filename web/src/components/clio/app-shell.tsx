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
import { SidebarInset, SidebarProvider, SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useShortcut } from '@/lib/shortcuts/hooks';
import { useWorkbenchRequest, type WorkbenchRequestSource } from '@/lib/workbench-request-store';
import { WorkspaceCanvasVisibilityProvider } from './workspace-canvas-visibility';
import { DesktopWorkspaceToolbar } from './desktop-workspace-toolbar';
import { ToolbarAction } from './viewer-toolbar';

export interface ClioAppShellProps {
  navigation: ReactNode;
  contextBar: ReactNode;
  toolbarActions?: ReactNode;
  children: ReactNode;
  workbench: ReactNode;
  workbenchRevealKey?: string;
  /** Open requests that reveal the canvas; read here so the page need not re-render. */
  workbenchReveal?: WorkbenchRequestSource;
  statusStrip: ReactNode;
}

function DesktopNavigationLayout({
  navigation,
  children,
  collapseForWorkbench,
}: {
  navigation: ReactNode;
  children: ReactNode;
  collapseForWorkbench: boolean;
}) {
  // 'toggle-sessions' used to also be reachable via the native View menu
  // (removed — see menu_spec.rs's application-menu trim); `SidebarTrigger`
  // below already calls `useSidebar().toggleSidebar` directly, including
  // its own keyboard shortcut, so no useMenuAction registration is needed.
  const { open, setOpen } = useSidebar();
  const panelRef = useRef<PanelImperativeHandle>(null);
  const previousCollapseForWorkbenchRef = useRef(false);

  useEffect(() => {
    const wasCollapsedForWorkbench = previousCollapseForWorkbenchRef.current;
    previousCollapseForWorkbenchRef.current = collapseForWorkbench;

    if (collapseForWorkbench && !wasCollapsedForWorkbench) {
      if (open) {
        setOpen(false);
      }
      return;
    }
  }, [collapseForWorkbench, open, setOpen]);

  useEffect(() => {
    if (open) panelRef.current?.expand();
    else panelRef.current?.collapse();
  }, [open]);

  const synchronizeCollapsedState = (
    size: PanelSize,
    _id: string | number | undefined,
    previous?: PanelSize,
  ) => {
    if (!previous) return;
    if (size.inPixels <= 64 && open) setOpen(false);
    if (size.inPixels >= 216 && !open) setOpen(true);
  };

  return (
    <main className="h-full min-h-0 min-w-0 flex-1">
      <ResizablePanelGroup className="h-full min-h-0 w-full" orientation="horizontal">
        <ResizablePanel
          collapsedSize="56px"
          collapsible
          defaultSize="248px"
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
        <ResizablePanel id="workspace-content" minSize="520px">
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
const OPEN_NAVIGATION_WIDTH = 248;
/** Under this the workbench slides over the conversation instead of sitting beside it. */
const SPLIT_WORKBENCH_QUERY = '(min-width: 900px)';

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

/** The left bar folds first when the open bar would push the conversation under 400 px. */
function conversationNeedsFoldedNavigation(share: number, windowWidth: number): boolean {
  return (
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
  // the conversation rather than the workbench.
  const [workbenchDefaultSize] = useState(
    () => `${Math.round(workbenchWidth(initialWorkbenchShare, currentWindowWidth()))}px`,
  );
  const applyWorkbenchShare = useCallback(() => {
    const share = workbenchShareRef.current;
    const width = currentWindowWidth();
    setConversationCrowded(conversationNeedsFoldedNavigation(share, width));
    const panel = workbenchPanelRef.current;
    if (panel && !panel.isCollapsed())
      panel.resize(`${Math.round(workbenchWidth(share, width))}px`);
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
    if (!collapsed && typeof window !== 'undefined' && window.innerWidth) {
      const share = Math.round((panel.getSize().inPixels / window.innerWidth) * 1000) / 1000;
      if (share !== workbenchShareRef.current) {
        workbenchShareRef.current = share;
        window.localStorage.setItem(WORKBENCH_SHARE_KEY, String(share));
        setConversationCrowded(conversationNeedsFoldedNavigation(share, window.innerWidth));
      }
    }
    setWorkbenchOpen(!collapsed);
  }, [setWorkbenchOpen]);
  // 'toggle-inspector' used to also be reachable via the native View menu
  // (removed — see menu_spec.rs's application-menu trim); the Ctrl+Shift+B
  // shortcut and the PanelRightIcon button below already call
  // `toggleWorkbench` directly, so no useMenuAction registration is needed.

  useEffect(() => {
    if (!desktopWorkbench) return;
    if (workbenchOpen) {
      workbenchPanelRef.current?.expand();
      applyWorkbenchShare();
    } else workbenchPanelRef.current?.collapse();
  }, [applyWorkbenchShare, desktopWorkbench, workbenchOpen]);

  // The width is a share of the window, so a window resize re-applies it.
  useEffect(() => {
    if (!hasWorkbench) return;
    let frame = 0;
    const scheduleApply = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        applyWorkbenchShare();
      });
    };
    window.addEventListener('resize', scheduleApply);
    return () => {
      window.removeEventListener('resize', scheduleApply);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [applyWorkbenchShare, hasWorkbench]);

  useShortcut('right-pocket', toggleWorkbench, { enabled: hasWorkbench });

  // A strip chord with the pocket closed opens it at that strip item. The
  // desktop panel keeps the workbench mounted (it handles the chord itself);
  // the closed Sheet does not, so the shell holds the position until it mounts.
  const [pendingStripPosition, setPendingStripPosition] = useState<number>();
  useShortcut(
    'strip-position',
    (_event, position) => {
      setPendingStripPosition(position);
      setWorkbenchOpen(true);
    },
    { enabled: hasWorkbench && !desktopWorkbench && !workbenchOpen },
  );
  const workbenchControl = useMemo(
    () => ({
      show: () => setWorkbenchOpen(true),
      pendingStripPosition,
      clearPendingStripPosition: () => setPendingStripPosition(undefined),
    }),
    [pendingStripPosition, setWorkbenchOpen],
  );

  const sessionSurface = (
    <section
      className="flex h-full min-w-0 flex-col bg-background"
      aria-label="Conversation workspace"
    >
      <DesktopWorkspaceToolbar navigation={<SidebarTrigger />}>
        <div className="min-w-0 flex-1">{contextBar}</div>
        {toolbarActions}
        {hasWorkbench && (
          <ToolbarAction
            label={workbenchOpen ? 'Close workspace canvas' : 'Open workspace canvas'}
            onClick={toggleWorkbench}
            shortcut="right-pocket"
            aria-pressed={workbenchOpen}
          >
            <PanelRightIcon aria-hidden="true" />
          </ToolbarAction>
        )}
      </DesktopWorkspaceToolbar>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      {statusStrip && (
        <footer className="h-9 shrink-0 border-t bg-card/70 px-3">{statusStrip}</footer>
      )}
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
          left bar; `isolate` keeps it under popovers such as the rail. */}
      <section aria-label="Session workspace" data-workbench-maximize-host="">
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
              onKeyUp={synchronizeWorkbenchPanel}
              onPointerUp={synchronizeWorkbenchPanel}
            />
            {/* A stable default retains the resized width across collapse/expand. */}
            <ResizablePanel
              collapsedSize="0px"
              collapsible
              defaultSize={workbenchDefaultSize}
              groupResizeBehavior="preserve-pixel-size"
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
    <SidebarProvider>
      {desktopNavigation ? (
        <DesktopNavigationLayout
          collapseForWorkbench={collapseNavigationForWorkbench}
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
            // Under the split breakpoint the workbench slides over the conversation at 86%.
            className="w-[86vw] p-0 data-[side=right]:w-[86vw] data-[side=right]:sm:max-w-none [&>[data-slot=sheet-close]]:right-12 has-[aside[data-maximized=true]]:inset-0 has-[aside[data-maximized=true]]:w-screen has-[aside[data-maximized=true]]:max-w-none has-[aside[data-maximized=true]]:border-0 sm:has-[aside[data-maximized=true]]:max-w-none"
            // Land on the sheet itself, announced by its title, rather than on whichever icon
            // button comes first (which would also pop its tooltip).
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              workbenchSheetRef.current?.focus();
            }}
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
    </SidebarProvider>
  );
}
