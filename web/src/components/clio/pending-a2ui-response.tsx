import type { A2UIActionLifecycle, A2UISurface, PendingInteraction, PendingInteractionResponse } from '@clio/core/v3';
import {
  AlertTriangleIcon,
  GripHorizontalIcon,
  LoaderCircleIcon,
  Maximize2Icon,
  Minimize2Icon,
  MoveDiagonal2Icon,
  RotateCcwIcon,
} from 'lucide-react';
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Frame } from '@/components/reui/frame';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { PROTOCOL } from '@/lib/brand-vocabulary';
import { cn } from '@/lib/utils';
import {
  clampViewportHeight,
  initialViewportHeight,
  maxViewportHeight,
  MIN_VIEWPORT_HEIGHT,
  persistViewportHeight,
} from './a2ui-response-viewport-resize';
import { ClioA2UISurface, type A2UILocalActionHandler } from './a2ui-surface';
import { pendingInteractionDomId, respondFromControl } from './interaction-control';
import { InteractionFrameHeader } from './interaction-frame-header';
import { ResponseErrorNotice } from './pending-interaction-notices';

type InteractionResponseHandler = (
  interaction: PendingInteraction,
  response: PendingInteractionResponse,
) => Promise<void>;

interface PendingA2UIResponseProps {
  actionLifecycle?: A2UIActionLifecycle;
  disabled?: boolean;
  interaction: PendingInteraction;
  onLocalAction?: A2UILocalActionHandler;
  onRefetchSurface?: () => void;
  onResponse: InteractionResponseHandler;
  ownerLabel?: string;
  rawSurface?: A2UISurface;
  responseError?: Error;
  showOwner: boolean;
}

