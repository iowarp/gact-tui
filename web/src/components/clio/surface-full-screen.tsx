import { Minimize2Icon } from 'lucide-react';
import { useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CloseIcon } from '@/lib/icon-vocabulary';
import { SurfaceReferenceContext } from './surface-reference-context';

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
  layout = 'workspace',
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
  /** Media uses a fitted stage with footer controls instead of a document title bar. */
  layout?: 'workspace' | 'media';
  onOpenChange: (open: boolean) => void;
  title: string;
}) {
  const [inlineHost] = useState(() => document.createElement('div'));
  const [dialogHost] = useState(() => {
    const node = document.createElement('div');
    if (layout === 'media') node.className = 'h-full min-h-0 w-full min-w-0';
    return node;
  });
  const pendingReference = useRef<(() => void) | undefined>(undefined);
  const contentRef = useRef<HTMLDivElement>(null);
  const enclosingReference = useContext(SurfaceReferenceContext);
  const referenceAndClose = useCallback(
    (reference: () => void) => {
      pendingReference.current = reference;
      onOpenChange(false);
    },
    [onOpenChange],
  );
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
    <SurfaceReferenceContext.Provider value={fullscreen ? referenceAndClose : enclosingReference}>
      <div className="contents" data-slot="surface-inline-host" ref={attachInline} />
      <Dialog onOpenChange={onOpenChange} open={fullscreen}>
        <DialogContent
          aria-describedby={undefined}
          ref={contentRef}
          tabIndex={-1}
          className={
            layout === 'media'
              ? 'group fixed inset-0 h-dvh max-h-none w-screen max-w-none translate-x-0 grid-rows-[minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-none bg-media-backdrop p-0 text-media-foreground ring-0 sm:max-w-none'
              : 'grid h-[calc(100dvh-2rem)] w-[calc(100vw-1rem)] max-w-none grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-lg p-0 sm:max-w-none'
          }
          onCloseAutoFocus={(event) => {
            const reference = pendingReference.current;
            if (!reference) return;
            pendingReference.current = undefined;
            event.preventDefault();
            reference();
          }}
          onOpenAutoFocus={(event) => {
            // Focusing the first toolbar button opens its tooltip, which then
            // consumes Escape before the full-screen dialog can close.
            event.preventDefault();
            contentRef.current?.focus();
          }}
          showCloseButton={false}
          onInteractOutside={(event) => {
            // Portal children keep their original React ancestry. An interaction
            // physically inside this host still belongs to the fullscreen view.
            const target = event.detail.originalEvent.target;
            if (target instanceof Node && dialogHost.contains(target)) event.preventDefault();
          }}
        >
          <div
            className={
              layout === 'media'
                ? 'order-last flex min-w-0 items-center justify-between gap-2 px-4 py-3 sm:px-7'
                : 'flex items-center justify-between gap-2 border-b px-4 py-3'
            }
          >
            <DialogTitle className="min-w-0 truncate text-sm font-normal">{title}</DialogTitle>
            <TooltipProvider delayDuration={150}>
              <div className="group flex shrink-0 items-center gap-2">
                {headerExtra}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label="Exit full screen"
                      className={
                        layout === 'media'
                          ? 'absolute right-4 top-4 rounded-full border border-media-foreground/30 bg-media-backdrop/70 text-media-foreground hover:bg-media-foreground/15 hover:text-media-foreground'
                          : undefined
                      }
                      onClick={() => onOpenChange(false)}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      {layout === 'media' ? (
                        <CloseIcon aria-hidden="true" />
                      ) : (
                        <Minimize2Icon aria-hidden="true" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Exit full screen</TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </div>
          <div
            className={
              layout === 'media'
                ? 'flex min-h-0 items-center justify-center overflow-hidden px-4 pb-2 pt-16 sm:px-14'
                : 'min-h-0 overflow-auto overscroll-contain p-3'
            }
            data-slot="surface-dialog-host-scroller"
          >
            <div className="contents" data-slot="surface-dialog-host" ref={attachDialog} />
          </div>
        </DialogContent>
      </Dialog>
      {createPortal(children, host)}
    </SurfaceReferenceContext.Provider>
  );
}
