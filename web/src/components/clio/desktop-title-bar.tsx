import { brand } from '@brand';
import {
  AppWindowIcon,
  ArrowLeftIcon,
  ArrowLeftRightIcon,
  ArrowRightIcon,
  BookOpenIcon,
  BotIcon,
  DownloadIcon,
  EyeIcon,
  FileIcon,
  KeyboardIcon,
  LayersIcon,
  Link2Icon,
  Maximize2Icon,
  MinusIcon,
  PanelLeftIcon,
  PanelRightIcon,
  PanelTopIcon,
  ScanIcon,
  SearchIcon,
  ServerIcon,
  TerminalSquareIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from 'lucide-react';
import {
  AddIcon,
  CloseIcon,
  ConnectionSettingsIcon,
  HelpIcon,
  InfoIcon,
  MoreIcon,
  RefreshIcon,
  SettingsIcon,
} from '@/lib/icon-vocabulary';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SwitchAgentItem } from '@/components/clio/clio-menu';
import { useKnownConnections } from '@/hooks/use-known-connections';
import { useSwitchConnection } from '@/hooks/use-switch-connection';
import type { ConnectionSettings } from '@/lib/connection';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useDesktopWorkspaceToolbar } from '@/store/desktop-workspace-toolbar';
import { useDesktopZoom } from '@/hooks/use-desktop-zoom';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { vocab } from '@/lib/brand-vocabulary';
import { isMacOS } from '@/lib/platform';
import { useShortcut, useShortcutPresentation } from '@/lib/shortcuts/hooks';
import { ShortcutKeys } from '@/components/clio/primitives/key-chip';
import { cn } from '@/lib/utils';
import { countRunningSessions } from '@/lib/running-sessions';
import {
  listenForCloseFallbackHidden,
  listenForCloseRequested,
  listenForQuitRequested,
} from '@/tauri/desktop-lifecycle';
import {
  dispatchMenuAction,
  useMenuAction,
  useMenuActionAvailable,
  type MenuAction,
} from '@/tauri/menu-actions';
import {
  ackClosePromptShown,
  ackQuitPromptShown,
  runDesktopWindowAction,
  type DesktopWindowAction,
} from '@/tauri/desktop-window';

// macOS keeps its native traffic lights (top-left); the bar's left section
// is padded clear of them so the hamburger/brand block never sits under
// natively-drawn chrome. Matches the traffic-light cluster's rough width
// plus margin — see tauri.macos.conf.json's titleBarStyle: Overlay.
const MACOS_TRAFFIC_LIGHT_CLEARANCE = 'pl-20';

async function runWindowAction(action: DesktopWindowAction): Promise<void> {
  try {
    await runDesktopWindowAction(action);
  } catch (error) {
    console.error(`Desktop window action failed: ${action}`, error);
    // Quit tears the app down regardless of whether this promise resolves —
    // request_quit hides the window and spawns teardown on a background
    // thread before returning, so a slow or "rejected" invoke here is
    // expected, not a failure. A toast on a perfectly normal quit would be
    // spurious.
    if (action === 'quit') return;
    toast.error(`${brand.wordmark} could not update the desktop window.`);
  }
}

