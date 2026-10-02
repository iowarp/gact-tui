import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MapPinIcon,
  MousePointerSquareDashedIcon,
  RotateCcwIcon,
  ZoomInIcon,
} from 'lucide-react';
import type { MapLibreMap } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DropdownMenuCheckboxItem } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { useContainerQuery } from '@/hooks/use-container-query';
import { useAutoDatasetSelection } from '@/lib/a2ui/auto-dataset-selection';
import { inlineSelectionKey } from '@/lib/a2ui/inline-selection-key';
import { cn } from '@/lib/utils';
import {
  a2uiAccessibilityLabel,
  a2uiAccessibilityProps,
  type A2UIAccessibility,
} from './a2ui-accessibility';
import { buildZoneReference, type DataZoneReference } from './data-zone-reference';
import { mapPngBlob } from './map-export';
import { isSelectablePointField, pointSelectValue } from './map-points';
import {
  CONTINUOUS_HIGH_COLOR,
  CONTINUOUS_LOW_COLOR,
  CONTINUOUS_MID_COLOR,
  mapCategoryColors,
  mapPointColor,
  mapValueExtent,
  UNCATEGORIZED_COLOR,
} from './map-category-palette';
import type { ScientificMapPoint } from './scientific-map-view';
import {
  isSelectionValue,
  parseSelectionState,
  selectionForField,
  type SelectionState,
  selectionIncludes,
  type SelectionWriter,
} from './selection-state';
import { downloadBlob, filenameStemFromTitle } from './surface-export';
import { SurfaceFullScreenHost, useSurfaceFullScreen } from './surface-full-screen';
import {
  SurfaceToolbar,
  type SurfaceCapabilities,
  type SurfaceExportFormat,
} from './surface-toolbar';
import type { QueryRow } from './table-query-rows';
import { downloadInlineRowsAsCsv, downloadInlineRowsAsJson } from './table-export-client';

const ClioScientificMapView = lazy(() =>
  import('./scientific-map-view').then((module) => ({ default: module.ClioScientificMapView })),
);

const MAP_LIST_ROW_HEIGHT = 48;
const MAP_LIST_CHROME_HEIGHT = 64;
const DEFAULT_MAP_HEIGHT = 416;

interface ClioMapProps {
  accessibility?: A2UIAccessibility;
  title?: string;
  points: ScientificMapPoint[];
  geometry?: FeatureCollection;
  geometryBounds?: [[number, number], [number, number]];
  geometrySelectionByPoints?: boolean;
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
  valueLabel?: string;
  valueUnit?: string;
}

