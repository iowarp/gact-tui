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
  SettingsIcon,
  XIcon,
} from 'lucide-react';
import { toast } from 'sonner';
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
import { inTauri } from '@/lib/transport/tauri-runtime';
import { dispatchMenuAction } from '@/tauri/menu-actions';
import { runDesktopWindowAction, type DesktopWindowAction } from '@/tauri/desktop-window';

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
    toast.error('CLIO could not update the desktop window.');
  }
}

function WindowButton({
  action,
  children,
  danger = false,
  label,
}: {
  action: Exclude<DesktopWindowAction, 'toggleFullscreen'>;
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
  if (!inTauri()) return null;
  const logo = logoSource();

  return (
    <header
      aria-label={`${brand.name} desktop controls`}
      className="relative z-50 flex h-10 shrink-0 select-none items-stretch border-b border-border/70 bg-background/95 text-foreground shadow-xs backdrop-blur"
    >
      <div className="flex items-center gap-0.5 px-1.5">
        <DropdownMenu>
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
              <DropdownMenuShortcut>Ctrl N</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => dispatchMenuAction('open-settings')}>
              <SettingsIcon aria-hidden="true" />
              Settings
              <DropdownMenuShortcut>Ctrl ,</DropdownMenuShortcut>
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
            <DropdownMenuItem variant="destructive" onSelect={() => void runWindowAction('close')}>
              <XIcon aria-hidden="true" />
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
        className="flex min-w-0 flex-1 items-center justify-center gap-2 text-xs font-medium text-muted-foreground"
        data-tauri-drag-region
        onDoubleClick={() => void runWindowAction('toggleMaximize')}
      >
        <span className="grid size-5 place-items-center rounded-md bg-primary/12 text-primary">
          {logo ? (
            <img alt="" className="size-4 object-contain" draggable={false} src={logo} />
          ) : (
            <span aria-hidden="true" className="text-[10px] font-semibold">
              {brand.markGlyph}
            </span>
          )}
        </span>
        <span data-tauri-drag-region>{brand.wordmark}</span>
      </div>

      <div className="flex items-stretch">
        <WindowButton action="minimize" label="Minimize">
          <MinusIcon aria-hidden="true" className="size-4" />
        </WindowButton>
        <WindowButton action="toggleMaximize" label="Maximize or restore">
          <Maximize2Icon aria-hidden="true" className="size-3.5" />
        </WindowButton>
        <WindowButton action="close" danger label="Close">
          <XIcon aria-hidden="true" className="size-4" />
        </WindowButton>
      </div>
    </header>
  );
}
