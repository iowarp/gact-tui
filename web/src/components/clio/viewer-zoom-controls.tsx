import { ZoomInIcon, ZoomOutIcon } from 'lucide-react';
import { useContext, useMemo, useRef, type ReactNode } from 'react';
import { useShortcut } from '@/lib/shortcuts/hooks';
import { cn } from '@/lib/utils';
import { FileViewerInformationHost } from './file-viewer-context';
import { frameKeyRegion } from './file-viewer-modes';
import { ToolbarAction, ViewerToolbarContent } from './viewer-toolbar';
import { ViewerToolbarHost } from './viewer-toolbar-context';

const noop = () => {};

/**
 * A document's page position before its pages are counted: it holds the
 * "3 / 12" place between the zoom icons so zoom-in doesn't move once it arrives.
 */
export function PendingPageReadout() {
  return (
    <span aria-hidden="true" className="opacity-60">
      – / –
    </span>
  );
}

/**
 * A renderer's zoom icons, off, while its content is still on the way, so the
 * frame shows the loaded bar from first paint (workbench-frame-bar: Loading)
 * and nothing in it moves or folds differently once the content arrives.
 */
export function PendingZoomControls({ label, readout }: { label: string; readout?: ReactNode }) {
  return (
    <ViewerZoomControls
      disabledIn
      disabledOut
      label={label}
      onIn={noop}
      onOut={noop}
      readout={readout}
    />
  );
}

/**
 * A viewer's two zoom icons in the frame's Format: zoom out, zoom in. A
 * renderer hands the bar at most two icons, so readouts (zoom %, "3 / 12")
 * are the renderer's facts, and fitting is where zooming out stops. Outside a
 * frame they make the viewer's own single row, after its readout (`children`).
 * + − 0 zoom in, out and back to fit while focus is in the viewer showing them.
 */
export function ViewerZoomControls({
  onIn,
  onOut,
  onReset,
  label,
  disabledIn = false,
  disabledOut = false,
  readout,
  children,
}: {
  onIn: () => void;
  onOut: () => void;
  /** Back to the fitted view; the 0 key. */
  onReset?: () => void;
  /** Accessible name of the group ("Image zoom"). */
  label: string;
  disabledIn?: boolean;
  disabledOut?: boolean;
  /** A position between the icons, as the document bar draws "3 / 12" (frame-bar 07). */
  readout?: ReactNode;
  /** What a standalone row shows before the icons; in a frame these are facts. */
  children?: ReactNode;
}) {
  const framed = useContext(FileViewerInformationHost) !== undefined;
  const host = useContext(ViewerToolbarHost);
  const group = useRef<HTMLDivElement>(null);
  // The keys answer where the frame's own keys do, also while a narrow bar folds the
  // icons away, but not under Lineage, which hides the renderer and its tools.
  const region = useMemo(
    () => ({
      get current(): Element | null {
        const element = group.current;
        if (!element?.isConnected) return null;
        const frame = element.closest('[data-slot="file-viewer"]');
        if (!frame) return element.getClientRects().length ? element.parentElement : null;
        const tools = element.closest('[data-slot="frame-format-host"]');
        return tools?.classList.contains('hidden') ? null : frameKeyRegion(frame);
      },
    }),
    [],
  );
  useShortcut('view-zoom-in', () => !disabledIn && onIn(), { region });
  useShortcut('view-zoom-out', () => !disabledOut && onOut(), { region });
  useShortcut('view-zoom-fit', () => onReset?.(), { region, enabled: Boolean(onReset) });
  // The frame's Format host mounts after the renderer; wait for it rather than drawing a row.
  if (framed && !host) return null;
  return (
    <ViewerToolbarContent>
      <div
        ref={group}
        className={cn(
          'flex shrink-0 items-center gap-px',
          !host && 'h-[34px] justify-end border-b border-border px-1.5',
        )}
        data-slot="viewer-zoom-controls"
        role="group"
        aria-label={label}
      >
        {framed ? null : children}
        <ToolbarAction
          label="Zoom out"
          shortcut="view-zoom-out"
          disabled={disabledOut}
          onClick={onOut}
        >
          <ZoomOutIcon aria-hidden="true" />
        </ToolbarAction>
        {framed && readout ? (
          <span
            className="flex shrink-0 items-center gap-1.5 px-1 text-[11px] text-muted-foreground tabular-nums"
            data-slot="viewer-zoom-readout"
          >
            {readout}
          </span>
        ) : null}
        <ToolbarAction
          label="Zoom in"
          shortcut="view-zoom-in"
          disabled={disabledIn}
          onClick={onIn}
        >
          <ZoomInIcon aria-hidden="true" />
        </ToolbarAction>
      </div>
    </ViewerToolbarContent>
  );
}
