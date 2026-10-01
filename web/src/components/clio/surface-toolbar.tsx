import { CheckIcon, CopyIcon, DownloadIcon, Maximize2Icon, Minimize2Icon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
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
 * Component-specific state controls that are not a G0 download/select/
 * zoom/full-screen/reference affordance (a view-mode toggle, a "reset zoom"
 * button, a keyboard selection fallback) are NOT part of this shared
 * surface — a component renders those itself, in its own header, same as
 * before this redesign.
 *
 * Because this toolbar is `position: absolute` (out of flow) rather than a
 * trailing flex item, a component with its own header content reserves
 * space for it explicitly (`pr-36`, ~the widest toolbar's four icon buttons
 * plus its corner offset) — a Playwright run caught the alternative: a
 * header's own trailing control (the map's "Show the locations list", the
 * chart's keyboard-select/reset-zoom, the mermaid/workflow render-source
 * toggle, the mesh viewport's "Reset view") flowing all the way to the edge
 * and sitting UNDER the toolbar once hover reveals it, stealing its clicks.
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
  /** The download menu, nested in the overflow. Omit entirely when the component has nothing to export. */
  exportFormats?: readonly SurfaceExportFormat[];
  /** A single one-click copy affordance (e.g. a metric's value, a code block's text), nested in the overflow. */
  onCopy?: () => void | Promise<void>;
  copyLabel?: string;
  /** "Reference this" (G0's model affordance): present whenever the component can describe a zone. Primary (always visible when declared, never buried in the overflow). */
  buildReference?: () => DataZoneReference;
  /** Primary (always visible when declared). */
  fullScreen?: SurfaceFullScreenControl;
  /** A component's own filter popover (e.g. `DataFilterPopover`), already a self-contained icon button + popover. Primary (always visible when declared). */
  filters?: ReactNode;
  /** A short description of the surface's selection/linking affordance, shown as an informational row in the overflow (e.g. "Shift+drag to select an area"). */
  selectionHint?: ReactNode;
}

/** Whether `capabilities` would render anything at all (callers use this to skip an empty toolbar wrapper). */
// oxlint-disable-next-line react/only-export-components
export function hasToolbarContent(capabilities: SurfaceCapabilities | undefined): boolean {
  if (!capabilities) return false;
  return Boolean(
    capabilities.exportFormats?.length ||
      capabilities.onCopy ||
      capabilities.buildReference ||
      capabilities.fullScreen ||
      capabilities.filters ||
      capabilities.selectionHint,
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

function DownloadSubmenu({ formats }: { formats: readonly SurfaceExportFormat[] }) {
  const [busy, setBusy] = useState(false);
  if (!formats.length) return null;
  const run = (format: SurfaceExportFormat) => {
    setBusy(true);
    void Promise.resolve(format.run()).finally(() => setBusy(false));
  };
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger disabled={busy}>
        <DownloadIcon aria-hidden="true" className="size-3.5" />
        Download
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {formats.map((format) => (
          <DropdownMenuItem disabled={format.disabled || busy} key={format.id} onSelect={() => run(format)}>
            {format.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function CopyMenuItem({ label = 'Copy', onCopy }: { label?: string; onCopy: () => void | Promise<void> }) {
  const [copied, setCopied] = useState(false);
  return (
    <DropdownMenuItem
      onSelect={(event) => {
        // Stays open long enough to show the transient confirmation, same as
        // the inline button this replaces.
        event.preventDefault();
        void Promise.resolve(onCopy()).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
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

/** Renders every affordance `capabilities` declares, in the same order and shape everywhere. */
export function SurfaceToolbar({ capabilities }: { capabilities: SurfaceCapabilities }) {
  const [menuOpen, setMenuOpen] = useState(false);
  if (!hasToolbarContent(capabilities)) return null;
  const { buildReference, copyLabel, exportFormats, filters, fullScreen, onCopy, selectionHint } = capabilities;
  const hasOverflow = Boolean(exportFormats?.length || selectionHint || onCopy);
  return (
    <div
      className={cn(
        'absolute right-1.5 top-1.5 z-10 flex items-center gap-0.5 rounded-md',
        'opacity-100 transition-opacity duration-150 motion-reduce:transition-none',
        // Hover/focus reveal: only on devices that actually have hover (a
        // mouse/trackpad). Touch devices keep the controls visible, at the
        // base (low) emphasis set above, per the owner's ruling.
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
        // Stays revealed (and clickable) while one of its own menus/popovers
        // is open, even if the pointer or focus has moved off the surface in
        // the meantime.
        menuOpen && '![@media(hover:hover)]:opacity-100 [@media(hover:hover)]:pointer-events-auto',
      )}
      data-slot="surface-toolbar"
    >
      <TooltipProvider delayDuration={150}>
        {filters}
        {buildReference ? <DataReferenceThisButton buildReference={buildReference} /> : null}
        {fullScreen ? (
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
                  <Button aria-label="More" size="icon-sm" variant="ghost">
                    <MoreIcon aria-hidden="true" className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">More</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              {exportFormats?.length ? <DownloadSubmenu formats={exportFormats} /> : null}
              {selectionHint ? (
                <div
                  className="flex items-center gap-1.5 px-1.5 py-1 text-xs text-muted-foreground"
                  data-slot="surface-toolbar-selection-hint"
                >
                  {selectionHint}
                </div>
              ) : null}
              {onCopy ? <CopyMenuItem label={copyLabel} onCopy={onCopy} /> : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </TooltipProvider>
    </div>
  );
}
