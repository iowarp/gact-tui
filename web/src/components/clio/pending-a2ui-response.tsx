import type {
  A2UIActionLifecycle,
  A2UISurface,
  PendingInteraction,
  PendingInteractionResponse,
} from '@clio/core/v3';
import {
  AlertTriangleIcon,
  GripHorizontalIcon,
  LoaderCircleIcon,
  Maximize2Icon,
  Minimize2Icon,
  MoveDiagonal2Icon,
} from 'lucide-react';
import { RetryIcon } from '@/lib/icon-vocabulary';
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useContext,
  type PointerEvent as ReactPointerEvent,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { PROTOCOL } from '@/lib/brand-vocabulary';
import { cn } from '@/lib/utils';
import { useConversationWidth } from '@/providers/appearance-provider';
import {
  clampViewportHeight,
  maxViewportHeight,
  MIN_VIEWPORT_HEIGHT,
  persistViewportHeight,
  readPersistedViewportHeight,
} from './a2ui-response-viewport-resize';
import { ClioA2UISurface, type A2UILocalActionHandler } from './a2ui-surface';
import { AskError, AskSection } from './ask-card';
import { CloseIcon } from '@/lib/icon-vocabulary';
import { respondFromControl } from './interaction-control';
import { QuestionCard, QuestionFooter } from './interaction-frame-header';
import { canDismissQuestion } from './question-card-model';
import { IconButton } from './primitives/icon-button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SurfaceReferenceContext } from './surface-reference-context';
import { t, ph } from '@lingui/core/macro';

type InteractionResponseHandler = (
  interaction: PendingInteraction,
  response: PendingInteractionResponse,
) => Promise<void>;

