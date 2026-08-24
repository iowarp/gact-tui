import { PanelRightIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { PanelImperativeHandle, PanelSize } from 'react-resizable-panels';
import { Button } from '@/components/ui/button';
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
import { useContainerQuery } from '@/hooks/use-container-query';
import { useMenuAction } from '@/tauri/menu-actions';

export interface ClioAppShellProps {
  navigation: ReactNode;
  contextBar: ReactNode;
  children: ReactNode;
  workbench: ReactNode;
  workbenchRevealKey?: string;
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
  const { open, setOpen } = useSidebar();
  const panelRef = useRef<PanelImperativeHandle>(null);
  const restoreNavigationRef = useRef(false);
  useMenuAction('toggle-sessions', () => setOpen(!open));

  useEffect(() => {
    if (collapseForWorkbench) {
      if (open) {
        restoreNavigationRef.current = true;
        setOpen(false);
      }
      return;
    }
    if (restoreNavigationRef.current) {
      restoreNavigationRef.current = false;
      setOpen(true);
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
    <main className="h-dvh min-w-0 flex-1">
      <ResizablePanelGroup className="h-dvh w-full" orientation="horizontal">
        <ResizablePanel
          collapsedSize="56px"
          collapsible
          defaultSize="280px"
          groupResizeBehavior="preserve-pixel-size"
          id="workspace-navigation"
          maxSize="440px"
          minSize="216px"
          onResize={synchronizeCollapsedState}
          panelRef={panelRef}
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

export function ClioAppShell({
  navigation,
  contextBar,
  children,
  workbench,
  workbenchRevealKey,
  statusStrip,
}: ClioAppShellProps) {
  const desktopNavigation = useMediaQuery('(min-width: 768px)');
  const workbenchNeedsNavigationRail = useMediaQuery(
    '(min-width: 820px) and (max-width: 1279px)',
  );
  const workspaceRef = useRef<HTMLElement>(null);
  // The navigation panel is independently resizable, so viewport media queries
  // cannot describe how much room the session workspace actually has.
  const desktopWorkbench = useContainerQuery(workspaceRef, 760);
  const [workbenchPreference, setWorkbenchPreference] = useState<boolean>();
  const [dismissedRevealKey, setDismissedRevealKey] = useState<string>();
  const revealRequested = Boolean(workbenchRevealKey && workbenchRevealKey !== dismissedRevealKey);
  const workbenchOpen = revealRequested || (workbenchPreference ?? desktopWorkbench);
  const collapseNavigationForWorkbench = workbenchOpen && workbenchNeedsNavigationRail;
  const workbenchPanelRef = useRef<PanelImperativeHandle>(null);
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
  useMenuAction('toggle-inspector', toggleWorkbench);

  useEffect(() => {
    if (!desktopWorkbench) return;
    if (workbenchOpen) workbenchPanelRef.current?.expand();
    else workbenchPanelRef.current?.collapse();
  }, [desktopWorkbench, workbenchOpen]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        toggleWorkbench();
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [toggleWorkbench]);

  const sessionSurface = (
    <section
      className="flex h-full min-w-0 flex-col bg-background"
      aria-label="Conversation workspace"
    >
      <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur">
        <SidebarTrigger />
        <div className="min-w-0 flex-1">{contextBar}</div>
        <Button
          aria-label={workbenchOpen ? 'Close workspace canvas' : 'Open workspace canvas'}
          onClick={toggleWorkbench}
          size="icon-sm"
          variant={workbenchOpen ? 'secondary' : 'ghost'}
        >
          <PanelRightIcon aria-hidden="true" />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      <footer className="h-9 shrink-0 border-t bg-card/70 px-3">{statusStrip}</footer>
    </section>
  );

  const workspace = (
    <SidebarInset
      asChild
      className="h-dvh min-w-0 overflow-hidden bg-background md:m-0 md:rounded-none md:shadow-none"
    >
      <section aria-label="Session workspace" ref={workspaceRef}>
        {desktopWorkbench ? (
          <ResizablePanelGroup className="h-full" orientation="horizontal">
            <ResizablePanel minSize="400px">{sessionSurface}</ResizablePanel>
            <ResizableHandle
              aria-label="Resize workspace canvas"
              className="z-20 bg-border/60 after:w-3 hover:bg-primary/50 focus-visible:bg-primary/60"
            />
            <ResizablePanel
              collapsedSize="0px"
              collapsible
              defaultSize="420px"
              maxSize="70%"
              minSize="320px"
              onResize={(size, _id, previous) => {
                if (!previous) return;
                if (size.inPixels === 0 && workbenchOpen) setWorkbenchOpen(false);
                if (size.inPixels >= 320 && !workbenchOpen) setWorkbenchOpen(true);
              }}
              panelRef={workbenchPanelRef}
            >
              {workbench}
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
        <main className="flex h-dvh w-full">
          {navigation}
          {workspace}
        </main>
      )}
      {!desktopWorkbench ? (
        <Sheet onOpenChange={setWorkbenchOpen} open={workbenchOpen}>
          <SheetContent
            className="w-[min(92vw,480px)] p-0 [&>[data-slot=sheet-close]]:right-12 has-[aside[data-maximized=true]]:inset-0 has-[aside[data-maximized=true]]:w-screen has-[aside[data-maximized=true]]:max-w-none has-[aside[data-maximized=true]]:border-0 sm:has-[aside[data-maximized=true]]:max-w-none"
            side="right"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Workspace canvas</SheetTitle>
              <SheetDescription>
                Session activity, child conversations, files, artifacts, and agent blueprints.
              </SheetDescription>
            </SheetHeader>
            {workbench}
          </SheetContent>
        </Sheet>
      ) : null}
    </SidebarProvider>
  );
}