/** Presents a pending interactive surface as the tray's only bordered box — no nested chrome of its own. */
export function PendingA2UIResponse({
  actionLifecycle,
  disabled,
  interaction,
  onLocalAction,
  onRefetchSurface,
  onResponse,
  ownerLabel,
  rawSurface,
  responseError,
  showOwner,
}: PendingA2UIResponseProps) {
  const [fullscreen, setFullscreen] = useState(false);
  // The surface id is this card's identity across renders and across visits —
  // the interaction id changes with the response cycle, so it is a fallback
  // only, never the first choice. Namespaced by the owning session: a bare
  // surface_id/interaction id is only unique within one session, and two
  // sessions that happen to reuse the same one must never read or clobber
  // each other's remembered height.
  const surfaceKey = `${interaction.owner_session_id}:${interaction.source.surface_id ?? interaction.id}`;
  const [viewportHeight, setViewportHeight] = useState(() =>
    initialViewportHeight(surfaceKey, window.innerHeight),
  );
  const resizeStart = useRef<{ y: number; height: number; moved: boolean } | null>(null);
  const suppressResizeClick = useRef(false);
  // The one persistent instance of the interactive surface. `host` is a
  // single, DETACHED DOM node created exactly once and portaled into for
  // the lifetime of this component — its identity (the `createPortal`
  // container argument) never changes, so React never has cause to
  // remount the surface subtree inside it. What DOES move is `host`
  // itself, imperatively, between the inline and fullscreen "contents"
  // placeholders below (see the layout effect).
  //
  // The earlier version portaled straight into `fullscreen ? dialogHost :
  // inlineHost` — a container argument that changes value on the very
  // render that flips `fullscreen`. React's host-portal reconciliation
  // keys on that container, so a changed container is a brand-new portal
  // fiber: the surface (and anything it held — a map's selection, a
  // form's local processor) unmounted and remounted on every toggle,
  // which is exactly the bug this component exists to avoid.
  const [host] = useState(() => {
    const element = document.createElement('div');
    element.className = 'contents';
    return element;
  });
  const [inlineHost, setInlineHost] = useState<HTMLDivElement | null>(null);
  const [dialogHost, setDialogHost] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    // Fullscreen's own placeholder wins once it exists; until then (the
    // first commit after opening, before the dialog content has mounted)
    // the surface stays in the inline placeholder rather than being
    // detached from the DOM.
    const target = (fullscreen && dialogHost) || inlineHost;
    if (target && host.parentElement !== target) target.appendChild(host);
  }, [fullscreen, inlineHost, dialogHost, host]);
  const beginResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    resizeStart.current = { y: event.clientY, height: viewportHeight, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const updateResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const start = resizeStart.current;
    if (!start || event.buttons === 0) return;
    if (Math.abs(event.clientY - start.y) > 2) start.moved = true;
    const next = clampViewportHeight(start.height + event.clientY - start.y, window.innerHeight);
    setViewportHeight(next);
    persistViewportHeight(surfaceKey, next);
  };
  const endResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    suppressResizeClick.current = resizeStart.current?.moved ?? false;
    resizeStart.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const controls = (
    <>
      <Button
        aria-label="Resize interactive surface"
        className="cursor-ns-resize touch-none"
        onClick={() => {
          if (suppressResizeClick.current) {
            suppressResizeClick.current = false;
            return;
          }
          setViewportHeight((current) => {
            const max = maxViewportHeight(window.innerHeight);
            const next = current < max ? max : MIN_VIEWPORT_HEIGHT;
            persistViewportHeight(surfaceKey, next);
            return next;
          });
        }}
        onPointerCancel={endResize}
        onPointerDown={beginResize}
        onPointerMove={updateResize}
        onPointerUp={endResize}
        size="icon-sm"
        title="Drag or activate to resize interactive surface"
        type="button"
        variant="ghost"
      >
        <GripHorizontalIcon aria-hidden="true" />
      </Button>
      <Button
        aria-label="Open interactive surface full screen"
        onClick={() => setFullscreen(true)}
        size="icon-sm"
        title="Open full screen"
        type="button"
        variant="ghost"
      >
        <Maximize2Icon aria-hidden="true" />
      </Button>
    </>
  );
  return (
    <>
      <Frame
        className="min-w-0 self-stretch rounded-none bg-transparent p-0"
        data-interaction-kind={interaction.kind}
        data-slot="pending-a2ui"
        dense
        id={pendingInteractionDomId(interaction.id)}
        spacing="sm"
        tabIndex={-1}
        variant="ghost"
      >
        <InteractionFrameHeader
          actions={controls}
          disabled={disabled}
          interaction={interaction}
          onCancel={
            (interaction.actions ?? []).includes('cancel')
              ? () => respondFromControl(onResponse(interaction, { action: 'cancel' }))
              : undefined
          }
          ownerLabel={ownerLabel}
          showOwner={showOwner}
        />
        <div className="relative min-w-0" data-slot="a2ui-response-viewport-wrapper">
          <div
            className={cn(
              'min-h-60 min-w-0 overflow-auto overscroll-contain',
              // 0.7, not 0.5/0.6, is this repo's WCAG AA contrast floor for a
              // dimmed-but-readable disabled surface (see reui/sortable.tsx).
              disabled && 'pointer-events-none opacity-70',
            )}
            data-slot="a2ui-response-viewport"
            style={
              {
                height: viewportHeight,
                // A catalog component that wants to fill this card (the map)
                // cannot reach its own height with a CSS percentage — every
                // wrapper between here and it (the surface renderer, the
                // catalog grid) is a plain flow container with no height of
                // its own, so a percentage chain breaks immediately. A
                // custom property inherits past all of that regardless, the
                // same way the fullscreen dialog already sizes the map off
                // 100dvh instead of a percentage.
                '--a2ui-inline-surface-height': `${viewportHeight}px`,
              } as CSSProperties
            }
          >
            <ResponseErrorNotice error={responseError} />
            {/* Portal host for the inline placement — see `surfaceBody` below. */}
            <div className="contents" ref={setInlineHost} />
          </div>
          <button
            aria-label="Corner resize handle"
            className="absolute bottom-1 right-1 z-10 flex size-6 touch-none cursor-nwse-resize items-center justify-center rounded-md bg-muted/70 text-muted-foreground opacity-70 backdrop-blur-sm transition-opacity hover:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
            data-slot="a2ui-response-corner-resize"
            onPointerCancel={endResize}
            onPointerDown={beginResize}
            onPointerMove={updateResize}
            onPointerUp={endResize}
            // Pointer-only duplicate of the header's "Resize interactive
            // surface" grip, which already gives keyboard users the same
            // resize behavior (click/Enter/Space to toggle min/max). Leaving
            // this in the tab order would visit the same affordance twice.
            tabIndex={-1}
            title="Drag to resize interactive surface"
            type="button"
          >
            <MoveDiagonal2Icon aria-hidden="true" className="size-3.5" />
          </button>
        </div>
      </Frame>
      <Dialog onOpenChange={setFullscreen} open={fullscreen}>
        <DialogContent
          aria-describedby={undefined}
          className="grid h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-lg p-0 sm:max-w-none"
          showCloseButton={false}
        >
          <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
            <DialogTitle className="min-w-0 truncate text-sm">
              {interaction.prompt ?? interaction.title ?? `${PROTOCOL.a2ui} surface`}
            </DialogTitle>
            <Button onClick={() => setFullscreen(false)} size="sm" type="button" variant="ghost">
              <Minimize2Icon aria-hidden="true" />
              Exit full screen
            </Button>
          </div>
          <div className="min-h-0 overflow-auto overscroll-contain p-3">
            {/* Portal host for the fullscreen placement — see `surfaceBody` below. */}
            <div className="contents" ref={setDialogHost} />
          </div>
        </DialogContent>
      </Dialog>
      {createPortal(
        <A2UISurfaceBody
          actionLifecycle={actionLifecycle}
          chrome="bare"
          interaction={interaction}
          onLocalAction={onLocalAction}
          onRefetchSurface={onRefetchSurface}
          onResponse={onResponse}
          rawSurface={rawSurface}
          viewport={fullscreen ? 'fullscreen' : 'inline'}
        />,
        host,
      )}
    </>
  );
}

