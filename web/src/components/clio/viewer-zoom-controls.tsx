import { ZoomInIcon, ZoomOutIcon } from 'lucide-react';
import { useContext, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { FileViewerInformationHost } from './file-viewer-context';
import { ToolbarAction, ViewerToolbarContent } from './viewer-toolbar';
import { ViewerToolbarHost } from './viewer-toolbar-context';

/**
 * A viewer's two zoom icons in the frame's Format: zoom out, zoom in. A
 * renderer hands the bar at most two icons, so readouts (zoom %, "3 / 12")
 * are the renderer's facts, and fitting is where zooming out stops. Outside a
 * frame they make the viewer's own single row, after its readout (`children`).
 */
export function ViewerZoomControls({
  onIn,
  onOut,
  label,
  disabledIn = false,
  disabledOut = false,
  readout,
  children,
}: {
  onIn: () => void;
  onOut: () => void;
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
  // The frame's Format host mounts after the renderer; wait for it rather than drawing a row.
  if (framed && !host) return null;
  return (
    <ViewerToolbarContent>
      <div
        className={cn(
          'flex shrink-0 items-center gap-px',
          !host && 'h-[34px] justify-end border-b border-border px-1.5',
        )}
        data-slot="viewer-zoom-controls"
        role="group"
        aria-label={label}
      >
        {framed ? null : children}
        <ToolbarAction label="Zoom out" disabled={disabledOut} onClick={onOut}>
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
        <ToolbarAction label="Zoom in" disabled={disabledIn} onClick={onIn}>
          <ZoomInIcon aria-hidden="true" />
        </ToolbarAction>
      </div>
    </ViewerToolbarContent>
  );
}
