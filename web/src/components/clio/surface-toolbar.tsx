import {
  CheckIcon,
  CameraIcon,
  CopyIcon,
  DownloadIcon,
  LoaderCircleIcon,
  Maximize2Icon,
  Minimize2Icon,
} from 'lucide-react';
import { type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { MoreIcon } from '@/lib/icon-vocabulary';
import { cn } from '@/lib/utils';
import { DataReferenceThisButton } from './data-reference-this-button';
import type { DataZoneReference } from './data-zone-reference';
import { A2uiRegionCaptureContext } from './a2ui-region-capture';

/**
 * The ONE shared affordance framework (G0): a per-component capability
 * declaration plus the toolbar that renders it. Every component in the G0
 * table (chart, map, table, metric, mesh viewport, mermaid, workflow,
 * code/diff, Image, data-bound List, artifact) renders `SurfaceToolbar` from
 * one of these, instead of its own bespoke header buttons — same affordances,
 * same place, everywhere, decided by the renderer rather than the agent's
 * spec (see `feedback_affordances_are_renderer_defaults`).
 *
 * A capability a component does not declare simply renders nothing: layout,
 * text and input components pass no capabilities at all and get no toolbar.
 *
 * Design (owner review, 2026-10-01 — "controlled messy, not uncontrolled
 * messy"): the toolbar is icon-only (every label lives in a tooltip and the
 * accessible name), floats over the component's own top-right corner with no
 * header row or background chrome of its own, and is revealed on hover/focus
 * of the surface (always visible, at low emphasis, on touch). Every
 * component renders the SAME controls in the SAME canonical order, declared
 * ONCE here — a component only says which entries it supports; it never
 * reorders or restyles them:
 *   [Filters?] [Reference this?] [Full screen?] [More ▾?]
 * with the overflow menu always ordered Download ▸, Selection, Copy.
 * Component-specific secondary actions and details (a view-mode toggle, a
 * reset action, row counts) join the same overflow menu through
 * `overflowContent`; they do not create another header or toolbar.
 *
 * `floating` (default `true`) picks the layout: a header-less component gets
 * the original `position: absolute` corner overlay; a component with its own
 * header row passes `floating={false}` and renders this as that header's
 * trailing flex item (`margin-inline-start: auto`) instead. An earlier
 * version of this toolbar was ALWAYS `position: absolute`, which forced every
 * header-having caller to reserve a fixed `pr-36` of padding so its own
 * trailing content (the map's "Show the locations list", the chart's
 * keyboard-select/reset-zoom, the mermaid/workflow render-source toggle, the
 * mesh viewport's "Reset view") did not flow all the way to the edge and sit
 * UNDER the toolbar once hover revealed it, stealing its clicks (a real bug a
 * Playwright run caught) -- `floating={false}` removes the need for that
 * fragile fixed reservation entirely (#516 review item 16).
 */

/** One entry in the download format menu. `run` does the actual export (client-side or via a server route). */
export interface SurfaceExportFormat {
  /** Stable id, e.g. "png", "svg", "jpg", "csv", "json", "parquet", "source", "original". */
  id: string;
  /** Menu label, e.g. "PNG image", "CSV (current view)", "Original file". */
  label: string;
  run: () => void | Promise<void>;
  disabled?: boolean;
}

export interface SurfaceFullScreenControl {
  isOpen: boolean;
  onToggle: () => void;
}

export interface SurfaceCapabilities {
  /** Preserve the protocol component identity when a full-screen toolbar is portalled outside it. */
  captureComponentId?: string;
  /** The download menu, nested in the overflow. Omit entirely when the component has nothing to export. */
  exportFormats?: readonly SurfaceExportFormat[];
  /**
   * A single one-click copy affordance (e.g. a metric's value, a code
   * block's text), nested in the overflow. Returns whether the copy
   * actually succeeded (`copyTextToClipboard`'s own result, never
   * swallowed) -- the toolbar shows "Copied" only on `true` and a failure
   * notice otherwise; a `false` return is never treated as success.
   */
  onCopy?: () => boolean | Promise<boolean>;
  copyLabel?: string;
  /** "Reference this" (G0's model affordance): present whenever the component can describe a zone. Primary (always visible when declared, never buried in the overflow). */
  buildReference?: () => DataZoneReference;
  /** Primary (always visible when declared). */
  fullScreen?: SurfaceFullScreenControl;
  /**
   * A component's own filter popover (e.g. `DataFilterPopover`), already a
   * self-contained icon button + popover. Primary (always visible when
   * declared). `isOpen` is the popover's own open state, fed back from the
   * component: without it, opening Filters (which can move the pointer off
   * the hover-revealed surface entirely, e.g. opening upward into the page
   * above a short card) would let the toolbar's hover-reveal fade it back
   * out from under an open popover (#516 review item 12).
   */
  filters?: { content: ReactNode; isOpen?: boolean };
  /** A short description of the surface's selection/linking affordance, shown as an informational row in the overflow (e.g. "Shift+drag to select an area"). */
  selectionHint?: ReactNode;
  /** Component-specific secondary actions and details, placed after downloads in the shared overflow. */
  overflowContent?: ReactNode;
}

/** Whether `capabilities` would render anything at all (callers use this to skip an empty toolbar wrapper). */
// oxlint-disable-next-line react/only-export-components
export function hasToolbarContent(capabilities: SurfaceCapabilities | undefined): boolean {
  if (!capabilities) return false;
  return Boolean(
    capabilities.exportFormats?.length ||
      capabilities.onCopy ||
      capabilities.buildReference ||
      (capabilities.fullScreen && !capabilities.fullScreen.isOpen) ||
      capabilities.filters ||
      capabilities.selectionHint ||
      capabilities.overflowContent,
  );
}

function ToolbarIconButton({
  'aria-pressed': ariaPressed,
  busy,
  icon,
  label,
  onClick,
}: {
  'aria-pressed'?: boolean;
  busy?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          aria-pressed={ariaPressed}
          disabled={busy}
          onClick={onClick}
          size="icon-sm"
          variant="ghost"
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * A thrown value's human-readable reason -- never just "[object Object]" or
 * "undefined". Checks for a `.message` string by DUCK TYPE, not only
 * `instanceof Error`: a `DOMException` (a real browser's `canvas.toBlob`
 * permission denial, a clipboard `SecurityError`/`NotAllowedError`) does not
 * inherit from `Error` but still carries a meaningful `message`.
 */
function exportFailureReason(error: unknown): string {
  if (typeof error === 'string' && error) return error;
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string' &&
    (error as { message: string }).message
  ) {
    return (error as { message: string }).message;
  }
  return 'the export failed for an unknown reason';
}

function DownloadSubmenu({
  formats,
  busy,
  setBusy,
}: {
  formats: readonly SurfaceExportFormat[];
  busy: boolean;
  setBusy: (busy: boolean) => void;
}) {
  if (!formats.length) return null;
  const run = (format: SurfaceExportFormat) => {
    setBusy(true);
    // No silent failures (#516 review item 10): a 413/500 from the server
    // export route, a canvas `toBlob` returning `null`, a denied clipboard/
    // download permission (`SecurityError`), or any other rejection must
    // surface to the person who clicked Download, not vanish into an
    // unhandled rejection.
    void Promise.resolve(format.run())
      .catch((error: unknown) => {
        toast.error(`Couldn't download ${format.label}`, {
          description: exportFailureReason(error),
        });
      })
      .finally(() => setBusy(false));
  };
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger disabled={busy}>
        <DownloadIcon aria-hidden="true" className="size-3.5" />
        Download
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {formats.map((format) => (
          <DropdownMenuItem
            disabled={format.disabled || busy}
            key={format.id}
            onSelect={() => run(format)}
          >
            {format.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function CopyMenuItem({
  label = 'Copy',
  onCopy,
}: {
  label?: string;
  onCopy: () => boolean | Promise<boolean>;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <DropdownMenuItem
      onSelect={(event) => {
        // Stays open long enough to show the transient confirmation, same as
        // the inline button this replaces.
        event.preventDefault();
        void Promise.resolve(onCopy())
          .then((succeeded) => {
            // A `false` result (clipboard API unavailable or denied) is
            // never shown as "Copied" (#516 review item 11) -- the person
            // needs to know the text is NOT on their clipboard.
            if (!succeeded) {
              toast.error(`Couldn't copy ${label.toLowerCase()}`, {
                description: 'The clipboard is unavailable or the browser denied access.',
              });
              return;
            }
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
          .catch((error: unknown) => {
            toast.error(`Couldn't copy ${label.toLowerCase()}`, {
              description: exportFailureReason(error),
            });
          });
      }}
    >
      {copied ? (
        <CheckIcon aria-hidden="true" className="size-3.5" />
      ) : (
        <CopyIcon aria-hidden="true" className="size-3.5" />
      )}
      {copied ? 'Copied' : label}
    </DropdownMenuItem>
  );
}

export interface SurfaceToolbarProps {
  capabilities: SurfaceCapabilities;
  /**
   * `false` for a component that has its own header row: the toolbar renders
   * IN-FLOW as that header's trailing item (`margin-inline-start: auto` pushes
   * it to the end), rather than floating `position: absolute` over the
   * card's corner. Defaults to `true` (floating) for a header-less
   * component, which has nothing else to lay the toolbar out alongside.
   *
   * The floating variant used to require every header-having caller to
   * reserve a fixed `pr-36` of padding so its own trailing content (a reset-
   * zoom button, a view toggle, ...) did not sit underneath the toolbar's
   * absolute corner once hover revealed it -- a real bug a Playwright run
   * caught. An in-flow toolbar needs no such reservation: it is a normal
   * flex item its siblings wrap around (#516 review item 16).
   */
  floating?: boolean;
}

/** Renders every affordance `capabilities` declares, in the same order and shape everywhere. */
export function SurfaceToolbar({ capabilities, floating = true }: SurfaceToolbarProps) {
  const capture = useContext(A2uiRegionCaptureContext);
  const [menuOpen, setMenuOpen] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // The hover-reveal classes below only ever activate under a `.group`
    // ancestor (`group-hover:`/`group-focus-within:`). A caller that forgets
    // that class on its card gets a toolbar permanently stuck at
    // `opacity-0` on any hover-capable device, with no way to reveal it --
    // the exact "silently invisible toolbar" failure item 12 calls out. This
    // never changes behavior; it only turns that silent failure into a
    // visible dev-time error.
    if (import.meta.env.DEV && rootRef.current && !rootRef.current.closest('.group')) {
      console.error(
        '[SurfaceToolbar] rendered with no ".group" ancestor: its hover/focus-reveal ' +
          'classes depend on one, so it will stay invisible on any hover-capable device. ' +
          "Add `group` to the component's own card/container className.",
      );
    }
  });
  if (!hasToolbarContent(capabilities)) return null;
  const {
    buildReference,
    copyLabel,
    exportFormats,
    filters,
    fullScreen,
    onCopy,
    overflowContent,
    selectionHint,
  } = capabilities;
  const hasOverflow = Boolean(exportFormats?.length || overflowContent || selectionHint || onCopy);
  // Stays revealed (and clickable) while one of its own menus/popovers is
  // open, even if the pointer or focus has moved off the surface in the
  // meantime (e.g. a Filters popover opened upward, or a long "More" menu).
  const forceRevealed = menuOpen || downloadBusy || Boolean(filters?.isOpen);
  return (
    <div
      ref={rootRef}
      className={cn(
        'z-10 flex shrink-0 items-center gap-0.5 rounded-md',
        floating ? 'absolute end-1.5 top-1.5' : 'ms-auto',
        // Base (touch/no-hover) state: visible but at LOW emphasis, never
        // full-strength chrome sitting over the component's own content on a
        // device with no hover to fade it in from (#516 review item 12 —
        // the base class here used to say "opacity-100" despite the comment
        // already promising low emphasis on touch).
        'opacity-60 transition-opacity duration-150 motion-reduce:transition-none',
        // Hover/focus reveal: only on devices that actually have hover (a
        // mouse/trackpad) does the toolbar hide completely until revealed.
        '[@media(hover:hover)]:opacity-0',
        '[@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100',
        // `pointer-events` travels WITH `opacity` (never on its own): an
        // `opacity-0` element is still hit-tested by default, so without this
        // the toolbar's own invisible hover-target area sits on top of (and
        // silently swallows clicks meant for) the chart/map/table content
        // underneath it — a real bug a Playwright run caught (clicking a map
        // point near the toolbar's corner hit the toolbar instead).
        '[@media(hover:hover)]:pointer-events-none',
        '[@media(hover:hover)]:group-hover:pointer-events-auto [@media(hover:hover)]:group-focus-within:pointer-events-auto',
        // Tailwind v4's important modifier is a TRAILING `!` on the utility
        // itself (`opacity-100!`), not a leading `!` before the variant
        // stack -- a leading `!` is not a recognized modifier at all and the
        // whole class is dropped silently, which is exactly how this toolbar
        // was found still fading out from under an open menu (#516 review
        // item 12).
        forceRevealed &&
          '[@media(hover:hover)]:opacity-100! [@media(hover:hover)]:pointer-events-auto!',
      )}
      data-slot="surface-toolbar"
    >
      <TooltipProvider delayDuration={150}>
        {filters?.content}
        {capture ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  aria-label="Capture labelled regions"
                  disabled={!capture.allowed}
                  onClick={() => {
                    const container = rootRef.current?.closest<HTMLElement>('[data-slot^="a2ui-"]')
                      ?? rootRef.current?.closest<HTMLElement>('[data-slot="dialog-content"]')
                      ?? rootRef.current?.closest<HTMLElement>('.group');
                    if (!container) return;
                    // Capture the rendered chart itself. The full-screen dialog
                    // has substantial empty space and its size changes when the
                    // host returns inline; chart-relative boxes stay aligned.
                    const element = container.querySelector<HTMLElement>('[data-slot="a2ui-chart-view"]')
                      ?? container.querySelector<HTMLElement>('[data-slot="a2ui-map-surface"]')
                      ?? container.querySelector<HTMLElement>('[data-slot="a2ui-raster-surface"]')
                      ?? container.querySelector('canvas')?.closest<HTMLElement>('[role="img"]')
                      ?? container;
                    const title = container.querySelector('h1,h2,h3,h4')?.textContent?.trim()
                      || container.getAttribute('data-slot')?.replaceAll('-', ' ')
                      || 'Interactive surface';
                    const componentId = capabilities?.captureComponentId ?? container.dataset.a2uiComponentId
                      ?? container.querySelector<HTMLElement>('[data-a2ui-component-id]')?.dataset.a2uiComponentId;
                    capture.start({ element, title, componentId, reference: buildReference });
                  }}
                  size="icon-sm"
                  variant="ghost"
                ><CameraIcon aria-hidden="true" className="size-3.5" /></Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">{capture.allowed ? 'Capture labelled regions' : 'Choose a model that accepts images to capture a region'}</TooltipContent>
          </Tooltip>
        ) : null}
        {buildReference ? <DataReferenceThisButton buildReference={buildReference} /> : null}
        {fullScreen && !fullScreen.isOpen ? (
          <ToolbarIconButton
            aria-pressed={fullScreen.isOpen}
            icon={
              fullScreen.isOpen ? (
                <Minimize2Icon aria-hidden="true" className="size-3.5" />
              ) : (
                <Maximize2Icon aria-hidden="true" className="size-3.5" />
              )
            }
            label={fullScreen.isOpen ? 'Exit full screen' : 'Full screen'}
            onClick={fullScreen.onToggle}
          />
        ) : null}
        {hasOverflow ? (
          <DropdownMenu onOpenChange={setMenuOpen} open={menuOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    aria-label={downloadBusy ? 'Downloading' : 'More'}
                    size="icon-sm"
                    variant="ghost"
                  >
                    {downloadBusy ? (
                      <LoaderCircleIcon aria-hidden="true" className="size-3.5 animate-spin" />
                    ) : (
                      <MoreIcon aria-hidden="true" className="size-3.5" />
                    )}
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">More</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              {exportFormats?.length ? (
                <DownloadSubmenu
                  formats={exportFormats}
                  busy={downloadBusy}
                  setBusy={setDownloadBusy}
                />
              ) : null}
              {overflowContent}
              {selectionHint ? (
                // A disabled `DropdownMenuItem`, not a bare `<div>` (#516
                // review item 16): a plain div sits outside the menu's roving
                // tabindex entirely, so a keyboard user arrowing through
                // Download/Copy never lands on (or hears, via a screen
                // reader's menu navigation) this hint at all. `disabled`
                // keeps it in that sequence and announced, without making it
                // actionable -- it is informational text, not a command.
                <DropdownMenuItem
                  className="text-xs text-muted-foreground"
                  data-slot="surface-toolbar-selection-hint"
                  disabled
                  onSelect={(event) => event.preventDefault()}
                >
                  {selectionHint}
                </DropdownMenuItem>
              ) : null}
              {onCopy ? <CopyMenuItem label={copyLabel} onCopy={onCopy} /> : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </TooltipProvider>
    </div>
  );
}