/** Distinguishes a pending read from a missing or cross-session surface. */
function A2UISurfaceBody({
  actionLifecycle,
  chrome = 'framed',
  interaction,
  onLocalAction,
  onRefetchSurface,
  onResponse,
  rawSurface,
  viewport = 'inline',
}: {
  actionLifecycle?: A2UIActionLifecycle;
  chrome?: 'framed' | 'bare';
  interaction: PendingInteraction;
  onLocalAction?: A2UILocalActionHandler;
  onRefetchSurface?: () => void;
  onResponse: InteractionResponseHandler;
  rawSurface?: A2UISurface;
  viewport?: 'inline' | 'fullscreen';
}) {
  if (!interaction.source.surface_id) {
    return (
      <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
        <AlertTriangleIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
        This response has no {PROTOCOL.a2ui} surface to open.
      </p>
    );
  }
  if (rawSurface && rawSurface.session_id !== interaction.owner_session_id) {
    return (
      <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
        <AlertTriangleIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
        This {PROTOCOL.a2ui} surface was rejected: it was addressed to a different session.
      </p>
    );
  }
  if (!rawSurface) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircleIcon aria-hidden="true" className="size-4 shrink-0 motion-safe:animate-spin" />
        <span className="flex-1">{PROTOCOL.a2ui} surface is loading.</span>
        {onRefetchSurface ? (
          <Button onClick={onRefetchSurface} size="sm" type="button" variant="ghost">
            <RotateCcwIcon aria-hidden="true" />
            Retry
          </Button>
        ) : null}
      </div>
    );
  }
  return (
    <ClioA2UISurface
      actionLifecycle={actionLifecycle}
      chrome={chrome}
      onLocalAction={onLocalAction}
      onRemoteAction={(message) =>
        onResponse(interaction, {
          correlation: surfaceCorrelation(interaction, rawSurface),
          message,
        })
      }
      surface={rawSurface}
      viewport={viewport}
    />
  );
}

function surfaceCorrelation(
  interaction: PendingInteraction,
  surface: A2UISurface,
): { run_id?: string; message_id?: string; part_id?: string } {
  return {
    run_id: surface.run_id,
    message_id: surface.message_id,
    part_id: surface.part_id ?? interaction.source.invocation_id,
  };
}
