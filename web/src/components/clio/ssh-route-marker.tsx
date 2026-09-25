import { LocateFixedIcon, MapPinIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type RouteMarkerKind = 'start' | 'waypoint' | 'destination';

const LABELS: Record<RouteMarkerKind, string> = {
  start: 'Starting point',
  waypoint: 'Hop',
  destination: 'Destination',
};

/**
 * What a route row means, drawn on the route line: the current position at
 * the start, a dot on the line for each hop, and a pin at the destination.
 * `top`/`bottom` draw the line into the neighbouring rows (across the list
 * gap), so consecutive markers form one continuous route. Reordering is a
 * separate grip; this marker is never a control.
 */
export function RouteMarker({
  bottom,
  kind,
  top,
}: {
  bottom: boolean;
  kind: RouteMarkerKind;
  top: boolean;
}) {
  return (
    <span
      aria-label={LABELS[kind]}
      className="relative grid size-9 place-items-center"
      data-marker={kind}
      role="img"
    >
      {top ? (
        <span
          aria-hidden="true"
          className="absolute -top-2 left-1/2 h-[calc(50%+0.5rem)] w-px -translate-x-1/2 bg-border"
        />
      ) : null}
      {bottom ? (
        <span
          aria-hidden="true"
          className="absolute -bottom-2 left-1/2 h-[calc(50%+0.5rem)] w-px -translate-x-1/2 bg-border"
        />
      ) : null}
      {kind === 'waypoint' ? (
        <span
          aria-hidden="true"
          className="relative size-2.5 rounded-full bg-muted-foreground ring-4 ring-background"
        />
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            'relative grid size-7 place-items-center rounded-full bg-background',
            kind === 'destination' ? 'text-primary' : 'text-muted-foreground',
          )}
        >
          {kind === 'start' ? (
            <LocateFixedIcon className="size-4" />
          ) : (
            <MapPinIcon className="size-4" />
          )}
        </span>
      )}
    </span>
  );
}
