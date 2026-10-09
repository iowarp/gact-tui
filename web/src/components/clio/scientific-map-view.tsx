import { initialView, rasterStyle } from './map-initial-view';
import { MapPinIcon } from 'lucide-react';
import type { FeatureCollection } from 'geojson';
import type { ExpressionSpecification, GeoJSONSource, MapLibreMap } from 'maplibre-gl';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Map, {
  Marker,
  NavigationControl,
  Popup,
  useMap,
  type MapLayerMouseEvent,
  type MapRef,
} from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { cn } from '@/lib/utils';
import { mapCategoryColors, mapPointColor, mapValueExtent } from './map-category-palette';
import { nearestProjectedGeometryId } from './map-points';

export interface ScientificMapPoint {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  detail?: string;
  category?: string;
  /**
   * The referenced dataset's `selectionField` column value for this point,
   * when `clio.map.v1` names one — the value a bound selection reads and
   * writes, independent of `id`/`label`/`category`. Unset for inline points
   * and for a dataUri map with no `selectionField`.
   */
  selectionValue?: string | number;
  value?: number;
  /** Index of this observation in a queried table, used to form ordered tracks. */
  rowIndex?: number;
  /** Renderer-derived track identity. A click can select its visible observations together. */
  track?: string;
}

interface ScientificMapViewProps {
  points: readonly ScientificMapPoint[];
  geometry?: FeatureCollection;
  geometryBounds?: [[number, number], [number, number]];
  geometrySelectionByPoints?: boolean;
  /** When active, an ordinary drag selects a 2D rectangle instead of panning. */
  boxSelectMode?: boolean;
  selectedId?: string;
  /**
   * Every point a bound selection currently names (a zone can hold many),
   * for the linked-highlight look; defaults to just `selectedId` when unset,
   * so callers with no shared selection (the "one point at a time" case)
   * need not pass it at all.
   */
  highlightedIds?: ReadonlySet<string>;
  onSelect: (pointId: string, additive?: boolean, wholeTrack?: boolean) => void;
  onClearSelection?: () => void;
  /**
   * Shift+drag a rectangle to select every point inside it (#1533 item 4:
   * "drag a rectangle on the map"). Replaces maplibre's default shift+drag
   * box-zoom for this view — see the `boxZoom.disable()` call below.
   */
  onZoneSelect?: (pointIds: string[], wholeTracks?: boolean, additive?: boolean) => void;
  /**
   * Hands the live maplibre `Map` instance up to the caller once it loads
   * (G0: PNG export reads the canvas via `map.once('render', ...)` +
   * `map.triggerRepaint()` -- see `map-export.ts`). Fires again after a
   * full-screen toggle remounts this view: with
   * `reuseMaps` that is the SAME underlying instance, reparented, not a new
   * one, so the caller's own captured reference stays valid throughout.
   */
  onMapInstance?: (map: MapLibreMap) => void;
}

/**
 * Above this point count, one DOM `<Marker>` (its own React tree, its own
 * click handler, its own layout pass) per point stops scaling — a producer's
 * matched rows can legitimately reach the schema's own cap
 * (`A2UI_MAP_POINTS_MAX` = 500; the earthquake demo dataset hits it
 * unfiltered) and mounting hundreds of interactive DOM nodes inside a
 * pannable/zoomable map both janks and floods the accessibility tree with
 * off-screen buttons. Above the threshold, points instead become a single
 * maplibre GeoJSON circle layer — GPU-instanced, not React state — and are
 * (de)selected through the map's own `interactiveLayerIds` feature lookup.
 */
const MANY_POINTS_THRESHOLD = 150;
const POINTS_SOURCE_ID = 'clio-map-points';
const POINTS_LAYER_ID = 'clio-map-points-circles';
const GEOMETRY_SOURCE_ID = 'clio-map-geometry';
const GEOMETRY_LAYER_IDS = [
  'clio-map-geometry-fill',
  'clio-map-geometry-line',
  'clio-map-geometry-points',
] as const;
/** Which mounted view last claimed the points layer on a (possibly pooled) map instance. */
const pointsLayerOwners = new WeakMap<MapLibreMap, symbol>();
/** Paint-expression colors; maplibre evaluates these itself and cannot read CSS custom properties. */
const POINT_HIGHLIGHTED_COLOR = '#ea580c';