interface PendingA2UIResponseProps {
  /** Native questions reuse this persistent resizable viewport for their visual and answer controls. */
  renderBody?: (viewport: 'inline' | 'fullscreen') => ReactNode;
  /** The answer may be written in the composer instead. */
  allowsComposer?: boolean;
  /** The composer is the only way to answer (a written-answer question). */
  composerOnly?: boolean;
  showFullPrompt?: boolean;
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

/** A pending interactive surface inside the question card, resizable and openable full screen. */
export function PendingA2UIResponse({
  allowsComposer,
  composerOnly,
  renderBody,
  showFullPrompt,
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
  const conversationWidth = useConversationWidth();
  const [fullscreen, setFullscreen] = useState(false);
  const pendingReference = useRef<(() => void) | undefined>(undefined);
  const enclosingReference = useContext(SurfaceReferenceContext);
  const referenceAndClose = useCallback((reference: () => void) => {
    pendingReference.current = reference;
    setFullscreen(false);
  }, []);
  // The surface id is this card's identity across renders and across visits —
  // the interaction id changes with the response cycle, so it is a fallback
  // only, never the first choice. Namespaced by the owning session: a bare
  // surface_id/interaction id is only unique within one session, and two
  // sessions that happen to reuse the same one must never read or clobber
  // each other's remembered height.
  const surfaceKey = `${interaction.owner_session_id}:${interaction.source.surface_id ?? interaction.id}`;
  // The card fits its content until the reader resizes it; a remembered
  // resize for this surface is restored.
  const [viewportHeight, setViewportHeight] = useState<number | undefined>(() => {
    const persisted = readPersistedViewportHeight(surfaceKey);
    return persisted === undefined ? undefined : clampViewportHeight(persisted, window.innerHeight);
  });
  const viewport = useRef<HTMLDivElement>(null);
  const currentHeight = () =>
    viewportHeight ?? viewport.current?.clientHeight ?? MIN_VIEWPORT_HEIGHT;
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
    resizeStart.current = { y: event.clientY, height: currentHeight(), moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const updateResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const start = resizeStart.current;
    if (!start || event.buttons === 0) return;
    if (Math.abs(event.clientY - start.y) > 2) start.moved = true;
    const next = clampViewportHeight(start.height + start.y - event.clientY, window.innerHeight);
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
  const dismiss = canDismissQuestion(interaction)
    ? () => respondFromControl(onResponse(interaction, { action: 'cancel' }))
    : undefined;
  const controls = (
    <TooltipProvider>
      <IconButton
        className="cursor-ns-resize touch-none"
        icon={<GripHorizontalIcon aria-hidden="true" />}
        label={t`Resize interactive surface`}
        onClick={() => {
          if (suppressResizeClick.current) {
            suppressResizeClick.current = false;
            return;
          }
          const max = maxViewportHeight(window.innerHeight);
          const next = currentHeight() < max ? max : MIN_VIEWPORT_HEIGHT;
          persistViewportHeight(surfaceKey, next);
          setViewportHeight(next);
        }}
        onPointerCancel={endResize}
        onPointerDown={beginResize}
        onPointerMove={updateResize}
        onPointerUp={endResize}
        size="sm"
        type="button"
      />
      <IconButton
        icon={<Maximize2Icon aria-hidden="true" />}
        label={t`Open interactive surface full screen`}
        onClick={() => setFullscreen(true)}
        size="sm"
        type="button"
      />
      {dismiss ? (
        <IconButton
          disabled={disabled}
          icon={<CloseIcon aria-hidden="true" />}
          label={t`Close question`}
          onClick={dismiss}
          size="sm"
          type="button"
        />
      ) : null}
    </TooltipProvider>
  );
  return (
    <SurfaceReferenceContext.Provider value={fullscreen ? referenceAndClose : enclosingReference}>
      <QuestionCard
        data-response-surface="a2ui"
        headerActions={controls}
        interaction={interaction}
        ownerLabel={ownerLabel}
        showFullPrompt={showFullPrompt}
        showOwner={showOwner}
      >
        <AskError error={responseError} />
        <AskSection className="group/viewport relative" data-slot="a2ui-response-viewport-wrapper">
          <div
            className={cn(
              'min-w-0 max-h-[calc(100dvh-17rem)] overflow-auto overscroll-contain',
              // 0.7, not 0.5/0.6, is this repo's WCAG AA contrast floor for a
              // dimmed-but-readable disabled surface (see reui/sortable.tsx).
              disabled && 'pointer-events-none opacity-70',
            )}
            data-slot="a2ui-response-viewport"
            ref={viewport}
            style={
              viewportHeight === undefined
                ? undefined
                : ({
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
                  } as CSSProperties)
            }
          >
            {/* Portal host for the inline placement — see `surfaceBody` below. */}
            <div className="contents" ref={setInlineHost} />
          </div>
          <button
            aria-label={t`Corner resize handle`}
            className="absolute bottom-1 right-1 z-10 flex size-6 touch-none cursor-nwse-resize items-center justify-center rounded-md bg-muted text-muted-foreground opacity-0 group-hover/viewport:opacity-70 hover:opacity-100! hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary motion-safe:transition-opacity"
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
            title={t`Drag to resize interactive surface`}
            type="button"
          >
            <MoveDiagonal2Icon aria-hidden="true" className="size-3.5" />
          </button>
        </AskSection>
        <QuestionFooter
          allowsComposer={allowsComposer}
          composerOnly={composerOnly}
          disabled={disabled}
          interaction={interaction}
          onDismiss={dismiss}
        />
      </QuestionCard>
      <Dialog onOpenChange={setFullscreen} open={fullscreen}>
        <DialogContent
          aria-describedby={undefined}
          className={cn(
            'top-1/2 -translate-y-1/2 grid h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-lg p-0',
            conversationWidth === 'wide' ? 'sm:max-w-6xl' : 'sm:max-w-4xl',
          )}
          showCloseButton={false}
          onInteractOutside={(event) => {
            const target = event.detail.originalEvent.target;
            if (target instanceof Node && dialogHost?.contains(target)) event.preventDefault();
          }}
          onCloseAutoFocus={(event) => {
            const reference = pendingReference.current;
            if (!reference) return;
            pendingReference.current = undefined;
            event.preventDefault();
            reference();
          }}
        >
          <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
            <DialogTitle className="min-w-0 truncate text-[0.84375rem] font-medium">
              {interaction.prompt ??
                interaction.title ??
                t`${ph({ protocol: PROTOCOL.a2ui })} surface`}
            </DialogTitle>
            <Button onClick={() => setFullscreen(false)} size="sm" type="button" variant="ghost">
              <Minimize2Icon aria-hidden="true" />
              {t`Exit full screen`}
            </Button>
          </div>
          <div className="min-h-0 overflow-auto overscroll-contain p-3">
            {/* Portal host for the fullscreen placement — see `surfaceBody` below. */}
            <div className="contents" ref={setDialogHost} />
          </div>
        </DialogContent>
      </Dialog>
      {createPortal(
        renderBody ? (
          renderBody(fullscreen ? 'fullscreen' : 'inline')
        ) : (
          <A2UISurfaceBody
            actionLifecycle={actionLifecycle}
            interaction={interaction}
            onLocalAction={onLocalAction}
            onRefetchSurface={onRefetchSurface}
            onResponse={onResponse}
            rawSurface={rawSurface}
            viewport={fullscreen ? 'fullscreen' : 'inline'}
          />
        ),
        host,
      )}
    </SurfaceReferenceContext.Provider>
  );
}

/** Distinguishes a pending read from a missing or cross-session surface. */
function A2UISurfaceBody({
  actionLifecycle,
  interaction,
  onLocalAction,
  onRefetchSurface,
  onResponse,
  rawSurface,
  viewport = 'inline',
}: {
  actionLifecycle?: A2UIActionLifecycle;
  interaction: PendingInteraction;
  onLocalAction?: A2UILocalActionHandler;
  onRefetchSurface?: () => void;
  onResponse: InteractionResponseHandler;
  rawSurface?: A2UISurface;
  viewport?: 'inline' | 'fullscreen';
}) {
  if (!interaction.source.surface_id) {
    return (
      <p className="flex items-start gap-1.5 text-menu text-muted-foreground">
        <AlertTriangleIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
        {t`This response has no ${ph({ a2ui: PROTOCOL.a2ui })} surface to open.`}
      </p>
    );
  }
  if (rawSurface && rawSurface.session_id !== interaction.owner_session_id) {
    return (
      <p className="flex items-start gap-1.5 text-menu text-muted-foreground">
        <AlertTriangleIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
        {t`This ${ph({ a2ui: PROTOCOL.a2ui })} surface was rejected: it was addressed to a different session.`}
      </p>
    );
  }
  if (!rawSurface) {
    return (
      <div className="flex items-center gap-2 text-menu text-muted-foreground">
        <LoaderCircleIcon aria-hidden="true" className="size-4 shrink-0 motion-safe:animate-spin" />
        <span className="flex-1">{t`${ph({ a2ui: PROTOCOL.a2ui })} surface is loading.`}</span>
        {onRefetchSurface ? (
          <Button onClick={onRefetchSurface} size="sm" type="button" variant="ghost">
            <RetryIcon aria-hidden="true" />
            {t`Retry`}
          </Button>
        ) : null}
      </div>
    );
  }
  return (
    <ClioA2UISurface
      actionLifecycle={actionLifecycle}
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