export function ClioScientificMap({
  accessibility,
  title = 'Locations',
  points,
  geometry,
  geometryBounds,
  geometrySelectionByPoints,
  selected,
  action,
  actionLabel = 'Use selected location',
  componentId,
  dataCapabilities,
  valueLabel = 'Value',
  valueUnit,
  selection,
  selectionField,
  setSelection,
}: ClioMapProps) {
  const [localId, setLocalId] = useState(
    points.some((point) => point.id === selected) ? selected : undefined,
  );
  const [localSelection, setLocalSelection] = useState<SelectionState>();
  const inlineKey = useMemo(() => inlineSelectionKey(points.map((point) => point.id)), [points]);
  const autoSelection = useAutoDatasetSelection(inlineKey);
  const writeSelection = setSelection ?? autoSelection.setSelection ?? setLocalSelection;
  // Bound: the shared selection decides; unbound (or nothing there yet): local state and `selected`.
  const state = useMemo(
    () =>
      selectionForField(
        parseSelectionState(
          setSelection
            ? selection
            : autoSelection.active
              ? autoSelection.selection
              : localSelection,
        ),
        selectionField ?? 'id',
      ),
    [
      autoSelection.active,
      autoSelection.selection,
      localSelection,
      selection,
      selectionField,
      setSelection,
    ],
  );
  const field: string =
    selectionField ?? (state && isSelectablePointField(state.field) ? state.field : 'id');
  // Inline `points` (no `dataUri`) never carry a dataset `selectionValue` —
  // only `id`/`label`/`category` exist to select by. A `selectionField`
  // naming anything else can never resolve a value to write or compare
  // (`pointSelectValue` returns `undefined`), which would otherwise fail
  // perfectly silently: every click does nothing, with no visible reason.
  const unsupportedSelectionField =
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
      : undefined
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
    if (value !== undefined) {
      writeSelection({ field, values: [value], ...(componentId ? { source: componentId } : {}) });
    }
  };
  const clearSelection = () => {
    setLocalId(undefined);
    writeSelection({ field, values: [], ...(componentId ? { source: componentId } : {}) });
  };
  // Drag a rectangle to select every point inside it; clicking empty map space
  // clears both the linked selection and any locally selected point.
  const handleZoneSelect = (ids: string[]) => {
    setLocalId(undefined);
    const values = ids
      .map((id) => {
        const point = points.find((candidate) => candidate.id === id);
        return point ? pointSelectValue(point, field) : undefined;
      })
      .filter(isSelectionValue);
    writeSelection({ field, values, ...(componentId ? { source: componentId } : {}) });
  };
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [mapHeight, setMapHeight] = useState(DEFAULT_MAP_HEIGHT);
  const [listPage, setListPage] = useState(0);
  const sideBySide = useContainerQuery(surfaceRef, 700);
  // The list repeats what the map (and usually a table beside it) already shows,
  // so it opens on request instead of taking half the view by default.
  const [showList, setShowList] = useState(false);
  const [boxSelectMode, setBoxSelectMode] = useState(false);
  const [zoomActive, setZoomActive] = useState(false);
  const selectedPoint = points.find((point) => point.id === selectedId);
  const canvasRef = useRef<HTMLDivElement>(null);
  // The side list can hold as many rows as `points` (schema cap: 500) —
  // mounting one <Button> per point regardless of how many are actually
  // scrolled into view is the same non-scaling pattern the canvas itself
  // just moved off of. TanStack Virtual intentionally returns
  // non-memoizable functions; this component owns them.
  const listRef = useRef<HTMLDivElement>(null);
  const orderedPoints = useMemo(() => {
    const selectedPoints: ScientificMapPoint[] = [];
    const otherPoints: ScientificMapPoint[] = [];
    for (const point of points) {
      (highlightedIds.has(point.id) ? selectedPoints : otherPoints).push(point);
    }
    return [...selectedPoints, ...otherPoints];
  }, [highlightedIds, points]);
  const categoryColors = useMemo(() => mapCategoryColors(points), [points]);
  const valueExtent = useMemo(() => mapValueExtent(points), [points]);
  const hasUncategorized = points.some((point) => !point.category);
  const listPageSize = Math.max(
    1,
    Math.floor((mapHeight - MAP_LIST_CHROME_HEIGHT) / MAP_LIST_ROW_HEIGHT),
  );
  const listPageCount = Math.max(1, Math.ceil(orderedPoints.length / listPageSize));
  const pagePoints = orderedPoints.slice(listPage * listPageSize, (listPage + 1) * listPageSize);
  // oxlint-disable-next-line react/incompatible-library
  const pointsVirtualizer = useVirtualizer({
    count: pagePoints.length,
    estimateSize: () => MAP_LIST_ROW_HEIGHT,
    getItemKey: (index) => pagePoints[index]?.id ?? index,
    getScrollElement: () => listRef.current,
    overscan: 8,
  });
  useEffect(() => {
    const node = canvasRef.current;
    if (!node) return;
    const measure = () => setMapHeight(node.clientHeight || DEFAULT_MAP_HEIGHT);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => setListPage(0), [orderedPoints, mapHeight]);
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
  const [mapInstance, setMapInstance] = useState<MapLibreMap | undefined>(undefined);
  const homeCameraRef = useRef<{ longitude: number; latitude: number; zoom: number } | undefined>(
    undefined,
  );
  const handleMapInstance = useCallback((map: MapLibreMap) => {
    mapInstanceRef.current = map;
    setMapInstance(map);
  }, []);
  useEffect(() => {
    if (!mapInstance) return;
    const rememberHome = () => {
      const center = mapInstance.getCenter();
      homeCameraRef.current = {
        longitude: center.lng,
        latitude: center.lat,
        zoom: mapInstance.getZoom(),
      };
      setZoomActive(false);
    };
    const updateZoomState = () => {
      const home = homeCameraRef.current;
      if (!home) return;
      const center = mapInstance.getCenter();
      setZoomActive(
        Math.abs(mapInstance.getZoom() - home.zoom) > 0.01 ||
          Math.abs(center.lng - home.longitude) > 0.01 ||
          Math.abs(center.lat - home.latitude) > 0.01,
      );
    };
    if (mapInstance.loaded()) rememberHome();
    else mapInstance.once('idle', rememberHome);
    mapInstance.on('moveend', updateZoomState);
    return () => {
      mapInstance.off('idle', rememberHome);
      mapInstance.off('moveend', updateZoomState);
    };
  }, [mapInstance]);
  const zoomToSelection = () => {
    const selectedPoints = points.filter((point) => highlightedIds.has(point.id));
    const map = mapInstanceRef.current;
    if (!map || !selectedPoints.length) return;
    if (selectedPoints.length === 1) {
      map.easeTo({ center: [selectedPoints[0]!.longitude, selectedPoints[0]!.latitude], zoom: 10 });
      return;
    }
    map.fitBounds(
      [
        [
          Math.min(...selectedPoints.map((point) => point.longitude)),
          Math.min(...selectedPoints.map((point) => point.latitude)),
        ],
        [
          Math.max(...selectedPoints.map((point) => point.longitude)),
          Math.max(...selectedPoints.map((point) => point.latitude)),
        ],
      ],
      { padding: 40, maxZoom: 12 },
    );
  };
  const resetZoom = () => {
    const map = mapInstanceRef.current;
    const home = homeCameraRef.current;
    if (!map || !home) return;
    map.easeTo({ center: [home.longitude, home.latitude], zoom: home.zoom });
  };
  const filenameStem = filenameStemFromTitle(title);
  // Inline `points` (no `dataCapabilities`, i.e. no `dataUri` wrapper ran):
  // this component's own small CSV/JSON/reference equivalents, built
  // straight from `points` — G0 point 5, "Full screen, Reference this and
  // [download] on inline-data views too."
  const inlinePointColumns = [
    'id',
    'label',
    'latitude',
    'longitude',
    'value',
    'detail',
    'category',
  ] as const;
  const inlinePointRows = useMemo<QueryRow[]>(
    () =>
      points.map((point) => ({
        id: point.id,
        label: point.label,
        latitude: point.latitude,
        longitude: point.longitude,
        value: point.value ?? null,
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
      previewColumns: ['label', 'latitude', 'longitude', 'value', 'detail', 'category'],
      previewLayout: highlightedIds.size === 1 ? 'fields' : 'table',
      previewRows: highlightedIds.size
        ? inlinePointRows.filter((row) => highlightedIds.has(String(row.id)))
        : inlinePointRows.slice(0, 5),
      // No server query exists to re-run for inline points (they came in
      // verbatim on the component spec) — an empty object says so honestly,
      // rather than fabricating a `dataUri`/`dataQuery` that doesn't exist.
      query: highlightedIds.size
        ? { selection: { field, values: state?.values ?? [selectedId] } }
        : {},
      zoneDescription: highlightedIds.size
        ? `${highlightedIds.size.toLocaleString()} selected ${highlightedIds.size === 1 ? 'point' : 'points'} of ${points.length.toLocaleString()}`
        : `the filtered current view (${points.length.toLocaleString()} points)`,
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
  const toolbarCapabilities: SurfaceCapabilities = {
    captureComponentId: componentId,
    buildReference: dataCapabilities?.buildReference ?? buildInlineReference,
    exportFormats,
    filters: dataCapabilities?.filters,
    fullScreen: { isOpen: fullscreen, onToggle: () => setFullscreen(!fullscreen) },
    overflowContent: (
      <>
        <DropdownMenuCheckboxItem
          aria-label="Show locations list"
          checked={showList}
          className="whitespace-nowrap"
          onCheckedChange={(checked) => setShowList(checked === true)}
        >
          Locations list
        </DropdownMenuCheckboxItem>
      </>
    ),
  };
  const boxSelectAction = (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label="Box select map points"
            aria-pressed={boxSelectMode}
            className={cn(
              'shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100',
              boxSelectMode && 'opacity-100',
            )}
            onClick={() => setBoxSelectMode((active) => !active)}
            size="icon-sm"
            variant={boxSelectMode ? 'secondary' : 'ghost'}
          >
            <MousePointerSquareDashedIcon aria-hidden="true" className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent align="end" side="bottom">
          Box select. Drag a rectangle to select points. Click again to pan the map.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
  const zoomActions = (
    <>
      {highlightedIds.size > 0 ? (
        <Button
          aria-label="Zoom to selection"
          className="shrink-0"
          onClick={zoomToSelection}
          size="icon-sm"
          title="Zoom to selection"
          variant="ghost"
        >
          <ZoomInIcon aria-hidden="true" className="size-3.5" />
        </Button>
      ) : null}
      {zoomActive ? (
        <Button
          aria-label="Reset zoom"
          className="shrink-0"
          onClick={resetZoom}
          size="icon-sm"
          title="Reset zoom"
          variant="ghost"
        >
          <RotateCcwIcon aria-hidden="true" className="size-3.5" />
        </Button>
      ) : null}
    </>
  );

  return (
    <div
      className="relative min-w-0"
      data-slot="a2ui-map"
      data-a2ui-component-id={componentId}
      ref={surfaceRef}
    >
      <section
        {...a2uiAccessibilityProps(accessibility)}
        aria-label={a2uiAccessibilityLabel(accessibility) ?? `${title} map`}
        className="group relative min-w-0"
        role="group"
      >
        <div className="mb-2 flex min-w-0 items-start gap-3">
          <h3 className="min-w-0 flex-1 truncate text-sm font-medium" title={title}>
            {title}
          </h3>
          <div className="flex shrink-0 items-center gap-0.5">
            {boxSelectAction}
            {zoomActions}
            <SurfaceToolbar capabilities={toolbarCapabilities} floating={false} />
          </div>
        </div>
        <SurfaceFullScreenHost
          fullscreen={fullscreen}
          headerExtra={
            <div className="flex items-center gap-0.5">
              {boxSelectAction}
              {zoomActions}
              <SurfaceToolbar
                capabilities={{ ...toolbarCapabilities, fullScreen: undefined }}
                floating={false}
              />
            </div>
          }
          onOpenChange={setFullscreen}
          title={title}
        >
          <div
            className={cn(
              'grid gap-0',
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
                'relative overflow-hidden',
                showList && (sideBySide ? 'border-r' : 'border-b'),
              )}
              ref={canvasRef}
              style={{
                height: fullscreen ? 'calc(100dvh - 9rem)' : 'var(--a2ui-map-height, 26rem)',
              }}
            >
              <Suspense
                fallback={
                  <Skeleton
                    aria-label={`Loading ${title} map`}
                    className="size-full rounded-none"
                  />
                }
              >
                <ClioScientificMapView
                  boxSelectMode={boxSelectMode}
                  geometry={geometry}
                  geometryBounds={geometryBounds}
                  geometrySelectionByPoints={geometrySelectionByPoints}
                  highlightedIds={highlightedIds}
                  onClearSelection={clearSelection}
                  onMapInstance={handleMapInstance}
                  onSelect={setSelectedId}
                  onZoneSelect={handleZoneSelect}
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
              <div className="flex min-h-0 flex-col" style={{ height: mapHeight }}>
                <div
                  className="min-h-0 flex-1 overflow-hidden p-2"
                  data-slot="a2ui-map-points-list"
                  ref={listRef}
                >
                  <div
                    className="relative w-full"
                    style={{ height: pointsVirtualizer.getTotalSize() }}
                  >
                    {pointsVirtualizer.getVirtualItems().map((row) => {
                      const point = pagePoints[row.index];
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
                              'h-full w-full justify-start gap-2 px-2 py-1 text-left',
                              isSelected(point.id) && 'border-primary/50 bg-primary/10',
                            )}
                            onClick={() => setSelectedId(point.id)}
                            variant="ghost"
                          >
                            <MapPinIcon
                              aria-hidden="true"
                              className="size-3.5 shrink-0"
                              style={{ color: mapPointColor(point, categoryColors, valueExtent) }}
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
                <div
                  className="flex h-10 shrink-0 items-center justify-between gap-1 border-t px-2 text-xs text-muted-foreground"
                  data-slot="a2ui-map-points-pagination"
                >
                  <span className="shrink-0 whitespace-nowrap" title="Total map locations">
                    {`${orderedPoints.length.toLocaleString()} locations`}
                  </span>
                  <span
                    aria-label={`Page ${listPage + 1} of ${listPageCount}; showing locations ${orderedPoints.length === 0 ? 0 : listPage * listPageSize + 1}–${Math.min((listPage + 1) * listPageSize, orderedPoints.length)}`}
                    aria-live="polite"
                    className="sr-only"
                  >
                    {`${listPage + 1} of ${listPageCount}`}
                  </span>
                  <span className="flex shrink-0 items-center gap-0.5 whitespace-nowrap">
                    <Button
                      aria-label="Previous locations page"
                      disabled={listPage === 0}
                      onClick={() => setListPage((page) => Math.max(0, page - 1))}
                      size="icon-sm"
                      variant="ghost"
                    >
                      <ChevronLeftIcon aria-hidden="true" className="size-3.5" />
                    </Button>
                    <span aria-hidden="true" className="tabular-nums">
                      {`${listPage + 1}/${listPageCount}`}
                    </span>
                    <Button
                      aria-label="Next locations page"
                      disabled={listPage + 1 >= listPageCount}
                      onClick={() => setListPage((page) => Math.min(listPageCount - 1, page + 1))}
                      size="icon-sm"
                      variant="ghost"
                    >
                      <ChevronRightIcon aria-hidden="true" className="size-3.5" />
                    </Button>
                  </span>
                </div>
              </div>
            ) : null}
          </div>
          {valueExtent ? (
            <div
              aria-label={`${valueLabel} colour scale`}
              className="grid grid-cols-[auto_minmax(5rem,1fr)_auto] items-center gap-x-2 gap-y-1 border-t px-3 py-2 text-xs text-muted-foreground"
              data-slot="a2ui-map-legend"
            >
              <span className="col-span-3 font-medium text-foreground">{valueLabel}</span>
              <span className="whitespace-nowrap tabular-nums">
                {valueExtent[0].toLocaleString()}
                {valueUnit ? ` ${valueUnit}` : ''}
              </span>
              <span
                aria-hidden="true"
                className="h-2.5 min-w-0 rounded-full"
                style={{
                  background: `linear-gradient(to right, ${CONTINUOUS_LOW_COLOR}, ${CONTINUOUS_MID_COLOR}, ${CONTINUOUS_HIGH_COLOR})`,
                }}
              />
              <span className="whitespace-nowrap tabular-nums">
                {valueExtent[1].toLocaleString()}
                {valueUnit ? ` ${valueUnit}` : ''}
              </span>
              {points.some((point) => point.value === undefined) ? (
                <span className="col-span-3">Grey: no value</span>
              ) : null}
            </div>
          ) : categoryColors.size > 0 ? (
            <div
              aria-label="Map category colours"
              className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-3 py-2 text-xs text-muted-foreground"
              data-slot="a2ui-map-legend"
              role="list"
            >
              {[...categoryColors].map(([category, color]) => (
                <span className="inline-flex items-center gap-1.5" key={category} role="listitem">
                  <span
                    aria-hidden="true"
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  {category}
                </span>
              ))}
              {hasUncategorized ? (
                <span className="inline-flex items-center gap-1.5" role="listitem">
                  <span
                    aria-hidden="true"
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: UNCATEGORIZED_COLOR }}
                  />
                  Uncategorized
                </span>
              ) : null}
            </div>
          ) : null}
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
      </section>
    </div>
  );
}
