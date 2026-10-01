import { CopyIcon, DownloadIcon, Maximize2Icon, Minimize2Icon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataReferenceThisButton } from './data-reference-this-button';
import { useDataHeaderCompact } from './data-header-density';
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
  /** The download menu. Omit entirely when the component has nothing to export. */
  exportFormats?: readonly SurfaceExportFormat[];
  /** A single one-click copy affordance (e.g. a metric's value, a code block's text). */
  onCopy?: () => void | Promise<void>;
  copyLabel?: string;
  /** "Reference this" (G0's model affordance): present whenever the component can describe a zone. */
  buildReference?: () => DataZoneReference;
  fullScreen?: SurfaceFullScreenControl;
  /** A component's own filter popover (e.g. `DataFilterPopover`), slotted in before the shared controls. */
  filters?: ReactNode;
  /** A short inline hint (e.g. "Shift+drag to select an area"). */
  selectionHint?: ReactNode;
  /** Escape hatch for a control that does not fit the declared shapes above. Used sparingly. */
  extra?: ReactNode;
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
      capabilities.selectionHint ||
      capabilities.extra,
  );
}

function DownloadMenu({ formats }: { formats: readonly SurfaceExportFormat[] }) {
  const compact = useDataHeaderCompact();
  const [busy, setBusy] = useState(false);
  if (!formats.length) return null;
  const run = (format: SurfaceExportFormat) => {
    setBusy(true);
    void Promise.resolve(format.run()).finally(() => setBusy(false));
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Download"
          className="gap-1.5"
          disabled={busy}
          size="sm"
          title="Download"
          variant="outline"
        >
          <DownloadIcon aria-hidden="true" className="size-3.5" />
          {compact ? null : 'Download'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {formats.map((format) => (
          <DropdownMenuItem disabled={format.disabled} key={format.id} onSelect={() => run(format)}>
            {format.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CopyButton({ label = 'Copy', onCopy }: { label?: string; onCopy: () => void | Promise<void> }) {
  const compact = useDataHeaderCompact();
  const [copied, setCopied] = useState(false);
  return (
    <Button
      aria-label={label}
      className="gap-1.5 text-xs"
      onClick={() => {
        void Promise.resolve(onCopy()).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      size="sm"
      title={label}
      variant="outline"
    >
      <CopyIcon aria-hidden="true" className="size-3.5" />
      {compact ? null : copied ? 'Copied' : label}
    </Button>
  );
}

function FullScreenButton({ control }: { control: SurfaceFullScreenControl }) {
  const compact = useDataHeaderCompact();
  const label = control.isOpen ? 'Exit full screen' : 'Full screen';
  return (
    <Button
      aria-label={label}
      aria-pressed={control.isOpen}
      className="gap-1.5"
      onClick={control.onToggle}
      size="sm"
      title={label}
      variant="outline"
    >
      {control.isOpen ? (
        <Minimize2Icon aria-hidden="true" className="size-3.5" />
      ) : (
        <Maximize2Icon aria-hidden="true" className="size-3.5" />
      )}
      {compact ? null : label}
    </Button>
  );
}

/** Renders every affordance `capabilities` declares, in the same order and shape everywhere. */
export function SurfaceToolbar({ capabilities }: { capabilities: SurfaceCapabilities }) {
  if (!hasToolbarContent(capabilities)) return null;
  const { buildReference, copyLabel, exportFormats, extra, filters, fullScreen, onCopy, selectionHint } =
    capabilities;
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-slot="surface-toolbar">
      {filters}
      {selectionHint}
      {extra}
      {exportFormats?.length ? <DownloadMenu formats={exportFormats} /> : null}
      {onCopy ? <CopyButton label={copyLabel} onCopy={onCopy} /> : null}
      {buildReference ? <DataReferenceThisButton buildReference={buildReference} /> : null}
      {fullScreen ? <FullScreenButton control={fullScreen} /> : null}
    </div>
  );
}
