import { CommonSchemas } from '@a2ui/web_core/v0_9';
import {
  A2UI_MAP_POINT_CATEGORY_MAX_CHARS,
  A2UI_MAP_POINT_DETAIL_MAX_CHARS,
  A2UI_MAP_POINT_ID_MAX_CHARS,
  A2UI_MAP_POINT_LABEL_MAX_CHARS,
  A2UI_MAP_POINTS_MAX,
} from '@clio/core/v3';
import { createComponentImplementation } from '@a2ui/react/v0_9';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ListIcon, MapIcon, MapPinIcon, MousePointerSquareDashedIcon } from 'lucide-react';
import type { MapLibreMap } from 'maplibre-gl';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useContainerQuery } from '@/hooks/use-container-query';
import { cn } from '@/lib/utils';
import {
  a2uiAccessibilityLabel,
  a2uiAccessibilityProps,
  type A2UIAccessibility,
} from './a2ui-accessibility';
import { refinedStrictObject } from './a2ui-refined-schema';
import { ClioMapArtifactSource } from './a2ui-map-data-source';
import { dataViewFlexStyle } from './data-view-layout';
import { dataQuerySchema, fieldNameSchema } from './data-query-schema';
import { buildZoneReference, type DataZoneReference } from './data-zone-reference';
import { mapPngBlob } from './map-export';
import type { ScientificMapPoint } from './scientific-map-view';
import {
  isBoundToPath,
  isSelectionValue,
  parseSelectionState,
  selectionIncludes,
  type SelectionValue,
  type SelectionWriter,
} from './selection-state';
import { downloadBlob, filenameStemFromTitle } from './surface-export';
import { SurfaceFullScreenHost, useSurfaceFullScreen } from './surface-full-screen';
import { SurfaceToolbar, type SurfaceCapabilities, type SurfaceExportFormat } from './surface-toolbar';
import { type QueryRow, type TableDataQuery } from './table-query-rows';
import { downloadInlineRowsAsCsv, downloadInlineRowsAsJson } from './table-export-client';

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
  /** The map component's id, written as a selection's `source`. */
  componentId?: string;
  /** The resolved `selection` value; a `SelectionState` when bound to `/selection/<key>`. */
  selection?: unknown;
  /** Present only when `selection` is bound to a data-model path. */
  setSelection?: SelectionWriter;
  /**
   * The column a bound `selection` reads and writes. Required by the schema
   * whenever `selection` is bound; when absent (unbound, or a direct caller
   * that predates the field), falls back to the point property the bound
   * field names (`id`/`label`/`category`), else `id`.
   */
  selectionField?: string;
  /**
   * The `dataUri` wrapper's (`ClioMapArtifactSource`) own filter popover,
   * "Reference this", and server-backed CSV/JSON export formats — merged
   * into this component's own toolbar capabilities (PNG export, the
   * selection hint, full screen). Absent for inline `points` (no wrapper
   * runs): `ClioScientificMap` builds its own smaller equivalents directly
   * from `points` instead (G0 point 5: these affordances apply "on
   * inline-data views too").
   */
  dataCapabilities?: Pick<SurfaceCapabilities, 'exportFormats' | 'buildReference' | 'filters'>;
}

/** Point properties a linked selection may name when no `selectionField` is given. */
const SELECTABLE_POINT_FIELDS = ['id', 'label', 'category'] as const;
type SelectablePointField = (typeof SELECTABLE_POINT_FIELDS)[number];

function isSelectablePointField(field: string): field is SelectablePointField {
  return (SELECTABLE_POINT_FIELDS as readonly string[]).includes(field);
}

/**
 * A point's value of `field`. `selectionValue` — a `dataUri` map's own
 * `selectionField` COLUMN read verbatim (`pointsFromRows`) — is checked
 * FIRST and always wins when present: a producer's dataset can have its own
 * column literally named `id`, `label`, or `category` for `selectionField`
 * (the earthquake fixture does exactly this), which must never be confused
 * with this point's SYNTHETIC `id`/rendered `label`/`category` display
 * properties just because the field name string collides. Inline `points`
 * (no `dataUri`) never carry a `selectionValue` at all, so they fall through
 * to the point's own properties as before.
 */
