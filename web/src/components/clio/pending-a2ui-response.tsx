import type { A2UISurface, PendingInteraction, PendingInteractionResponse } from '@clio/core/v3';
import {
  AlertTriangleIcon,
  GripHorizontalIcon,
  LoaderCircleIcon,
  Maximize2Icon,
  RotateCcwIcon,
} from 'lucide-react';
import { type PointerEvent as ReactPointerEvent, useRef, useState } from 'react';
import { Frame } from '@/components/reui/frame';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { ClioA2UISurface, type A2UILocalActionHandler } from './a2ui-surface';
import { respondFromControl } from './interaction-control';
import { InteractionFrameHeader } from './interaction-frame-header';
import { ResponseErrorNotice } from './pending-interaction-notices';

type InteractionResponseHandler = (
  interaction: PendingInteraction,
  response: PendingInteractionResponse,
) => Promise<void>;

interface PendingA2UIResponseProps {
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

/** Presents a pending interactive surface without duplicating its own content chrome. */
export function PendingA2UIResponse({
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
  const maximumViewportHeight = () => Math.max(320, Math.floor(window.innerHeight * 0.72));
  const [viewportHeight, setViewportHeight] = useState(() =>
    Math.min(480, maximumViewportHeight()),
  );
  const resizeStart = useRef<{ y: number; height: number; moved: boolean } | null>(null);
  const suppressResizeClick = useRef(false);
  const resizeViewport = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const start = resizeStart.current;
    if (!start || event.buttons === 0) return;
    if (Math.abs(event.clientY - start.y) > 2) start.moved = true;
    const maximumHeight = maximumViewportHeight();
    setViewportHeight(
      Math.min(maximumHeight, Math.max(320, start.height + event.clientY - start.y)),
    );
  };
  const stopResizing = (event: ReactPointerEvent<HTMLButtonElement>) => {
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
          setViewportHeight((current) =>
            current < maximumViewportHeight() ? maximumViewportHeight() : 320,
          );
        }}
        onPointerCancel={stopResizing}
        onPointerDown={(event) => {
          resizeStart.current = { y: event.clientY, height: viewportHeight, moved: false };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={resizeViewport}
        onPointerUp={stopResizing}
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
        dense
        spacing="sm"
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
        <div
          className={cn(
            'min-h-80 min-w-0 overflow-auto overscroll-contain border-t border-border/60',
            // 0.7, not 0.5/0.6, is this repo's WCAG AA contrast floor for a
            // dimmed-but-readable disabled surface (see reui/sortable.tsx).
            disabled && 'pointer-events-none opacity-70',
          )}
          data-slot="a2ui-response-viewport"
          style={{ height: viewportHeight }}
        >
          <ResponseErrorNotice error={responseError} />
          {fullscreen ? null : (
            <A2UISurfaceBody
              chrome="bare"
              interaction={interaction}
              onLocalAction={onLocalAction}
              onRefetchSurface={onRefetchSurface}
              onResponse={onResponse}
              rawSurface={rawSurface}
            />
          )}
        </div>
      </Frame>
      <Dialog onOpenChange={setFullscreen} open={fullscreen}>
        <DialogContent
          aria-describedby={undefined}
          className="grid h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-lg p-0 sm:max-w-none"
        >
          <DialogTitle className="border-b px-4 py-3 pr-12 text-sm">
            {interaction.prompt ?? interaction.title ?? 'Interactive surface'}
          </DialogTitle>
          <div className="min-h-0 overflow-auto overscroll-contain p-3">
            {fullscreen ? (
              <A2UISurfaceBody
                chrome="bare"
                interaction={interaction}
                onLocalAction={onLocalAction}
                onRefetchSurface={onRefetchSurface}
                onResponse={onResponse}
                rawSurface={rawSurface}
                viewport="fullscreen"
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Distinguishes a pending read from a missing or cross-session surface. */
function A2UISurfaceBody({
  chrome = 'framed',
  interaction,
  onLocalAction,
  onRefetchSurface,
  onResponse,
  rawSurface,
  viewport = 'inline',
}: {
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
        This interactive view has no surface to open.
      </p>
    );
  }
  if (rawSurface && rawSurface.session_id !== interaction.owner_session_id) {
    return (
      <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
        <AlertTriangleIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
        This interactive view was rejected: it was addressed to a different session.
      </p>
    );
  }
  if (!rawSurface) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircleIcon aria-hidden="true" className="size-4 shrink-0 motion-safe:animate-spin" />
        <span className="flex-1">Interactive view is loading.</span>
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
