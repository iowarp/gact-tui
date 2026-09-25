import { brand } from '@brand';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CircleHelpIcon,
  InfoIcon,
  Maximize2Icon,
  MinusIcon,
  MoreHorizontalIcon,
  PanelTopIcon,
  PlusIcon,
  RotateCwIcon,
  ServerIcon,
  SettingsIcon,
  XIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DesktopTitleContext } from '@/components/clio/desktop-title-context';
import { LiveConnectionIndicator } from '@/components/clio/live-connection-indicator';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { vocab } from '@/lib/brand-vocabulary';
import { isMacOS } from '@/lib/platform';
import { cn } from '@/lib/utils';
import { listenForCloseFallbackHidden, listenForCloseRequested } from '@/tauri/desktop-lifecycle';
import { dispatchMenuAction } from '@/tauri/menu-actions';
import {
  ackClosePromptShown,
  runDesktopWindowAction,
  type DesktopWindowAction,
} from '@/tauri/desktop-window';

// macOS keeps its native traffic lights (top-left); the bar's left section
// is padded clear of them so the hamburger/brand block never sits under
// natively-drawn chrome. Matches the traffic-light cluster's rough width
// plus margin — see tauri.macos.conf.json's titleBarStyle: Overlay.
const MACOS_TRAFFIC_LIGHT_CLEARANCE = 'pl-20';

function logoSource(): string | null {
  return (
    brand.logoImage ??
    (brand.logoSvg ? `data:image/svg+xml,${encodeURIComponent(brand.logoSvg)}` : null)
  );
}

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
            danger ? 'hover:bg-destructive hover:text-white' : 'hover:bg-accent'
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

/** Product-owned chrome for the frameless Tauri window. */
export function DesktopTitleBar() {
  const [closePromptOpen, setClosePromptOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [macOS] = useState(isMacOS);

  // Native close (Alt+F4, the OS close box, the traffic light) opens the
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

  // Alt+Space is the conventional Windows/Linux "open the window's system
  // menu" shortcut; the hamburger IS that menu here, so it answers to the
  // same key. New session / Settings / fullscreen are bound here too: the
  // hamburger advertises Ctrl N / Ctrl , / F11 as their shortcuts, but
  // nothing bound them on Windows/Linux, and trimming the native macOS menu
  // down to About/Settings/hide-group/Quit (see menu_spec.rs) dropped its
  // Cmd+N item along with it — so this is now the ONLY binding for new
  // session and fullscreen on every platform, and macOS's native Cmd+Comma
  // accelerator (which still exists) simply overlaps harmlessly with this
  // one (`dispatchMenuAction`/settings navigation are idempotent). Also
  // registered unconditionally, ahead of the early return, for the same
  // hooks-order reason as the effect above.
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.altKey && event.code === 'Space') {
        event.preventDefault();
        setMenuOpen(true);
        return;
      }
      const primaryModifier = event.metaKey || event.ctrlKey;
      if (primaryModifier && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        dispatchMenuAction('new-session');
        return;
      }
      if (primaryModifier && event.key === ',') {
        event.preventDefault();
        dispatchMenuAction('open-settings');
        return;
      }
      if (event.key === 'F11') {
        event.preventDefault();
        void runWindowAction('toggleFullscreen');
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  if (!inTauri()) return null;
  const logo = logoSource();

  return (
    <header
      aria-label={`${brand.name} desktop controls`}
      className="relative z-50 flex h-10 shrink-0 select-none items-stretch border-b border-border/70 bg-background/95 text-foreground shadow-xs backdrop-blur"
    >
      <div
        className={cn('flex items-center gap-0.5 px-1.5', macOS && MACOS_TRAFFIC_LIGHT_CLEARANCE)}
      >
        <DropdownMenu onOpenChange={setMenuOpen} open={menuOpen}>
          <DropdownMenuTrigger asChild>
            <Button aria-label="Open application menu" size="icon-sm" variant="ghost">
              <MoreHorizontalIcon aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-56">
            <DropdownMenuLabel>{brand.name}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => dispatchMenuAction('new-session')}>
              <PlusIcon aria-hidden="true" />
              New session
              <DropdownMenuShortcut>{macOS ? '⌘N' : 'Ctrl N'}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => dispatchMenuAction('manage-agent-services')}>
              <ServerIcon aria-hidden="true" />
              Connect or deploy {vocab.agent}…
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => dispatchMenuAction('open-settings')}>
              <SettingsIcon aria-hidden="true" />
              Settings
              <DropdownMenuShortcut>{macOS ? '⌘,' : 'Ctrl ,'}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => window.location.reload()}>
              <RotateCwIcon aria-hidden="true" />
              Reload workspace
              <DropdownMenuShortcut>Ctrl R</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void runWindowAction('toggleFullscreen')}>
              <PanelTopIcon aria-hidden="true" />
              Toggle fullscreen
              <DropdownMenuShortcut>F11</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => dispatchMenuAction('help-docs')}>
              <CircleHelpIcon aria-hidden="true" />
              Documentation
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => dispatchMenuAction('about')}>
              <InfoIcon aria-hidden="true" />
              About {brand.wordmark}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => void runWindowAction('quit')}>
              <XIcon aria-hidden="true" />
              Quit {brand.wordmark}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
        <span className="grid size-5 place-items-center rounded-md bg-primary/12 text-primary">
          {logo ? (
            <img alt="" className="size-4 object-contain" draggable={false} src={logo} />
          ) : (
            <span aria-hidden="true" className="text-[10px] font-semibold">
              {brand.markGlyph}
            </span>
          )}
        </span>
        <span className="text-xs font-medium">{brand.wordmark}</span>
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

      <DesktopTitleContext />

      <div className="flex items-stretch gap-1 px-2">
        <LiveConnectionIndicator />
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
                  className="grid h-10 w-12 place-items-center text-muted-foreground transition-colors hover:bg-destructive hover:text-white"
                  onClick={() => setClosePromptOpen(true)}
                  type="button"
                >
                  <XIcon aria-hidden="true" className="size-4" />
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
            <XIcon aria-hidden="true" className="size-4" />
          </AlertDialogCancel>
          <AlertDialogHeader>
            <AlertDialogTitle>Keep {vocab.product} running?</AlertDialogTitle>
            <AlertDialogDescription>
              Keep {vocab.product} available in the system tray (Windows hidden icons), or quit and
              stop its local services. Ongoing work can continue only while {vocab.product} is
              running.
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
    </header>
  );
}