function pointSelectValue(point: ScientificMapPoint, field: string): SelectionValue | undefined {
  if (point.selectionValue !== undefined) return point.selectionValue;
  if (field === 'id') return point.id;
  if (field === 'label') return point.label;
  if (field === 'category') return point.category;
  return undefined;
}

export function ClioScientificMap({
  accessibility,
  title = 'Locations',
  points,
  selected,
  action,
  actionLabel = 'Use selected location',
  componentId,
  dataCapabilities,
  selection,
  selectionField,
  setSelection,
}: ClioMapProps) {
  const [localId, setLocalId] = useState(
    points.some((point) => point.id === selected) ? selected : points[0]?.id,
  );
  // Bound: the shared selection decides; unbound (or nothing there yet): local state and `selected`.
  const state = useMemo(
    () => (setSelection ? parseSelectionState(selection) : undefined),
    [selection, setSelection],
  );
  const field: string =
    selectionField ?? (state && isSelectablePointField(state.field) ? state.field : 'id');
  // Inline `points` (no `dataUri`) never carry a dataset `selectionValue` —
  // only `id`/`label`/`category` exist to select by. A `selectionField`
  // naming anything else can never resolve a value to write or compare
  // (`pointSelectValue` returns `undefined`), which would otherwise fail
  // perfectly silently: every click does nothing, with no visible reason.
  const unsupportedSelectionField =
    Boolean(setSelection) &&
    selectionField !== undefined &&
    !isSelectablePointField(selectionField) &&
    !points.some((point) => point.selectionValue !== undefined);
  const boundIds = useMemo(
    () =>
      state
        ? new Set(
            points
              .filter((point) => selectionIncludes(state, field, pointSelectValue(point, field)))
              .map((point) => point.id),
          )
        : undefined,
    [field, points, state],
  );
  const selectedId = boundIds
    ? localId !== undefined && boundIds.has(localId)
      ? localId
      : boundIds.values().next().value
    : localId;
  const isSelected = (id: string) => (boundIds ? boundIds.has(id) : id === selectedId);
  // Every point the canvas highlights — a zone can bind many at once, so this
  // is `boundIds` (all of them) when a selection is bound, or just the one
  // locally-picked point otherwise. Passed straight through to the view so
  // its own marker/GeoJSON-layer rendering stays a single source of truth
  // with the side list's `isSelected` above.
  const highlightedIds = useMemo(
    () => boundIds ?? new Set(selectedId !== undefined ? [selectedId] : []),
    [boundIds, selectedId],
  );
  const setSelectedId = (id: string) => {
    setLocalId(id);
    const point = points.find((candidate) => candidate.id === id);
    const value = point ? pointSelectValue(point, field) : undefined;
    if (setSelection && value !== undefined) {
      setSelection({ field, values: [value], ...(componentId ? { source: componentId } : {}) });
    }
  };
  // Drag a rectangle to select every point inside it (#1533 item 4) — a
  // "zone", same as a chart's brushed x range: the shared selection becomes
  // every point in the rectangle, not just one.
  const handleZoneSelect = (ids: string[]) => {
    if (!setSelection) return;
    const values = ids
      .map((id) => {
        const point = points.find((candidate) => candidate.id === id);
        return point ? pointSelectValue(point, field) : undefined;
      })
      .filter(isSelectionValue);
    setSelection({ field, values, ...(componentId ? { source: componentId } : {}) });
  };
  const surfaceRef = useRef<HTMLDivElement>(null);
  const sideBySide = useContainerQuery(surfaceRef, 700);
  // The list repeats what the map (and usually a table beside it) already shows,
  // so it opens on request instead of taking half the view by default.
  const [showList, setShowList] = useState(false);
  const selectedPoint = points.find((point) => point.id === selectedId);
  const canvasRef = useRef<HTMLDivElement>(null);
  // The side list can hold as many rows as `points` (schema cap: 500) —
  // mounting one <Button> per point regardless of how many are actually
  // scrolled into view is the same non-scaling pattern the canvas itself
  // just moved off of. TanStack Virtual intentionally returns
  // non-memoizable functions; this component owns them.
  const listRef = useRef<HTMLDivElement>(null);
  // oxlint-disable-next-line react/incompatible-library
  const pointsVirtualizer = useVirtualizer({
    count: points.length,
    estimateSize: () => 56,
    getItemKey: (index) => points[index]?.id ?? index,
    getScrollElement: () => listRef.current,
    overscan: 8,
  });
  const [fullscreen, setFullscreen] = useSurfaceFullScreen();
  useEffect(() => {
    const node = canvasRef.current;
    if (!node) return;
    // A native, explicitly non-passive listener — not the JSX `onWheel` prop.
    // React (like the browser default for wheel/touch listeners) treats its
    // synthetic wheel handler as passive, so `preventDefault()` called from
    // it is silently ignored (and logs a console warning); only a listener
    // registered with `{ passive: false }` can actually cancel the browser's
    // default scroll for this gesture.
    const preventDefaultScroll = (event: WheelEvent) => event.preventDefault();
    node.addEventListener('wheel', preventDefaultScroll, { passive: false });
    return () => node.removeEventListener('wheel', preventDefaultScroll);
    // `fullscreen` is a dependency, not just a condition: `SurfaceFullScreenHost`
    // really remounts this div (and the map view below it — see its own doc
    // comment) on every toggle, so `canvasRef.current` is a NEW node each
    // time; without re-running, this effect would keep listening on the
    // detached old one and the browser would scroll the page instead of
    // zooming the map after the first toggle.
  }, [fullscreen]);
  // The live maplibre `Map` instance, for PNG export (`map.getCanvas()`) —
  // captured imperatively via a stable callback rather than state, since
  // nothing here needs to re-render when it (re)loads. With `reuseMaps`, a
  // full-screen toggle reparents this SAME instance rather than replacing it.
  const mapInstanceRef = useRef<MapLibreMap | undefined>(undefined);
  const handleMapInstance = useCallback((map: MapLibreMap) => {
    mapInstanceRef.current = map;
  }, []);
  const filenameStem = filenameStemFromTitle(title);
  // Inline `points` (no `dataCapabilities`, i.e. no `dataUri` wrapper ran):
  // this component's own small CSV/JSON/reference equivalents, built
  // straight from `points` — G0 point 5, "Full screen, Reference this and
  // [download] on inline-data views too."
  const inlinePointColumns = ['id', 'label', 'latitude', 'longitude', 'detail', 'category'] as const;
  const inlinePointRows = useMemo<QueryRow[]>(
    () =>
      points.map((point) => ({
        id: point.id,
        label: point.label,
        latitude: point.latitude,
        longitude: point.longitude,
        detail: point.detail ?? null,
        category: point.category ?? null,
      })),
    [points],
  );
  const buildInlineReference = (): DataZoneReference =>
    buildZoneReference({
      componentLabel: title,
      datasetLabel: 'inline data',
      filters: [],
      previewColumns: ['label', 'latitude', 'longitude', 'category'],
      previewRows: inlinePointRows.slice(0, 5),
      // No server query exists to re-run for inline points (they came in
      // verbatim on the component spec) — an empty object says so honestly,
      // rather than fabricating a `dataUri`/`dataQuery` that doesn't exist.
      query: {},
      zoneDescription: `the whole view (${points.length.toLocaleString()} points)`,
    });
  const exportFormats: SurfaceExportFormat[] = [
    {
      id: 'png',
      label: 'PNG image',
      run: async () => {
        const map = mapInstanceRef.current;
        if (!map) return;
        downloadBlob(await mapPngBlob(map), `${filenameStem}.png`);
      },
    },
    ...(dataCapabilities?.exportFormats ?? [
      {
        id: 'csv',
        label: 'CSV data',
        run: () => downloadInlineRowsAsCsv(inlinePointColumns, inlinePointRows, filenameStem),
      },
      {
        id: 'json',
        label: 'JSON data',
        run: () => downloadInlineRowsAsJson(inlinePointColumns, inlinePointRows, filenameStem),
      },
    ]),
  ];
  // Not a G0 download/select/zoom/full-screen/reference affordance (it's the
  // map's own list-pane toggle), so it stays in the map's own header rather
  // than the shared `SurfaceToolbar` overflow.
  const mapHeaderExtra = (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={showList ? 'Hide the locations list' : 'Show the locations list'}
            aria-pressed={showList}
            onClick={() => setShowList((current) => !current)}
            size="icon-sm"
            variant="ghost"
          >
            <ListIcon aria-hidden="true" className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {showList ? 'Hide the locations list' : 'Show the locations list'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
  const toolbarCapabilities: SurfaceCapabilities = {
    buildReference: dataCapabilities?.buildReference ?? buildInlineReference,
    exportFormats,
    filters: dataCapabilities?.filters,
    fullScreen: { isOpen: fullscreen, onToggle: () => setFullscreen(!fullscreen) },
    selectionHint: setSelection ? (
      <span
        className="inline-flex items-center gap-1"
        title="Hold Shift and drag a rectangle to select every point inside it"
      >
        <MousePointerSquareDashedIcon aria-hidden="true" className="size-3.5" />
        Shift+drag to select an area
      </span>
    ) : undefined,
  };

  return (
    <div className="min-w-0" data-slot="a2ui-map" ref={surfaceRef}>
      <Frame
        {...a2uiAccessibilityProps(accessibility)}
        aria-label={a2uiAccessibilityLabel(accessibility) ?? `${title} map`}
        className="group"
        dense
        role="group"
      >
        <FrameHeader className="flex-row flex-wrap items-center gap-x-2 gap-y-1.5">
          <MapIcon aria-hidden="true" className="size-4 text-primary" />
          <div className="min-w-0 flex-1">
            <FrameTitle className="truncate">{title}</FrameTitle>
            <FrameDescription className="truncate">
              {points.length.toLocaleString()} locations
            </FrameDescription>
          </div>
          {mapHeaderExtra}
          <SurfaceToolbar capabilities={toolbarCapabilities} floating={false} />
        </FrameHeader>
        <SurfaceFullScreenHost
          fullscreen={fullscreen}
          headerExtra={
            <>
              {mapHeaderExtra}
              <SurfaceToolbar capabilities={{ ...toolbarCapabilities, fullScreen: undefined }} floating={false} />
            </>
          }
          onOpenChange={setFullscreen}
          title={title}
        >
          <FramePanel
            className={cn(
              'grid gap-0 p-0',
              showList && sideBySide && 'grid-cols-[minmax(0,1fr)_15rem]',
            )}
          >
            <div
              className={cn(
                // A definite `h-` (not `min-h-`), deliberately: this wrapper is
                // a CSS grid item, and `align-items: stretch` (the grid
                // default) overrides a `min-height`-only box, growing it to
                // match whatever height a detached/ownerless surface's
                // ancestor chain resolves to inside the virtualized
                // transcript - observed as high as ~29,000px, which the map's
                // own `size-full` (`height: 100%`) child then inherited
                // verbatim, handing maplibre-gl a wildly wrong container
                // height (and, in turn, wrong screen<->lnglat projection for
                // every pixel-coordinate interaction, including #1533's
                // shift-drag zone selection). A definite height here is never
                // overridden by an ancestor's stretch.
                'relative h-(--a2ui-map-height,26rem) overflow-hidden',
                showList && (sideBySide ? 'border-r' : 'border-b'),
              )}
              ref={canvasRef}
            >
              <Suspense
                fallback={
                  <Skeleton aria-label={`Loading ${title} map`} className="size-full rounded-none" />
                }
              >
                <ClioScientificMapView
                  highlightedIds={highlightedIds}
                  onMapInstance={handleMapInstance}
                  onSelect={setSelectedId}
                  onZoneSelect={setSelection ? handleZoneSelect : undefined}
                  points={points}
                  selectedId={selectedId}
                />
              </Suspense>
              {/* A visible, non-virtualized count: a large point count is drawn as
                  one GeoJSON layer and the list is usually closed, so an "N of M"
                  zone selection would otherwise have no on-screen indication at
                  all, sighted or not. */}
              {boundIds && boundIds.size > 0 && boundIds.size !== points.length ? (
                <p
                  aria-live="polite"
                  className="pointer-events-none absolute start-2 top-2 rounded-md border bg-background/90 px-2 py-1 text-xs font-medium backdrop-blur-sm"
                  data-slot="a2ui-map-selection-count"
                >
                  {`${boundIds.size.toLocaleString()} of ${points.length.toLocaleString()} selected`}
                </p>
              ) : null}
            </div>
            {showList ? (
              <div className="flex min-h-0 flex-col">
                <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                  Locations
                </div>
                <div
                  className={cn('max-h-64 flex-1 overflow-y-auto p-2', sideBySide && 'max-h-none')}
                  data-slot="a2ui-map-points-list"
                  ref={listRef}
                >
                  <div
                    className="relative w-full"
                    style={{ height: pointsVirtualizer.getTotalSize() }}
                  >
                    {pointsVirtualizer.getVirtualItems().map((row) => {
                      const point = points[row.index];
                      if (!point) return null;
                      return (
                        <div
                          className="absolute inset-x-0 top-0 pb-1"
                          key={row.key}
                          style={{ height: row.size, transform: `translateY(${row.start}px)` }}
                        >
                          <Button
                            aria-pressed={isSelected(point.id)}
                            className={cn(
                              'h-full w-full justify-start gap-2 px-2 py-2 text-left',
                              isSelected(point.id) && 'border-primary/50 bg-primary/10',
                            )}
                            onClick={() => setSelectedId(point.id)}
                            variant="ghost"
                          >
                            <MapPinIcon
                              aria-hidden="true"
                              className="size-3.5 shrink-0 text-primary"
                            />
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{point.label}</span>
                              {point.category ? (
                                <span className="block truncate text-xs text-muted-foreground">
                                  {point.category}
                                </span>
                              ) : null}
                            </span>
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}
          </FramePanel>
          {selectedPoint ? (
            <div
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-3 py-2 text-xs"
              data-slot="a2ui-map-selected-point"
            >
              <span className="min-w-0 truncate font-medium">{selectedPoint.label}</span>
              <span className="font-mono text-muted-foreground tabular-nums">
                {selectedPoint.latitude.toFixed(5)}, {selectedPoint.longitude.toFixed(5)}
              </span>
              {selectedPoint.detail ? (
                <span className="min-w-0 truncate text-muted-foreground">
                  {selectedPoint.detail}
                </span>
              ) : null}
              {action ? (
                <Button className="ms-auto" onClick={() => void action()} size="sm">
                  {actionLabel}
                </Button>
              ) : null}
            </div>
          ) : null}
          {unsupportedSelectionField ? (
            <p className="border-t px-3 py-2 text-xs text-muted-foreground">
              This map's points have no “{selectionField}” value to select by — inline points
              support only id, label, or category. Selecting a point here does nothing.
            </p>
          ) : null}
        </SurfaceFullScreenHost>
      </Frame>
    </div>
  );
}

const mapDataProperties = {
  title: CommonSchemas.DynamicString.optional(),
  points: z.array(pointSchema).min(1).max(A2UI_MAP_POINTS_MAX).optional(),
  dataUri: z
    .string()
    .regex(/^artifact:\/\/artifact_[A-Za-z0-9_-]+$/u)
    .optional(),
  dataQuery: dataQuerySchema.optional(),
  latitudeField: fieldNameSchema.optional(),
  longitudeField: fieldNameSchema.optional(),
  labelField: fieldNameSchema.optional(),
  idField: fieldNameSchema.optional(),
  detailField: fieldNameSchema.optional(),
  categoryField: fieldNameSchema.optional(),
  // Holds a `MapPoint.id` value -- same bound as `pointSchema.id` (G2
  // adversarial review, F4: the server declares `maxLength: 128` here too,
  // catalog_bounded.py's `selected` field; this zod schema had none).
  selected: z.string().max(A2UI_MAP_POINT_ID_MAX_CHARS).optional(),
  // clio-schemas 0.5.1: bind to `/selection/<key>` to share the selection.
  selection: CommonSchemas.DynamicValue.optional(),
  // A dataset column name; required when `selection` is bound (mirrors the chart's selectionField).
  selectionField: fieldNameSchema.optional(),
  action: CommonSchemas.Action.optional(),
  actionLabel: CommonSchemas.DynamicString.optional(),
  accessibility: CommonSchemas.AccessibilityAttributes.optional(),
  weight: z.number().optional(),
};

type MapShape = z.infer<z.ZodObject<typeof mapDataProperties>>;

/** `clio.map.v1`'s cross-field rule: exactly one of `points` or `dataUri`. */
function checkMapComponent(value: MapShape, context: z.RefinementCtx): void {
  if (Boolean(value.points) === Boolean(value.dataUri)) {
    context.addIssue({ code: 'custom', message: 'Provide exactly one of points or dataUri' });
  }
  if (value.dataUri) {
    const missing = (['latitudeField', 'longitudeField', 'labelField'] as const).filter(
      (name) => !value[name],
    );
    if (missing.length) {
      context.addIssue({ code: 'custom', message: `dataUri requires ${missing.join(', ')}` });
    }
  } else if (value.dataQuery) {
    context.addIssue({ code: 'custom', message: 'dataQuery applies only to dataUri' });
  }
  if (isBoundToPath(value.selection) && !value.selectionField) {
    context.addIssue({
      code: 'custom',
      message: 'selectionField is required when selection is bound',
    });
  }
}

// The catalog adapter must share the exact validated schema with the interactive map renderer.
// oxlint-disable-next-line react/only-export-components
export const mapComponentSchema = refinedStrictObject(mapDataProperties, checkMapComponent);

// oxlint-disable-next-line react/only-export-components
export const ClioMapCatalogComponent = createComponentImplementation(
  { name: 'clio.map.v1', schema: mapComponentSchema },
  ({ props, context }) => {
    const setSelection = isBoundToPath(context.componentModel.properties.selection)
      ? (props.setSelection as unknown as SelectionWriter)
      : undefined;
    // The flex item in an A2UI Row/Column: see `dataViewFlexStyle`.
    return (
      <div style={dataViewFlexStyle(props.weight)}>
        {props.dataUri ? (
          <ClioMapArtifactSource
            accessibility={props.accessibility}
            action={props.action ? () => void props.action?.() : undefined}
            actionLabel={props.actionLabel}
            categoryField={props.categoryField}
            componentId={context.componentModel.id}
            dataQuery={props.dataQuery as TableDataQuery | undefined}
            dataUri={props.dataUri}
            detailField={props.detailField}
            idField={props.idField}
            labelField={props.labelField!}
            latitudeField={props.latitudeField!}
            longitudeField={props.longitudeField!}
            selected={props.selected}
            selection={props.selection}
            selectionField={props.selectionField}
            setSelection={setSelection}
            title={props.title}
          />
        ) : (
          <ClioScientificMap
            accessibility={props.accessibility}
            action={props.action ? () => void props.action?.() : undefined}
            actionLabel={props.actionLabel}
            componentId={context.componentModel.id}
            points={props.points!}
            selected={props.selected}
            selection={props.selection}
            selectionField={props.selectionField}
            setSelection={setSelection}
            title={props.title}
          />
        )}
      </div>
    );
  },
);
