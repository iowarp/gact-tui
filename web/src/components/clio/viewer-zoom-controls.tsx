import { LocateFixedIcon, ZoomInIcon, ZoomOutIcon } from 'lucide-react';
import { useContext, useMemo } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreIcon } from '@/lib/icon-vocabulary';
import { cn } from '@/lib/utils';
import { FileViewerInformationHost } from './file-viewer-context';
import { useFileViewerActions } from './file-viewer-action-context';
import { ToolbarAction, ViewerToolbarContent } from './viewer-toolbar';
import { ViewerToolbarHost } from './viewer-toolbar-context';

/** The same zoom composition for every file renderer, with compact actions in the file menu. */
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
  const actions = useMemo(
    () => [
      { label: labels.in, icon: ZoomInIcon, onSelect: onIn, disabled: disabledIn },
      { label: labels.out, icon: ZoomOutIcon, onSelect: onOut, disabled: disabledOut },
      { label: labels.fit, icon: LocateFixedIcon, onSelect: onFit },
    ],
    [labels.in, labels.out, labels.fit, onIn, onOut, onFit, disabledIn, disabledOut],
  );
  useFileViewerActions(actions);
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
        <ToolbarAction
          label={labels.out}
          disabled={disabledOut}
          onClick={onOut}
          className="@max-[720px]/viewer:hidden"
        >
          <ZoomOutIcon aria-hidden="true" />
        </ToolbarAction>
        <ToolbarAction
          label={labels.reset}
          className="w-10 text-xs tabular-nums text-muted-foreground @max-[360px]/viewer:w-8"
          onClick={onFit}
        >
          {Math.round(percent)}%
        </ToolbarAction>
        <ToolbarAction
          label={labels.in}
          disabled={disabledIn}
          onClick={onIn}
          className="@max-[720px]/viewer:hidden"
        >
          <ZoomInIcon aria-hidden="true" />
        </ToolbarAction>
        <ToolbarAction label={labels.fit} onClick={onFit} className="@max-[720px]/viewer:hidden">
          <LocateFixedIcon aria-hidden="true" />
        </ToolbarAction>
        {!shared ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <ToolbarAction label={labels.menu} className="@min-[720px]/viewer:hidden">
                <MoreIcon aria-hidden="true" />
              </ToolbarAction>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {actions.map(({ label, icon: Icon, onSelect, disabled }) => (
                <DropdownMenuItem key={label} onSelect={onSelect} disabled={disabled}>
                  <Icon />
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </ViewerToolbarContent>
  );
}
