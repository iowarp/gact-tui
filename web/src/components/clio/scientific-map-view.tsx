import { MapPinIcon } from 'lucide-react';
import type { GeoJSONSource, MapLibreMap } from 'maplibre-gl';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Map, {
  Marker,
  NavigationControl,
  Popup,
  type MapLayerMouseEvent,
  type MapRef,
  type ViewState,
} from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { cn } from '@/lib/utils';

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
}

interface ScientificMapViewProps {
  points: readonly ScientificMapPoint[];
  selectedId?: string;
  /**
   * Every point a bound selection currently names (a zone can hold many),
   * for the linked-highlight look; defaults to just `selectedId` when unset,
   * so callers with no shared selection (the "one point at a time" case)
   * need not pass it at all.
   */
  highlightedIds?: ReadonlySet<string>;
  onSelect: (pointId: string) => void;
  /**
   * Shift+drag a rectangle to select every point inside it (#1533 item 4:
   * "drag a rectangle on the map"). Replaces maplibre's default shift+drag
   * box-zoom for this view — see the `boxZoom.disable()` call below.
   */
  onZoneSelect?: (pointIds: string[]) => void;
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
/** Which mounted view last claimed the points layer on a (possibly pooled) map instance. */
const pointsLayerOwners = new WeakMap<MapLibreMap, symbol>();
/** Paint-expression colors; maplibre evaluates these itself and cannot read CSS custom properties. */
const POINT_COLOR = '#1d4ed8';
const POINT_HIGHLIGHTED_COLOR = '#ea580c';

interface PointFeatureProperties {
  id: string;
  highlighted: boolean;
}

function pointsToGeoJson(
  points: readonly ScientificMapPoint[],
  highlightedIds: ReadonlySet<string>,
) {
  return {
    type: 'FeatureCollection' as const,
    features: points.map((point) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [point.longitude, point.latitude] },
      properties: { id: point.id, highlighted: highlightedIds.has(point.id) } satisfies PointFeatureProperties,
    })),
  };
}

type PointsGeoJson = ReturnType<typeof pointsToGeoJson>;

/**
 * Test-only hook: an e2e assertion needs to see the map's ACTUAL declared
 * layer/source state, which no DOM query can ever observe — a "500 labeled
 * locations" list item proves the data resolved into React props, never
 * that the map component turned it into a real maplibre layer. Never read
 * by app code. See `a2ui-data-everywhere.spec.ts`'s `mapPointsLayerData`
 * helper (and its doc comment, which also covers why a live WebGL-paint
 * assertion is not reliable in that harness).
 */
