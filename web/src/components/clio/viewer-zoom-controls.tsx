import { ZoomInIcon, ZoomOutIcon } from 'lucide-react';
import { useContext } from 'react';
import { cn } from '@/lib/utils';
import { FileViewerInformationHost } from './file-viewer-context';
import { ToolbarAction, ViewerToolbarContent } from './viewer-toolbar';
import { ViewerToolbarHost } from './viewer-toolbar-context';

/** Zoom controls stay in one place at every width; the percentage button resets the view. */
export function ViewerZoomControls({
  percent,
  onIn,
  onOut,
  onFit,
  labels,
  disabledIn = false,
  disabledOut = false,
  inline = false,
}: {
  percent: number;
  onIn: () => void;
  onOut: () => void;
  onFit: () => void;
  labels: { in: string; out: string; reset: string; fit: string; menu: string; group?: string };
  disabledIn?: boolean;
  disabledOut?: boolean;
  inline?: boolean;
}) {
  const shared = useContext(FileViewerInformationHost) !== undefined;
  const host = useContext(ViewerToolbarHost);
  return (
    <ViewerToolbarContent inline={inline}>
      <div
        className={cn(
          'flex shrink-0 items-center gap-0.5',
          ((!shared && !host) || inline) && 'h-9 border-b px-2',
        )}
        data-slot="viewer-zoom-controls"
        role="group"
        aria-label={labels.group || 'Image zoom'}
      >
        <ToolbarAction label={labels.out} disabled={disabledOut} onClick={onOut}>
          <ZoomOutIcon aria-hidden="true" />
        </ToolbarAction>
        <ToolbarAction
          label={labels.reset}
          className="w-10 text-xs tabular-nums text-muted-foreground @max-[360px]/viewer:w-8"
          onClick={onFit}
        >
          {Math.round(percent)}%
        </ToolbarAction>
        <ToolbarAction label={labels.in} disabled={disabledIn} onClick={onIn}>
          <ZoomInIcon aria-hidden="true" />
        </ToolbarAction>
      </div>
    </ViewerToolbarContent>
  );
}
