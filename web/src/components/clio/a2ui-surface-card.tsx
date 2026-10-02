import { BoxesIcon, Maximize2Icon, Minimize2Icon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

/**
 * Sizes a map inside the full-screen view to the screen instead of its inline
 * height. The map canvas reads `--a2ui-map-height`; the header, the dialog bar
 * and the map's own header and footer take roughly 12rem.
 */
const FULLSCREEN_SURFACE_CLASS = '[--a2ui-map-height:calc(100dvh-12rem)]';

/**
 * The framed card a transcript surface renders in, with a full-screen view.
 *
 * The surface is portaled into whichever host is showing (inline or the
 * dialog), so exactly one copy of it is ever mounted — the same pattern as the
 * pending-interaction surface in `pending-a2ui-response.tsx`. Moving between
 * hosts remounts it: what lives in the surface's data model (the linked
 * selection, the agent's data) carries over, while a view's own local state
 * (a table's page, the map camera) starts fresh.
 */
export function ClioA2UISurfaceCard({
  children,
  domId,
  kind,
  status,
}: {
  children: ReactNode;
  domId: string;
  kind: string;
  status?: ReactNode;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  const [inlineHost, setInlineHost] = useState<HTMLDivElement | null>(null);
  const [dialogHost, setDialogHost] = useState<HTMLDivElement | null>(null);
  const host = fullscreen ? dialogHost : inlineHost;
  return (
    <>
      <section
        aria-label={`Generated UI, ${kind}`}
        className="scroll-m-8 overflow-hidden rounded-xl border bg-card focus:outline-2 focus:outline-offset-2 focus:outline-primary"
        id={domId}
        tabIndex={-1}
      >
        <div className="flex items-center gap-2 border-b bg-muted px-3 py-1.5 text-xs">
          <BoxesIcon aria-hidden="true" className="size-3.5 text-primary" />
          <span className="font-medium">Generated UI</span>
          <span className="text-muted-foreground">{kind}</span>
          <div className="ms-auto flex items-center gap-2">
            {status}
            <Button
              aria-label="Open generated UI full screen"
              onClick={() => setFullscreen(true)}
              size="icon-sm"
              title="Open full screen"
              type="button"
              variant="ghost"
            >
              <Maximize2Icon aria-hidden="true" />
            </Button>
          </div>
        </div>
        <div className="contents" ref={setInlineHost} />
        {fullscreen ? (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">
            Showing full screen.
          </p>
        ) : null}
      </section>
      <Dialog onOpenChange={setFullscreen} open={fullscreen}>
        <DialogContent
          aria-describedby={undefined}
          className="grid h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-lg p-0 sm:max-w-none"
          showCloseButton={false}
        >
          <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
            <DialogTitle className="min-w-0 truncate text-sm">Generated UI, {kind}</DialogTitle>
            <Button onClick={() => setFullscreen(false)} size="sm" type="button" variant="ghost">
              <Minimize2Icon aria-hidden="true" />
              Exit full screen
            </Button>
          </div>
          <div
            className={`min-h-0 overflow-auto overscroll-contain p-3 ${FULLSCREEN_SURFACE_CLASS}`}
          >
            <div className="contents" ref={setDialogHost} />
          </div>
        </DialogContent>
      </Dialog>
      {host ? createPortal(children, host) : null}
    </>
  );
}
