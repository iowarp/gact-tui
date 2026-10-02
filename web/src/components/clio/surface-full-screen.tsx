import { Minimize2Icon } from 'lucide-react';
import { useCallback, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Per-component full screen for each data view.
 *
 * Portals `children` into whichever host is current (inline or the dialog)
 * instead of re-rendering a second copy: a chart's Vega view, a map's
 * maplibre canvas, or any other imperative, expensive-to-
 * recreate child must MOVE, not remount, when the view goes full screen.
 *
 * Both host elements are created up front with a lazy `useState` initializer
 * — synchronously, on the FIRST render, before any DOM commit — rather than
 * waiting for a ref callback to report one through `setState` (a plain
 * `useState<HTMLDivElement | null>(null)` + `ref={setHost}` pattern). That
 * two-pass version leaves `host` `null` for the component's entire first
 * render, so `createPortal` renders nothing on that pass; `children`'s own
 * refs (a chart's container div, read by its embed effect) only attach on
 * the SECOND render, once the host state lands. A child effect whose own
 * dependency array does not otherwise change between those two renders then
 * never re-runs to notice the now-available ref — exactly what happened for
 * an inline-data chart, which embeds synchronously on its very first effect
 * pass and found `containerRef.current` still `null`. A portal's target does
 * not need to be attached to `document` for React to commit children into
 * it, so the two detached divs created here are valid portal targets from
 * render one; `attachInline`/`attachDialog` (callback refs, which re-fire
 * every time their placeholder (re)mounts — the dialog's content unmounts
 * and remounts each time it closes/opens) then move each host into its
 * visible position, synchronously during the same commit, before any effect
 * runs.
 */
// oxlint-disable-next-line react/only-export-components
export function useSurfaceFullScreen(): [boolean, (open: boolean) => void] {
  return useState(false);
}

export function SurfaceFullScreenHost({
  children,
  fullscreen,
  headerExtra,
  onOpenChange,
  title,
}: {
  children: ReactNode;
  fullscreen: boolean;
  /**
   * The component's own toolbar (and any other header control, e.g.
   * mermaid's Render/Source toggle) -- rendered in the DIALOG's own header,
   * next to "Exit full screen". Without this, every one of those controls
   * (download, "Reference this", Filters, ...) lived only in the inline
   * card's header, which the full-screen dialog covers entirely: there was
   * no way to use them while actually full screen (#516 review item 7).
   */
  headerExtra?: ReactNode;
  onOpenChange: (open: boolean) => void;
  title: string;
}) {
  const [inlineHost] = useState(() => document.createElement('div'));
  const [dialogHost] = useState(() => document.createElement('div'));
  const attachInline = useCallback(
    (node: HTMLDivElement | null) => {
      node?.appendChild(inlineHost);
    },
    [inlineHost],
  );
  const attachDialog = useCallback(
    (node: HTMLDivElement | null) => {
      node?.appendChild(dialogHost);
    },
    [dialogHost],
  );
  const host = fullscreen ? dialogHost : inlineHost;
  return (
    <>
      <div className="contents" data-slot="surface-inline-host" ref={attachInline} />
      <Dialog onOpenChange={onOpenChange} open={fullscreen}>
        <DialogContent
          aria-describedby={undefined}
          className="grid h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-lg p-0 sm:max-w-none"
          showCloseButton={false}
        >
          <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
            <DialogTitle className="min-w-0 truncate text-sm">{title}</DialogTitle>
            <TooltipProvider delayDuration={150}>
              <div className="group flex shrink-0 items-center gap-2">
                {headerExtra}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label="Exit full screen"
                      onClick={() => onOpenChange(false)}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      <Minimize2Icon aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Exit full screen</TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </div>
          <div
            className="min-h-0 overflow-auto overscroll-contain p-3"
            data-slot="surface-dialog-host-scroller"
          >
            <div className="contents" data-slot="surface-dialog-host" ref={attachDialog} />
          </div>
        </DialogContent>
      </Dialog>
      {createPortal(children, host)}
    </>
  );
}