interface PointFeatureProperties {
  id: string;
  highlighted: boolean;
  color: string;
}

function pointsToGeoJson(
  points: readonly ScientificMapPoint[],
  highlightedIds: ReadonlySet<string>,
  categoryColors: ReadonlyMap<string, string>,
  valueExtent?: [number, number],
) {
  return {
    type: 'FeatureCollection' as const,
    features: points.map((point) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [point.longitude, point.latitude] },
      properties: {
        id: point.id,
        highlighted: highlightedIds.has(point.id),
        color: mapPointColor(point, categoryColors, valueExtent),
      } satisfies PointFeatureProperties,
    })),
  };
}

type PointsGeoJson = ReturnType<typeof pointsToGeoJson>;

/**
 * Read-only mounted map handle for capture and e2e inspection. An e2e assertion needs to see the map's ACTUAL declared
 * layer/source state, which no DOM query can ever observe — a "500 labeled
 * locations" list item proves the data resolved into React props, never
 * that the map component turned it into a real maplibre layer. Never read
 * by general app code; the region capture uses it to request a fresh frame. See `a2ui-data-everywhere.spec.ts`'s `mapPointsLayerData`
 * helper (and its doc comment, which also covers why a live WebGL-paint
 * assertion is not reliable in that harness).
 */
export interface MapDebugSurface extends HTMLDivElement {
  __clioMap?: MapLibreMap;
  __clioMapFailure?: string;
}

/** Container-relative pixel coordinates of a rubber-band drag in progress. */
interface DragBox {
  startX: number;
  startY: number;
  x: number;
  y: number;
}

/** Pixels a shift+drag must move before it counts as a zone (not a shift+click). */
const ZONE_DRAG_THRESHOLD_PX = 4;

/** Get the map instance from the provider, including maps returned from the reuse pool. */
function MapInstanceReporter({ onMapInstance }: { onMapInstance: (map: MapLibreMap) => void }) {
  const mapRef = useMap().current;
  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map) return;
    // `onLoad` only fires for a newly created map. A pooled map may already be
    // loaded when the new React view attaches, so report it from the provider.
    map.boxZoom.disable();
    onMapInstance(map);
  }, [mapRef, onMapInstance]);
  return null;
}

