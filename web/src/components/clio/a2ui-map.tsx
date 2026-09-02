import { CommonSchemas } from '@a2ui/web_core/v0_9';
import {
  A2UI_MAP_POINT_CATEGORY_MAX_CHARS,
  A2UI_MAP_POINT_DETAIL_MAX_CHARS,
  A2UI_MAP_POINT_ID_MAX_CHARS,
  A2UI_MAP_POINT_LABEL_MAX_CHARS,
  A2UI_MAP_POINTS_MAX,
} from '@clio/core/v3';
import { createComponentImplementation } from '@a2ui/react/v0_9';
import { MapIcon, MapPinIcon } from 'lucide-react';
import { lazy, Suspense, useRef, useState } from 'react';
import { z } from 'zod';
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from '@/components/reui/frame';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useContainerQuery } from '@/hooks/use-container-query';
import { cn } from '@/lib/utils';
import {
  a2uiAccessibilityLabel,
  a2uiAccessibilityProps,
  type A2UIAccessibility,
} from './a2ui-accessibility';
import type { ScientificMapPoint } from './scientific-map-view';

const ClioScientificMapView = lazy(() =>
  import('./scientific-map-view').then((module) => ({ default: module.ClioScientificMapView })),
);

const pointSchema = z
  .object({
    id: z.string().min(1).max(A2UI_MAP_POINT_ID_MAX_CHARS),
    label: z.string().min(1).max(A2UI_MAP_POINT_LABEL_MAX_CHARS),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    detail: z.string().max(A2UI_MAP_POINT_DETAIL_MAX_CHARS).optional(),
    category: z.string().max(A2UI_MAP_POINT_CATEGORY_MAX_CHARS).optional(),
  })
  .strict();

interface ClioMapProps {
  accessibility?: A2UIAccessibility;
  title?: string;
  points: ScientificMapPoint[];
  selected?: string;
  action?: () => void;
  actionLabel?: string;
}

export function ClioScientificMap({
  accessibility,
  title = 'Locations',
  points,
  selected,
  action,
  actionLabel = 'Use selected location',
}: ClioMapProps) {
  const [selectedId, setSelectedId] = useState(
    points.some((point) => point.id === selected) ? selected : points[0]?.id,
  );
  const surfaceRef = useRef<HTMLDivElement>(null);
  const sideBySide = useContainerQuery(surfaceRef, 700);
  const selectedPoint = points.find((point) => point.id === selectedId);

  return (
    <div className="min-w-0" ref={surfaceRef}>
      <Frame
        {...a2uiAccessibilityProps(accessibility)}
        aria-label={a2uiAccessibilityLabel(accessibility) ?? `${title} map`}
        dense
        role="group"
      >
        <FrameHeader className="flex-row items-center gap-2">
          <MapIcon aria-hidden="true" className="size-4 text-primary" />
          <div className="min-w-0">
            <FrameTitle>{title}</FrameTitle>
            <FrameDescription>{points.length} labeled locations</FrameDescription>
          </div>
        </FrameHeader>
        <FramePanel
          className={cn(
            'grid min-h-[26rem] gap-0 p-0',
            sideBySide && 'grid-cols-[minmax(0,1fr)_15rem]',
          )}
        >
          <div
            className={cn(
              'min-h-[20rem] overflow-hidden border-b',
              sideBySide && 'border-r border-b-0',
            )}
          >
            <Suspense
              fallback={
                <Skeleton aria-label={`Loading ${title} map`} className="size-full rounded-none" />
              }
            >
              <ClioScientificMapView
                onSelect={setSelectedId}
                points={points}
                selectedId={selectedId}
              />
            </Suspense>
          </div>
          <div className="flex min-h-0 flex-col">
            <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
              Locations
            </div>
            <div className={cn('max-h-64 flex-1 overflow-y-auto p-2', sideBySide && 'max-h-none')}>
              {points.map((point) => (
                <Button
                  aria-pressed={point.id === selectedId}
                  className={cn(
                    'mb-1 h-auto w-full justify-start gap-2 px-2 py-2 text-left',
                    point.id === selectedId && 'border-primary/50 bg-primary/10',
                  )}
                  key={point.id}
                  onClick={() => setSelectedId(point.id)}
                  variant="ghost"
                >
                  <MapPinIcon aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{point.label}</span>
                    {point.category ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {point.category}
                      </span>
                    ) : null}
                  </span>
                </Button>
              ))}
            </div>
            {selectedPoint ? (
              <div className="border-t p-3 text-xs">
                <p className="font-medium">{selectedPoint.label}</p>
                <p className="mt-1 font-mono text-muted-foreground">
                  {selectedPoint.latitude.toFixed(5)}, {selectedPoint.longitude.toFixed(5)}
                </p>
                {selectedPoint.detail ? (
                  <p className="mt-2 text-muted-foreground">{selectedPoint.detail}</p>
                ) : null}
                {action ? (
                  <Button className="mt-3 w-full" onClick={() => void action()} size="sm">
                    {actionLabel}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </FramePanel>
      </Frame>
    </div>
  );
}

// The catalog adapter must share the exact validated schema with the interactive map renderer.
// oxlint-disable-next-line react/only-export-components
export const ClioMapCatalogComponent = createComponentImplementation(
  {
    name: 'clio.map.v1',
    schema: z
      .object({
        title: CommonSchemas.DynamicString.optional(),
        points: z.array(pointSchema).min(1).max(A2UI_MAP_POINTS_MAX),
        selected: z.string().optional(),
        action: CommonSchemas.Action.optional(),
        actionLabel: CommonSchemas.DynamicString.optional(),
        accessibility: CommonSchemas.AccessibilityAttributes.optional(),
        weight: z.number().optional(),
      })
      .strict(),
  },
  ({ props }) => (
    <ClioScientificMap
      accessibility={props.accessibility}
      action={props.action}
      actionLabel={props.actionLabel}
      points={props.points}
      selected={props.selected}
      title={props.title}
    />
  ),
);