function WindowButton({
  action,
  children,
  danger = false,
  label,
}: {
  action: Extract<DesktopWindowAction, 'minimize' | 'toggleMaximize'>;
  children: React.ReactNode;
  danger?: boolean;
  label: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={label}
          className={`grid h-10 w-12 place-items-center text-muted-foreground transition-colors hover:text-foreground ${
            danger ? 'hover:bg-destructive hover:text-background' : 'hover:bg-accent'
          }`}
          onClick={() => void runWindowAction(action)}
          type="button"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * One app-menu row that runs the same workflow as the native menu bar item.
 * Disabled while no mounted screen handles the action (Workbench without one).
 */
function MenuActionItem({
  action,
  children,
  keepOpen = false,
  shortcut,
}: {
  action: MenuAction;
  children: ReactNode;
  /** Keep the menu open so repeated picks (zoom) apply in place. */
  keepOpen?: boolean;
  /** Shortcut catalog id whose keys the row shows. */
  shortcut?: string;
}) {
  const available = useMenuActionAvailable(action);
  const keys = useShortcutPresentation(shortcut);
  return (
    <DropdownMenuItem
      aria-keyshortcuts={keys?.aria}
      disabled={!available}
      onSelect={(event) => {
        if (keepOpen) event.preventDefault();
        dispatchMenuAction(action);
      }}
    >
      {children}
      {shortcut ? (
        <DropdownMenuShortcut>
          <ShortcutKeys id={shortcut} variant="menu" />
        </DropdownMenuShortcut>
      ) : null}
    </DropdownMenuItem>
  );
}

/**
 * The saved agents other than the current one. It mounts only while the
 * Switch to submenu is open, so their availability is probed on demand.
 */
function SwitchAgentItems() {
  const { settings } = useConnectionSettings();
  const connections = useKnownConnections();
  const switchConnection = useSwitchConnection();
  const others = connections.filter((connection) => connection.endpoint !== settings.endpoint);
  const switchTo = async (connection: ConnectionSettings) => {
    try {
      await switchConnection(connection);
    } catch (error) {
      toast.error('Could not switch agent service', {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };
  if (!others.length) {
    return <p className="px-2 py-1.5 text-[12px] text-muted-foreground">No other saved agents</p>;
  }
  return others.map((connection) => (
    <SwitchAgentItem
      availability={connection.availability}
      connection={connection}
      key={connection.endpoint}
      onConnect={switchTo}
    />
  ));
}

/** Product-owned chrome for the frameless Tauri window. */
export function DesktopTitleBar() {
  const setWorkspaceToolbarHost = useDesktopWorkspaceToolbar((state) => state.setHost);
  const setWorkspaceNavigationHost = useDesktopWorkspaceToolbar((state) => state.setNavigationHost);
  const [closePromptOpen, setClosePromptOpen] = useState(false);
  const [runningAtQuit, setRunningAtQuit] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [macOS] = useState(isMacOS);
  const desktopZoom = useDesktopZoom();
  const fullscreenKeys = useShortcutPresentation('fullscreen');
  const queryClient = useQueryClient();

  // macOS quits like a Mac app: at once, unless a conversation is still
  // running, in which case it asks first.
  const quitOrConfirm = useCallback((running: number) => {
    if (running > 0) setRunningAtQuit(running);
    else void runWindowAction('quit');
  }, []);

  // macOS Cmd-Q and the app or menu bar Quit arrive from the native side,
  // which brings the window forward when a confirmation is needed.
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listenForQuitRequested((seq) => {
      const running = countRunningSessions(queryClient);
      void ackQuitPromptShown(seq, running > 0).finally(() => quitOrConfirm(running));
    }).then(
      (dispose) => {
        if (disposed) dispose();
        else unlisten = dispose;
      },
      () => undefined,
    );
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [queryClient, quitOrConfirm]);

  // Windows and Linux: native close (Alt+F4, the OS close box) opens the
  // same confirmation prompt as the title-bar close button and hamburger
  // Quit, rather than auto-hiding or auto-quitting. `listenForCloseRequested`
  // no-ops outside Tauri, so this effect is safe to run unconditionally
  // (hooks must run in the same order every render — see the early return
  // below).
  useEffect(() => {
    let disposed = false;
    let unlistenRequested: (() => void) | undefined;
    let unlistenFallbackHidden: (() => void) | undefined;

    void listenForCloseRequested((seq) => {
      setClosePromptOpen(true);
      // Acks with THIS request's seq immediately: React's state update is
      // already scheduled, well within the 500ms native fallback window, so
      // there is no need to wait for the dialog to actually paint. The seq
      // round-trip (not a single global ack flag) is what lets a fast
      // repeat — e.g. Alt+F4 pressed twice — correlate correctly instead of
      // a late ack for an older request being mistaken for this one, or
      // suppressing the fallback for a newer, still-unhandled one.
      void ackClosePromptShown(seq);
    }).then(
      (dispose) => {
        if (disposed) dispose();
        else unlistenRequested = dispose;
      },
      () => undefined,
    );

    // The native side hid the window itself because this specific request
    // went unacknowledged for 500ms (an unloaded/crashed WebView). Clear the
    // prompt so a later Show doesn't resurface a stale confirmation dialog
    // over a window the user never got to interact with.
    void listenForCloseFallbackHidden(() => setClosePromptOpen(false)).then(
      (dispose) => {
        if (disposed) dispose();
        else unlistenFallbackHidden = dispose;
      },
      () => undefined,
    );

    return () => {
      disposed = true;
      unlistenRequested?.();
      unlistenFallbackHidden?.();
    };
  }, []);

  // The window menu answers to Alt+Space in Desktop; a browser keeps that key
  // for the CLIO menu search, and a Mac keeps ⇧⌘/ for searching its menu bar,
  // so there it has no key. New conversation, fullscreen and reload are bound
  // here too: WKWebView offers a key to the page before the native menu, and
  // these handlers prevent the default, so the macOS accelerator never runs
  // twice. Settings (Ctrl+,) is bound in App for web and desktop alike. Keys
  // and labels come from the shared catalog. Registered ahead of the early
  // return for the hooks-order reason above.
  useShortcut('app-menu', () => setMenuOpen(true), { enabled: inTauri() });
  useShortcut('new-conversation', () => dispatchMenuAction('new-session'));
  useShortcut('fullscreen', () => void runWindowAction('toggleFullscreen'));
  useShortcut('reload', () => window.location.reload());
  useMenuAction('reload', () => window.location.reload());
  useMenuAction('zoom-in', desktopZoom.zoomIn);
  useMenuAction('zoom-out', desktopZoom.zoomOut);
  useMenuAction('zoom-reset', desktopZoom.resetZoom);

  if (!inTauri()) return null;

  return (
    <header
      aria-label={`${brand.name} desktop controls`}
      className="relative z-50 flex h-10 shrink-0 select-none items-stretch border-b border-border/70 bg-background text-foreground"
    >
      <div
        className={cn('flex items-center gap-0.5 px-1.5', macOS && MACOS_TRAFFIC_LIGHT_CLEARANCE)}
      >
        <DropdownMenu onOpenChange={setMenuOpen} open={menuOpen}>
          <DropdownMenuTrigger asChild>
            <Button aria-label="Open application menu" size="icon-sm" variant="ghost">
              <MoreIcon aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-56">
            <DropdownMenuLabel>{brand.name}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FileIcon aria-hidden="true" />
                File
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-56">
                <MenuActionItem action="new-session" shortcut="new-conversation">
                  <AddIcon aria-hidden="true" />
                  New conversation
                </MenuActionItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setClosePromptOpen(true)}>
                  <CloseIcon aria-hidden="true" />
                  Close window
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <EyeIcon aria-hidden="true" />
                View
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-56">
                <MenuActionItem action="search" shortcut="search">
                  <SearchIcon aria-hidden="true" />
                  Search
                </MenuActionItem>
                <DropdownMenuSeparator />
                <MenuActionItem action="toggle-left-bar" shortcut="left-pocket">
                  <PanelLeftIcon aria-hidden="true" />
                  Left bar
                </MenuActionItem>
                <MenuActionItem action="toggle-workbench" shortcut="right-pocket">
                  <PanelRightIcon aria-hidden="true" />
                  Workbench
                </MenuActionItem>
                <DropdownMenuSeparator />
                <MenuActionItem action="reload" shortcut="reload">
                  <RefreshIcon aria-hidden="true" />
                  Reload workspace
                </MenuActionItem>
                <DropdownMenuSeparator />
                <MenuActionItem action="zoom-reset" keepOpen shortcut="zoom-reset">
                  <ScanIcon aria-hidden="true" />
                  Actual size ({Math.round(desktopZoom.zoom * 100)}%)
                </MenuActionItem>
                <MenuActionItem action="zoom-in" keepOpen shortcut="zoom-in">
                  <ZoomInIcon aria-hidden="true" />
                  Zoom in
                </MenuActionItem>
                <MenuActionItem action="zoom-out" keepOpen shortcut="zoom-out">
                  <ZoomOutIcon aria-hidden="true" />
                  Zoom out
                </MenuActionItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  aria-keyshortcuts={fullscreenKeys?.aria}
                  onSelect={() => void runWindowAction('toggleFullscreen')}
                >
                  <PanelTopIcon aria-hidden="true" />
                  Toggle fullscreen
                  <DropdownMenuShortcut>
                    <ShortcutKeys id="fullscreen" variant="menu" />
                  </DropdownMenuShortcut>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <BotIcon aria-hidden="true" />
                Agent
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-56">
                <MenuActionItem action="connection-settings">
                  <ConnectionSettingsIcon aria-hidden="true" />
                  Connection settings
                </MenuActionItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <ArrowLeftRightIcon aria-hidden="true" />
                    Switch to
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-[300px]">
                    <SwitchAgentItems />
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <MenuActionItem action="manage-agents">
                  <ServerIcon aria-hidden="true" />
                  Manage agents
                </MenuActionItem>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <AddIcon aria-hidden="true" />
                    Add an agent…
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="min-w-56">
                    <MenuActionItem action="connect-by-address">
                      <Link2Icon aria-hidden="true" />
                      Connect by address
                    </MenuActionItem>
                    <MenuActionItem action="manage-agent-services">
                      <TerminalSquareIcon aria-hidden="true" />
                      Connect over SSH
                    </MenuActionItem>
                    <MenuActionItem action="install-agent">
                      <DownloadIcon aria-hidden="true" />
                      Install {brand.agentName} on a computer
                    </MenuActionItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <MenuActionItem action="open-infrastructure" shortcut="infrastructure">
                  <LayersIcon aria-hidden="true" />
                  Infrastructure
                </MenuActionItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <AppWindowIcon aria-hidden="true" />
                Window
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-56">
                <DropdownMenuItem onSelect={() => void runWindowAction('minimize')}>
                  <MinusIcon aria-hidden="true" />
                  Minimize
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void runWindowAction('toggleMaximize')}>
                  <Maximize2Icon aria-hidden="true" />
                  Maximize or restore
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <HelpIcon aria-hidden="true" />
                Help
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-56">
                <MenuActionItem action="help-docs">
                  <BookOpenIcon aria-hidden="true" />
                  Documentation
                </MenuActionItem>
                <MenuActionItem action="keyboard-shortcuts" shortcut="shortcuts">
                  <KeyboardIcon aria-hidden="true" />
                  Keyboard shortcuts
                </MenuActionItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <MenuActionItem action="about">
              <InfoIcon aria-hidden="true" />
              About {brand.wordmark}
            </MenuActionItem>
            <MenuActionItem action="open-settings" shortcut="settings">
              <SettingsIcon aria-hidden="true" />
              Settings
            </MenuActionItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() =>
                macOS
                  ? quitOrConfirm(countRunningSessions(queryClient))
                  : void runWindowAction('quit')
              }
            >
              <CloseIcon aria-hidden="true" />
              Quit {brand.wordmark}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label="Go back"
              onClick={() => window.history.back()}
              size="icon-sm"
              variant="ghost"
            >
              <ArrowLeftIcon aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Back</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label="Go forward"
              onClick={() => window.history.forward()}
              size="icon-sm"
              variant="ghost"
            >
              <ArrowRightIcon aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Forward</TooltipContent>
        </Tooltip>
      </div>

      <div
        className="flex items-center"
        ref={setWorkspaceNavigationHost}
        aria-label="Conversation navigation"
      />
      {/* No title-bar copy (spec fp 12): the workspace page's own top bar is portaled here,
          so web and desktop read the same. Its empty space drags the window; Tauri's drag
          script skips the buttons inside, and maximizes on a double-click natively. */}
      <div
        className="flex min-w-0 flex-1 items-center gap-1 px-1"
        data-tauri-drag-region="deep"
        data-testid="desktop-title-drag"
        id="desktop-workspace-toolbar"
        ref={setWorkspaceToolbarHost}
        aria-label="Workspace controls"
      />

      <div className="flex items-stretch gap-1 px-2">
        {macOS ? null : (
          <>
            <WindowButton action="minimize" label="Minimize">
              <MinusIcon aria-hidden="true" className="size-4" />
            </WindowButton>
            <WindowButton action="toggleMaximize" label="Maximize or restore">
              <Maximize2Icon aria-hidden="true" className="size-3.5" />
            </WindowButton>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  aria-label="Close"
                  className="grid h-10 w-12 place-items-center text-muted-foreground transition-colors hover:bg-destructive hover:text-background"
                  onClick={() => setClosePromptOpen(true)}
                  type="button"
                >
                  <CloseIcon aria-hidden="true" className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Close or keep running</TooltipContent>
            </Tooltip>
          </>
        )}
      </div>
      <AlertDialog onOpenChange={setClosePromptOpen} open={closePromptOpen}>
        <AlertDialogContent
          onBackdropClick={() => setClosePromptOpen(false)}
          onEscapeKeyDown={() => setClosePromptOpen(false)}
        >
          <AlertDialogCancel
            aria-label="Dismiss close prompt"
            className="absolute right-2 top-2 text-muted-foreground"
            size="icon-sm"
            variant="ghost"
          >
            <CloseIcon aria-hidden="true" className="size-4" />
          </AlertDialogCancel>
          <AlertDialogHeader>
            <AlertDialogTitle>Keep {vocab.product} running?</AlertDialogTitle>
            <AlertDialogDescription>
              Keep {vocab.product} available in{' '}
              {macOS ? 'the menu bar' : 'the system tray (Windows hidden icons)'}, or quit and stop
              its local services. Ongoing work can continue only while {vocab.product} is running.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => void runWindowAction('hide')}>
              Keep running
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => void runWindowAction('quit')} variant="destructive">
              Quit {vocab.product}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog onOpenChange={(open) => !open && setRunningAtQuit(0)} open={runningAtQuit > 0}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Quit {vocab.product}?</AlertDialogTitle>
            <AlertDialogDescription>
              {runningAtQuit === 1
                ? '1 conversation is still running.'
                : `${runningAtQuit} conversations are still running.`}{' '}
              Quitting stops {runningAtQuit === 1 ? 'it' : 'them'} and {vocab.product}'s local
              services.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void runWindowAction('quit')} variant="destructive">
              Quit {vocab.product}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