export interface MapDebugSurface extends HTMLDivElement {
  __clioMap?: MapLibreMap;
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

const rasterStyle = {
  version: 8 as const,
  sources: {
    openStreetMap: {
      type: 'raster' as const,
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      minzoom: 0,
      maxzoom: 19,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'openStreetMap', type: 'raster' as const, source: 'openStreetMap' }],
};

function initialView(points: readonly ScientificMapPoint[]): Partial<ViewState> & {
  bounds?: [[number, number], [number, number]];
  fitBoundsOptions?: { padding: number; maxZoom: number };
} {
  if (points.length === 1) {
    return {
      longitude: points[0]!.longitude,
      latitude: points[0]!.latitude,
      zoom: 8,
    };
  }
  const longitudes = points.map((point) => point.longitude);
  const latitudes = points.map((point) => point.latitude);
  let west = Math.min(...longitudes);
  let east = Math.max(...longitudes);
  let south = Math.min(...latitudes);
  let north = Math.max(...latitudes);
  if (west === east) [west, east] = [west - 0.01, east + 0.01];
  if (south === north) [south, north] = [south - 0.01, north + 0.01];
  return {
    bounds: [
      [west, south],
      [east, north],
    ],
    fitBoundsOptions: { padding: 48, maxZoom: 12 },
  };
}

export function ClioScientificMapView({
  highlightedIds,
  onMapInstance,
  onSelect,
  onZoneSelect,
  points,
  selectedId,
}: ScientificMapViewProps) {
  const viewState = useMemo(() => initialView(points), [points]);
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
  // `onLoad` is called imperatively by the library once the instance truly
  // exists, sidestepping the ref-timing gap entirely; capturing it in state
  // makes "the map is ready" a real reactive dependency every effect below
  // can depend on, instead of a point-in-time ref read.
  const [mapInstance, setMapInstance] = useState<MapLibreMap | undefined>(undefined);
  const [dragBox, setDragBox] = useState<DragBox | null>(null);
  const manyPoints = points.length > MANY_POINTS_THRESHOLD;
  const resolvedHighlightedIds = useMemo(
    () => highlightedIds ?? new Set(selectedId ? [selectedId] : []),
    [highlightedIds, selectedId],
  );
  const pointsGeoJson = useMemo(
    () => (manyPoints ? pointsToGeoJson(points, resolvedHighlightedIds) : undefined),
    [manyPoints, points, resolvedHighlightedIds],
  );
  const pointsGeoJsonRef = useRef<PointsGeoJson | undefined>(pointsGeoJson);
  useEffect(() => {
    pointsGeoJsonRef.current = pointsGeoJson;
  }, [pointsGeoJson]);
  // Test-only hook (see `MapDebugSurface`).
  useEffect(() => {
    if (mapInstance && rootRef.current) (rootRef.current as MapDebugSurface).__clioMap = mapInstance;
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
    // With `reuseMaps`, a view that moves (a surface opened full screen is
    // portaled to a new host, which remounts it) hands its pooled instance to
    // the new view before its own cleanup has run. That late cleanup must not
    // tear down the points the new view now draws on the same instance, so the
    // layer is removed only by the view that last claimed it.
    const owner = Symbol('clio-map-points-owner');
    const ensurePointsLayer = () => {
      if (!map.isStyleLoaded()) return;
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
            'circle-color': ['case', ['get', 'highlighted'], POINT_HIGHLIGHTED_COLOR, POINT_COLOR],
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
    // A reused instance can be handed over while its basemap tiles are still loading:
    // `isStyleLoaded()` is false then, and 'load'/'style.load' already fired long ago,
    // so nothing above would ever retry. 'idle' fires once the map settles.
    map.on('idle', ensurePointsLayer);
    return () => {
      map.off('load', ensurePointsLayer);
      map.off('style.load', ensurePointsLayer);
      map.off('idle', ensurePointsLayer);
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
    // A shift+drag's release also fires a synthetic click at the same
    // modifier state; the rectangle gesture above already handled the
    // selection, so a held Shift here must never also select the one point
    // under the cursor.
    if (event.originalEvent.shiftKey) return;
    const feature = event.features?.[0];
    const id = feature?.properties?.id;
    if (typeof id === 'string') onSelect(id);
  };

  const containerPoint = (event: ReactPointerEvent<HTMLDivElement>): { x: number; y: number } => {
    const rect = rootRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const handlePointerDownCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!onZoneSelect || !event.shiftKey || event.button !== 0) return;
    // Takes over shift+drag from maplibre's default box-zoom (disabled below)
    // before it ever reaches the map canvas.
    event.preventDefault();
    event.stopPropagation();
    const point = containerPoint(event);
    setDragBox({ startX: point.x, startY: point.y, x: point.x, y: point.y });
  };
  const handlePointerMoveCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragBox) return;
    event.stopPropagation();
    const point = containerPoint(event);
    setDragBox({ ...dragBox, x: point.x, y: point.y });
  };
  const handlePointerUpCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragBox) return;
    event.stopPropagation();
    const map = mapRef.current?.getMap();
    const moved =
      Math.abs(dragBox.x - dragBox.startX) > ZONE_DRAG_THRESHOLD_PX ||
      Math.abs(dragBox.y - dragBox.startY) > ZONE_DRAG_THRESHOLD_PX;
    if (map && moved) {
      const corner1 = map.unproject([dragBox.startX, dragBox.startY]);
      const corner2 = map.unproject([dragBox.x, dragBox.y]);
      const west = Math.min(corner1.lng, corner2.lng);
      const east = Math.max(corner1.lng, corner2.lng);
      const south = Math.min(corner1.lat, corner2.lat);
      const north = Math.max(corner1.lat, corner2.lat);
      const ids = points
        .filter(
          (candidate) =>
            candidate.longitude >= west &&
            candidate.longitude <= east &&
            candidate.latitude >= south &&
            candidate.latitude <= north,
        )
        .map((candidate) => candidate.id);
      onZoneSelect?.(ids);
    }
    setDragBox(null);
  };

  return (
    <div
      className="relative size-full"
      data-slot="a2ui-map-surface"
      onPointerDownCapture={handlePointerDownCapture}
      onPointerMoveCapture={handlePointerMoveCapture}
      onPointerUpCapture={handlePointerUpCapture}
      ref={rootRef}
    >
      <Map
        initialViewState={viewState}
        interactiveLayerIds={manyPoints ? [POINTS_LAYER_ID] : undefined}
        mapStyle={rasterStyle}
        maxPitch={0}
        maxZoom={16}
        minZoom={1}
        onClick={manyPoints ? handleLayerClick : undefined}
        onError={(event) =>
          setMapError(event.error?.message || 'The map tiles could not be loaded.')
        }
        onLoad={(event) => {
          setMapError(undefined);
          // Shift+drag now draws a selection rectangle instead (see above).
          event.target.boxZoom.disable();
          setMapInstance(event.target);
          onMapInstance?.(event.target);
        }}
        ref={mapRef}
        reuseMaps
        style={{ height: '100%', width: '100%' }}
      >
        <NavigationControl position="top-right" showCompass={false} />
        {manyPoints
          ? null
          : points.map((point) => {
              const highlighted = resolvedHighlightedIds.has(point.id);
              return (
                <Marker anchor="bottom" key={point.id} latitude={point.latitude} longitude={point.longitude}>
                  <button
                    aria-label={`Select ${point.label}`}
                    aria-pressed={highlighted}
                    className={cn(
                      'group grid size-8 place-items-center rounded-full border bg-card text-primary shadow-md transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      highlighted && 'scale-110 border-primary bg-primary text-primary-foreground',
                    )}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(point.id);
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
          Map background unavailable. Station coordinates remain listed beside the map.
        </p>
      ) : null}
    </div>
  );
}