export function ClioScientificMapView({
  boxSelectMode = false,
  geometry,
  geometryBounds,
  geometrySelectionByPoints,
  highlightedIds,
  onMapInstance,
  onSelect,
  onClearSelection,
  onZoneSelect,
  points,
  selectedId,
}: ScientificMapViewProps) {
  const viewState = useMemo(() => initialView(points, geometryBounds), [points, geometryBounds]);
  const selected = points.find((point) => point.id === selectedId);
  const [mapError, setMapError] = useState<string>();
  const rootRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapRef>(null);
  // `@vis.gl/react-maplibre`'s own `<Map>` creates its maplibre-gl instance
  // via a dynamic `import('maplibre-gl')` — genuinely asynchronous even when
  // the module is already cached — and only then calls `useImperativeHandle`
  // with a non-null value; `mapRef.current` is `null` until that resolves.
  // An effect gated on `manyPoints` (which, for one dataset, only ever flips
  // false→true ONCE) that reads `mapRef.current?.getMap()` and bails when
  // it's still null therefore has exactly one chance to run *after* the map
  // exists — and can permanently miss it if that one run lands in the
  // window before the import resolves, at which point NOTHING re-triggers
  // it (a ref becoming non-null is not itself reactive). Confirmed directly
  // against `@vis.gl/react-maplibre`'s own source (`components/map.tsx`).
  // The child `MapInstanceReporter` reads the provider after react-map-gl has
  // attached either a new or pooled map. Capturing it in state makes "the map
  // is ready" a real reactive dependency every effect below can observe.
  const [mapInstance, setMapInstance] = useState<MapLibreMap | undefined>(undefined);
  useEffect(() => {
    if (!mapInstance || !points.length) return;
    if (viewState.bounds) {
      mapInstance.fitBounds(viewState.bounds, { ...viewState.fitBoundsOptions, duration: 0 });
    } else if (viewState.longitude !== undefined && viewState.latitude !== undefined) {
      mapInstance.jumpTo({
        center: [viewState.longitude, viewState.latitude],
        zoom: viewState.zoom ?? 8,
      });
    }
  }, [mapInstance, points.length, viewState]);
  const handleMapInstance = useCallback(
    (map: MapLibreMap) => {
      setMapError(undefined);
      setMapInstance(map);
      onMapInstance?.(map);
    },
    [onMapInstance],
  );
  const [dragBox, setDragBox] = useState<DragBox | null>(null);
  const dragBoxRef = useRef<DragBox | null>(null);
  const lastBoxDragAt = useRef(0);
  const suppressHandledClick = useRef(false);
  const manyPoints = !geometry && points.length > MANY_POINTS_THRESHOLD;
  const denseTrajectories = Boolean(geometrySelectionByPoints && points.length > 1_000);
  const categoryColors = useMemo(() => mapCategoryColors(points), [points]);
  const valueExtent = useMemo(() => mapValueExtent(points), [points]);
  const resolvedHighlightedIds = useMemo(
    () => highlightedIds ?? new Set(selectedId ? [selectedId] : []),
    [highlightedIds, selectedId],
  );
  const pointsGeoJson = useMemo(
    () =>
      manyPoints
        ? pointsToGeoJson(points, resolvedHighlightedIds, categoryColors, valueExtent)
        : undefined,
    [manyPoints, points, resolvedHighlightedIds, categoryColors, valueExtent],
  );
  const pointsGeoJsonRef = useRef<PointsGeoJson | undefined>(pointsGeoJson);
  useEffect(() => {
    pointsGeoJsonRef.current = pointsGeoJson;
  }, [pointsGeoJson]);
  const styledGeometry = useMemo<FeatureCollection | undefined>(() => {
    if (!geometry) return undefined;
    const byId = new globalThis.Map(points.map((point) => [point.id, point]));
    return {
      type: 'FeatureCollection',
      features: geometry.features.map((feature) => {
        const point = byId.get(String(feature.id));
        return {
          ...feature,
          properties: {
            ...feature.properties,
            id: String(feature.id),
            color: point ? mapPointColor(point, categoryColors, valueExtent) : '#64748b',
            highlighted: resolvedHighlightedIds.has(String(feature.id)),
          },
        };
      }),
    };
  }, [geometry, points, categoryColors, valueExtent, resolvedHighlightedIds]);
  const styledGeometryRef = useRef(styledGeometry);
  useEffect(() => {
    styledGeometryRef.current = styledGeometry;
  }, [styledGeometry]);
  useEffect(() => {
    if (!geometry || !mapInstance) return undefined;
    const map = mapInstance;
    const canvas = map.getCanvas();
    const previousCursor = canvas.style.cursor;
    const owner = Symbol('clio-map-geometry-owner');
    const ensureGeometryLayers = () => {
      // Raster tile requests can fail while the base style and its layer are
      // already usable. `isStyleLoaded()` remains false in that case and would
      // hide every data overlay even though the map itself is visible.
      if (!map.getLayer('openStreetMap')) return;
      pointsLayerOwners.set(map, owner);
      if (!map.getSource(GEOMETRY_SOURCE_ID))
        map.addSource(GEOMETRY_SOURCE_ID, {
          type: 'geojson',
          data: styledGeometryRef.current ?? geometry,
        });
      const color: ExpressionSpecification = [
        'case',
        ['get', 'highlighted'],
        POINT_HIGHLIGHTED_COLOR,
        ['get', 'color'],
      ];
      const lineWidth: ExpressionSpecification = denseTrajectories
        ? [
            'interpolate',
            ['linear'],
            ['zoom'],
            1,
            ['case', ['get', 'highlighted'], 5, 1],
            5,
            ['case', ['get', 'highlighted'], 5, 3],
          ]
        : ['case', ['get', 'highlighted'], 5, 3];
      const lineOpacity: ExpressionSpecification | number = denseTrajectories
        ? [
            'interpolate',
            ['linear'],
            ['zoom'],
            1,
            ['case', ['get', 'highlighted'], 1, 0.35],
            5,
            ['case', ['get', 'highlighted'], 1, 0.9],
          ]
        : 1;
      const pointOpacity: ExpressionSpecification | number = denseTrajectories
        ? ['step', ['zoom'], ['case', ['get', 'highlighted'], 1, 0], 4, 1]
        : 1;
      const setPaintIfChanged = (
        layerId: string,
        property: 'line-width' | 'line-opacity' | 'circle-opacity' | 'circle-stroke-opacity',
        value: ExpressionSpecification | number,
      ) => {
        // A reused map can lose its style while an idle callback is queued.
        if (!map.getLayer(layerId)) return;
        try {
          if (JSON.stringify(map.getPaintProperty(layerId, property)) !== JSON.stringify(value)) {
            map.setPaintProperty(layerId, property, value);
          }
        } catch {
          // The new style's load event will install the layer and its paint.
        }
      };
      if (!map.getLayer(GEOMETRY_LAYER_IDS[0]))
        map.addLayer({
          id: GEOMETRY_LAYER_IDS[0],
          type: 'fill',
          source: GEOMETRY_SOURCE_ID,
          filter: ['==', ['geometry-type'], 'Polygon'],
          paint: { 'fill-color': color, 'fill-opacity': 0.42, 'fill-outline-color': '#f8fafc' },
        });
      if (!map.getLayer(GEOMETRY_LAYER_IDS[1]))
        map.addLayer({
          id: GEOMETRY_LAYER_IDS[1],
          type: 'line',
          source: GEOMETRY_SOURCE_ID,
          filter: ['==', ['geometry-type'], 'LineString'],
          paint: {
            'line-color': color,
            'line-width': lineWidth,
            'line-opacity': lineOpacity,
          },
        });
      if (!map.getLayer(GEOMETRY_LAYER_IDS[2]))
        map.addLayer({
          id: GEOMETRY_LAYER_IDS[2],
          type: 'circle',
          source: GEOMETRY_SOURCE_ID,
          filter: ['==', ['geometry-type'], 'Point'],
          paint: {
            'circle-color': color,
            'circle-radius': ['case', ['get', 'highlighted'], 7, ['get', 'endpoint'], 6, 4],
            'circle-opacity': pointOpacity,
            'circle-stroke-color': '#fff',
            'circle-stroke-width': 1,
            'circle-stroke-opacity': pointOpacity,
          },
        });
      // A pooled map can already own these layer IDs from a previous sparse
      // view. Keep its paint in sync when the new view is dense.
      setPaintIfChanged(GEOMETRY_LAYER_IDS[1], 'line-width', lineWidth);
      setPaintIfChanged(GEOMETRY_LAYER_IDS[1], 'line-opacity', lineOpacity);
      setPaintIfChanged(GEOMETRY_LAYER_IDS[2], 'circle-opacity', pointOpacity);
      setPaintIfChanged(GEOMETRY_LAYER_IDS[2], 'circle-stroke-opacity', pointOpacity);
    };
    const updateCursor = (event: MapLayerMouseEvent) => {
      const layers = GEOMETRY_LAYER_IDS.filter((id) => map.getLayer(id));
      canvas.style.cursor =
        layers.length && map.queryRenderedFeatures(event.point, { layers }).length
          ? 'pointer'
          : previousCursor;
    };
    ensureGeometryLayers();
    map.on('load', ensureGeometryLayers);
    map.on('style.load', ensureGeometryLayers);
    map.on('idle', ensureGeometryLayers);
    map.on('mousemove', updateCursor);
    return () => {
      map.off('load', ensureGeometryLayers);
      map.off('style.load', ensureGeometryLayers);
      map.off('idle', ensureGeometryLayers);
      map.off('mousemove', updateCursor);
      canvas.style.cursor = previousCursor;
      if (pointsLayerOwners.get(map) !== owner) return;
      pointsLayerOwners.delete(map);
      try {
        for (const id of GEOMETRY_LAYER_IDS) if (map.getLayer(id)) map.removeLayer(id);
        if (map.getSource(GEOMETRY_SOURCE_ID)) map.removeSource(GEOMETRY_SOURCE_ID);
      } catch {
        /* Pooled map style was already removed. */
      }
    };
  }, [geometry, mapInstance, denseTrajectories]);
  useEffect(() => {
    if (!styledGeometry || !mapInstance) return;
    (mapInstance.getSource(GEOMETRY_SOURCE_ID) as GeoJSONSource | undefined)?.setData(
      styledGeometry,
    );
  }, [styledGeometry, mapInstance]);
  // Test-only hook (see `MapDebugSurface`).
  useEffect(() => {
    if (mapInstance && rootRef.current)
      (rootRef.current as MapDebugSurface).__clioMap = mapInstance;
  }, [mapInstance]);
  // Imperative, not the declarative <Source>/<Layer> children: those gate
  // creation on `map.style._loaded` and retry only on the library's own
  // 'styledata' listener (@vis.gl/react-maplibre's source.ts/layer.ts) — a
  // reused map instance (`reuseMaps` below) can go a full mount without ever
  // firing that retry again after a swap, so the source/layer silently never
  // gets (re-)created and the canvas draws a basemap with no points at all.
  // 'load' covers a fresh instance; 'style.load' covers `setStyle()`
  // completing on a REUSED one — MapLibre's own doc: "fired once the map's
  // style has fully loaded OR CHANGED".
  useEffect(() => {
    if (!manyPoints || !mapInstance) return undefined;
    const map = mapInstance;
    const canvas = map.getCanvas();
    const previousCursor = canvas.style.cursor;
    const updatePointCursor = (event: MapLayerMouseEvent) => {
      const hit = map.getLayer(POINTS_LAYER_ID)
        ? map.queryRenderedFeatures(event.point, { layers: [POINTS_LAYER_ID] }).length > 0
        : false;
      canvas.style.cursor = hit ? 'pointer' : previousCursor;
    };
    const clearPointCursor = () => {
      canvas.style.cursor = previousCursor;
    };
    map.on('mousemove', updatePointCursor);
    canvas.addEventListener('mouseleave', clearPointCursor);
    // With `reuseMaps`, a view that moves (a surface opened full screen is
    // portaled to a new host, which remounts it) hands its pooled instance to
    // the new view before its own cleanup has run. That late cleanup must not
    // tear down the points the new view now draws on the same instance, so the
    // layer is removed only by the view that last claimed it.
    const owner = Symbol('clio-map-points-owner');
    const ensurePointsLayer = () => {
      if (!map.getLayer('openStreetMap')) return;
      pointsLayerOwners.set(map, owner);
      if (!map.getSource(POINTS_SOURCE_ID)) {
        map.addSource(POINTS_SOURCE_ID, {
          type: 'geojson',
          data: pointsGeoJsonRef.current ?? { type: 'FeatureCollection', features: [] },
        });
      }
      if (!map.getLayer(POINTS_LAYER_ID)) {
        map.addLayer({
          id: POINTS_LAYER_ID,
          type: 'circle',
          source: POINTS_SOURCE_ID,
          paint: {
            'circle-color': [
              'case',
              ['get', 'highlighted'],
              POINT_HIGHLIGHTED_COLOR,
              ['get', 'color'],
            ],
            'circle-opacity': 0.85,
            'circle-radius': ['case', ['get', 'highlighted'], 6, 4],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': ['case', ['get', 'highlighted'], 1.5, 0.5],
          },
        });
      }
    };
    ensurePointsLayer();
    map.on('load', ensurePointsLayer);
    map.on('style.load', ensurePointsLayer);
    // A reused instance can be handed over before the base layer is installed.
    // Retry when the map settles as well as when the style loads.
    map.on('idle', ensurePointsLayer);
    return () => {
      map.off('load', ensurePointsLayer);
      map.off('style.load', ensurePointsLayer);
      map.off('idle', ensurePointsLayer);
      map.off('mousemove', updatePointCursor);
      canvas.removeEventListener('mouseleave', clearPointCursor);
      clearPointCursor();
      if (pointsLayerOwners.get(map) !== owner) return;
      pointsLayerOwners.delete(map);
      // Best-effort: with `reuseMaps`, this instance may already be back in
      // the pool (or fully torn down) by the time this cleanup runs.
      try {
        if (map.getLayer(POINTS_LAYER_ID)) map.removeLayer(POINTS_LAYER_ID);
        if (map.getSource(POINTS_SOURCE_ID)) map.removeSource(POINTS_SOURCE_ID);
      } catch {
        // Style already gone; nothing left to clean up.
      }
    };
  }, [manyPoints, mapInstance]);
  // A plain data swap (points or highlights changed) — never tears the
  // layer down, so a selection change doesn't flash the whole layer.
  useEffect(() => {
    if (!manyPoints || !pointsGeoJson || !mapInstance) return;
    const source = mapInstance.getSource(POINTS_SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(pointsGeoJson);
  }, [manyPoints, mapInstance, pointsGeoJson]);
  const handleLayerClick = (event: MapLayerMouseEvent) => {
    // A shift+drag's release also fires a synthetic click. The rectangle
    // gesture above already handled selection, so ignore that echo.
    if (boxSelectMode || performance.now() - lastBoxDragAt.current < 350) return;
    // A pooled MapLibre instance can render our imperative geometry layers
    // before react-map-gl refreshes its interactive layer list. Ask the live
    // map for the hit in that case, so a visible line is always clickable.
    const map = mapRef.current?.getMap();
    const feature =
      event.features?.[0] ??
      (geometry
        ? mapRef.current?.getMap().queryRenderedFeatures(event.point, {
            layers: GEOMETRY_LAYER_IDS.filter((id) => mapRef.current?.getMap().getLayer(id)),
          })[0]
        : undefined);
    // MapLibre can draw a freshly swapped GeoJSON source before its hit index
    // catches up. Project the same data as a fallback so visible dots and
    // segments remain selectable during that interval.
    const projected =
      map && geometry ? nearestProjectedGeometryId(map, event.point, points, geometry) : undefined;
    const id = feature?.properties?.id ?? projected;
    if (typeof id === 'string')
      onSelect(
        id,
        event.originalEvent.shiftKey,
        event.originalEvent.ctrlKey || event.originalEvent.metaKey,
      );
    else onClearSelection?.();
  };

  const containerPoint = (event: ReactMouseEvent<HTMLDivElement>): { x: number; y: number } => {
    const rect = rootRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const handleMouseDownCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    suppressHandledClick.current = false;
    if (
      !onZoneSelect ||
      (!boxSelectMode && !event.shiftKey && !event.ctrlKey && !event.metaKey) ||
      event.button !== 0
    )
      return;
    // MapLibre listens for mouse events separately from pointer events. Take
    // ownership of the mouse gesture before its canvas can begin a pan.
    event.preventDefault();
    event.stopPropagation();
    const point = containerPoint(event);
    const next = { startX: point.x, startY: point.y, x: point.x, y: point.y };
    dragBoxRef.current = next;
    setDragBox(next);
  };
  const handleMouseMoveCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    const current = dragBoxRef.current;
    if (!current) return;
    event.stopPropagation();
    const point = containerPoint(event);
    const next = { ...current, x: point.x, y: point.y };
    dragBoxRef.current = next;
    setDragBox(next);
  };
  const handleMouseUpCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    const current = dragBoxRef.current;
    if (!current) return;
    event.stopPropagation();
    const point = containerPoint(event);
    const completed = { ...current, x: point.x, y: point.y };
    const map = mapRef.current?.getMap();
    const moved =
      Math.abs(completed.x - completed.startX) > ZONE_DRAG_THRESHOLD_PX ||
      Math.abs(completed.y - completed.startY) > ZONE_DRAG_THRESHOLD_PX;
    if (map && moved) {
      lastBoxDragAt.current = performance.now();
      const corner1 = map.unproject([completed.startX, completed.startY]);
      const corner2 = map.unproject([completed.x, completed.y]);
      const west = Math.min(corner1.lng, corner2.lng);
      const east = Math.max(corner1.lng, corner2.lng);
      const south = Math.min(corner1.lat, corner2.lat);
      const north = Math.max(corner1.lat, corner2.lat);
      const ids =
        geometry && !geometrySelectionByPoints
          ? [
              ...new Set(
                map
                  .queryRenderedFeatures(
                    [
                      [
                        Math.min(completed.startX, completed.x),
                        Math.min(completed.startY, completed.y),
                      ],
                      [
                        Math.max(completed.startX, completed.x),
                        Math.max(completed.startY, completed.y),
                      ],
                    ],
                    { layers: GEOMETRY_LAYER_IDS.filter((id) => map.getLayer(id)) },
                  )
                  .map((feature) => feature.properties?.id)
                  .filter((id): id is string => typeof id === 'string'),
              ),
            ]
          : points
              .filter(
                (candidate) =>
                  candidate.longitude >= west &&
                  candidate.longitude <= east &&
                  candidate.latitude >= south &&
                  candidate.latitude <= north,
              )
              .map((candidate) => candidate.id);
      onZoneSelect?.(ids, event.ctrlKey || event.metaKey, event.shiftKey);
    } else if (map && (boxSelectMode || event.shiftKey || event.ctrlKey || event.metaKey)) {
      // A tap in rectangle mode is still a point click. DOM markers sit above
      // their projected coordinate, so compare with the icon's visual centre.
      const feature = map.queryRenderedFeatures([point.x, point.y], {
        layers: geometry
          ? GEOMETRY_LAYER_IDS.filter((id) => map.getLayer(id))
          : manyPoints && map.getLayer(POINTS_LAYER_ID)
            ? [POINTS_LAYER_ID]
            : [],
      })[0];
      const hit = points.find((candidate) => {
        const projected = map.project([candidate.longitude, candidate.latitude]);
        return (
          Math.hypot(
            projected.x - point.x,
            projected.y - (geometrySelectionByPoints ? 0 : 16) - point.y,
          ) <= 18
        );
      });
      const id = feature?.properties?.id;
      if (typeof id === 'string') {
        suppressHandledClick.current = true;
        onSelect(id, event.shiftKey, event.ctrlKey || event.metaKey);
      } else if (hit) {
        suppressHandledClick.current = true;
        onSelect(hit.id, event.shiftKey, event.ctrlKey || event.metaKey);
      } else if (!event.shiftKey) {
        suppressHandledClick.current = true;
        onClearSelection?.();
      }
    }
    dragBoxRef.current = null;
    setDragBox(null);
  };

  // The map canvas owns its native drag gesture. An explicit selection layer
  // gives rectangle mode a stable pointer target even when the map reuses its
  // canvas after scrolling or a full-screen transition.
  const handleOverlayPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = containerPoint(event);
    const next = { startX: point.x, startY: point.y, x: point.x, y: point.y };
    dragBoxRef.current = next;
    setDragBox(next);
  };
  const handleOverlayPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragBoxRef.current) return;
    const point = containerPoint(event);
    const next = { ...dragBoxRef.current, x: point.x, y: point.y };
    dragBoxRef.current = next;
    setDragBox(next);
  };
  const handleOverlayPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragBoxRef.current) return;
    // Reuse the same selection calculation as Shift+drag.
    handleMouseUpCapture(event as unknown as ReactMouseEvent<HTMLDivElement>);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div
      className={cn('relative size-full', boxSelectMode && 'cursor-crosshair')}
      data-slot="a2ui-map-surface"
      onMouseDownCapture={handleMouseDownCapture}
      onMouseMoveCapture={handleMouseMoveCapture}
      onMouseUpCapture={handleMouseUpCapture}
      onPointerDownCapture={(event) => {
        if (!onZoneSelect || event.button !== 0 ||
          (!boxSelectMode && !event.shiftKey && !event.ctrlKey && !event.metaKey)) return;
        // Own the entire selection gesture, including a release over the
        // composer or outside this map. Preventing the pointer default also
        // keeps MapLibre from starting a competing compatibility mouse drag.
        event.currentTarget.setPointerCapture(event.pointerId);
        handleMouseDownCapture(event as unknown as ReactMouseEvent<HTMLDivElement>);
      }}
      onPointerMoveCapture={(event) => {
        if (dragBoxRef.current) {
          handleMouseMoveCapture(event as unknown as ReactMouseEvent<HTMLDivElement>);
        }
      }}
      onPointerUpCapture={(event) => {
        if (!dragBoxRef.current) return;
        handleMouseUpCapture(event as unknown as ReactMouseEvent<HTMLDivElement>);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onPointerCancelCapture={() => {
        dragBoxRef.current = null;
        setDragBox(null);
      }}
      onClickCapture={(event) => {
        if (!suppressHandledClick.current) return;
        suppressHandledClick.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
      ref={rootRef}
    >
      <Map
        dragPan={!boxSelectMode}
        initialViewState={viewState}
        interactiveLayerIds={
          geometry ? [...GEOMETRY_LAYER_IDS] : manyPoints ? [POINTS_LAYER_ID] : undefined
        }
        mapStyle={rasterStyle}
        maxPitch={60}
        maxZoom={16}
        minZoom={1}
        onClick={handleLayerClick}
        onError={(event) => {
          const detail = event.error?.message || 'The map tiles could not be loaded.';
          setMapError(detail);
          if (rootRef.current) (rootRef.current as MapDebugSurface).__clioMapFailure = detail;
        }}
        ref={mapRef}
        reuseMaps
        style={{ height: '100%', width: '100%' }}
      >
        <NavigationControl position="top-right" showCompass={false} />
        <MapInstanceReporter onMapInstance={handleMapInstance} />
        {manyPoints || geometry
          ? null
          : points.map((point) => {
              const highlighted = resolvedHighlightedIds.has(point.id);
              return (
                <Marker
                  anchor="bottom"
                  key={point.id}
                  latitude={point.latitude}
                  longitude={point.longitude}
                >
                  <button
                    aria-label={`Select ${point.label}`}
                    aria-pressed={highlighted}
                    className={cn(
                      'group grid size-8 cursor-pointer place-items-center rounded-full border border-white/80 text-white shadow-md transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      highlighted &&
                        'scale-110 ring-2 ring-primary ring-offset-1 ring-offset-background',
                    )}
                    style={{ backgroundColor: mapPointColor(point, categoryColors, valueExtent) }}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(point.id, event.shiftKey, event.ctrlKey || event.metaKey);
                    }}
                    type="button"
                  >
                    <MapPinIcon aria-hidden="true" className="size-4" />
                  </button>
                </Marker>
              );
            })}
        {selected ? (
          <Popup
            anchor="top"
            className="clio-scientific-map-popup"
            closeButton={false}
            closeOnClick={false}
            latitude={selected.latitude}
            longitude={selected.longitude}
            maxWidth="280px"
            offset={12}
          >
            <p className="font-medium text-foreground">{selected.label}</p>
            {selected.detail ? (
              <p className="mt-1 text-xs text-muted-foreground">{selected.detail}</p>
            ) : null}
          </Popup>
        ) : null}
      </Map>
      {boxSelectMode && onZoneSelect ? (
        <div
          aria-label="Drag to select map points"
          className="absolute inset-0 z-[1] cursor-crosshair touch-none"
          onPointerDown={handleOverlayPointerDown}
          onPointerMove={handleOverlayPointerMove}
          onPointerUp={handleOverlayPointerUp}
        />
      ) : null}
      {dragBox ? (
        <div
          className="pointer-events-none absolute z-10 rounded-sm border-2 border-dashed border-primary bg-primary/10"
          data-slot="a2ui-map-zone-drag"
          style={{
            height: Math.abs(dragBox.y - dragBox.startY),
            left: Math.min(dragBox.startX, dragBox.x),
            top: Math.min(dragBox.startY, dragBox.y),
            width: Math.abs(dragBox.x - dragBox.startX),
          }}
        />
      ) : null}
      {mapError ? (
        <p
          className="absolute inset-x-3 bottom-3 rounded-md border border-destructive/30 bg-background/95 px-3 py-2 text-xs text-destructive shadow-sm"
          role="alert"
        >
          {mapError.startsWith('layers.')
            ? 'Map data layer unavailable'
            : 'Map background unavailable'}
          : {mapError}
        </p>
      ) : null}
    </div>
  );
}
