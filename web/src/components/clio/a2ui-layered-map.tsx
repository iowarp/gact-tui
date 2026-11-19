import type { ArtifactGridInfo } from '@clio/core/v3';
import type { FeatureCollection, Geometry } from 'geojson';
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MapPinIcon,
  SplineIcon,
  SquareDashedIcon,
} from 'lucide-react';
import type { GeoJSONSource, MapLayerMouseEvent, MapLibreMap } from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MapView, { NavigationControl, ScaleControl } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { t, ph } from '@lingui/core/macro';
import { Button } from '@/components/ui/button';
import { useRepository } from '@/hooks/use-repository';
import { RemoveIcon } from '@/lib/icon-vocabulary';
import { useA2uiReference } from '@/lib/a2ui/use-a2ui-reference';
import {
  COLORMAP_STOPS,
  DATA_SCALE_EXEMPTION,
  colormapGradient,
  type Colormap,
} from '@/theme/data-scales';
import { readThemeColor } from '@/theme/runtime';
import { installClioTileReader } from './clio-tile-protocol';
import {
  drawnGeometry,
  frameAt,
  isoTime,
  mergeTimes,
  rowBounds,
  selectedTime,
  timeSelection,
  unionBounds,
  applyEdits,
  withEdit,
  type Bounds,
  type DrawMode,
  type MapLayer,
} from './layered-map-model';
import type { CategoryLegend, CategoryLegendEntry } from './layered-map-categories';
import { LayeredMapCategoryLegend } from './layered-map-category-legend';
import { LayeredMapContext, type PointLabel } from './layered-map-context';
import { MAX_POINT_LABELS } from './layered-map-graticule';
import { GridLayerSource, ShapesLayerSource, TableLayerSource } from './layered-map-layers';
import { layerStyleIds, useGridInfo } from './layered-map-style';
import { mapCameraSchema, useMapCamera, type MapCameraProps } from './map-camera';
import { offlineStyle } from './map-initial-view';
import type { MapDebugSurface } from './scientific-map-pool';
import { parseSelectionState, type SelectionWriter } from './selection-state';
import type { QueryRow, TableDataQuery } from './table-query-rows';

const DRAW_SOURCE = 'clio-layered-draw';

export interface LayeredMapProps extends MapCameraProps {
  componentId: string;
  title?: string;
  layers: MapLayer[];
  time?: unknown;
  timeField?: string;
  setTime?: SelectionWriter;
  selection?: unknown;
  selectionField?: string;
  setSelection?: SelectionWriter;
  drawMode?: DrawMode;
  writeDraw?: (geometry: Geometry) => void;
  edits?: unknown;
  writeEdits?: (edits: unknown) => void;
  queries: Record<string, TableDataQuery | undefined>;
  action?: () => void;
  actionLabel?: string;
  height?: number;
}

function GridInfoProbe({
  layer,
  onInfo,
}: {
  layer: MapLayer;
  onInfo: (id: string, info?: ArtifactGridInfo, error?: string) => void;
}) {
  const { info, error } = useGridInfo(layer);
  useEffect(() => onInfo(layer.id, info, error), [error, info, layer.id, onInfo]);
  return null;
}

function ShapesProbe({
  map,
  layer,
  visible,
}: {
  map: MapLibreMap;
  layer: MapLayer;
  visible: boolean;
}) {
  const reference = useA2uiReference(layer.geojsonUri ?? '', {
    enabled: Boolean(layer.geojsonUri),
  });
  const geojson = useMemo(() => {
    if (!reference.bytes) return undefined;
    try {
      return JSON.parse(new TextDecoder().decode(reference.bytes)) as unknown;
    } catch {
      return undefined;
    }
  }, [reference.bytes]);
  return <ShapesLayerSource map={map} layer={layer} visible={visible} geojson={geojson} />;
}

function Legend({ layer, info }: { layer: MapLayer; info?: ArtifactGridInfo }) {
  const map: Colormap = layer.colormap ?? 'viridis';
  const range = layer.valueRange ?? info?.range;
  const unit = layer.unit ?? info?.units ?? '';
  if (!range) return null;
  return (
    <div className="flex min-w-40 flex-col gap-1 text-xs" {...DATA_SCALE_EXEMPTION}>
      <span className="font-medium">{layer.label}</span>
      <span
        aria-hidden="true"
        className="h-2 rounded-sm"
        style={{ background: colormapGradient(map) }}
      />
      <span className="flex justify-between text-muted-foreground">
        <span>{range[0].toPrecision(3)}</span>
        <span>{unit}</span>
        <span>{range[1].toPrecision(3)}</span>
      </span>
      <span className="sr-only">{t`Colour scale from ${ph({ low: range[0] })} to ${ph({ high: range[1] })} ${ph({ unit })}, ${ph({ stops: COLORMAP_STOPS[map].length })} stops`}</span>
    </div>
  );
}

/** `clio.layered-map.v1`: gridded fields, points, tracks and shapes on one time axis. */
export function ClioLayeredMap(props: LayeredMapProps) {
  const repository = useRepository();
  const [map, setMap] = useState<MapLibreMap>();
  const surfaceRef = useRef<MapDebugSurface>(null);
  // One style object for the map's life: a new one each render would make the
  // map re-apply its style and drop the layers added below.
  const baseStyle = useMemo(() => offlineStyle(), []);
  const [visible, setVisible] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(props.layers.map((layer) => [layer.id, layer.visible ?? true])),
  );
  const [infos, setInfos] = useState<Record<string, ArtifactGridInfo | undefined>>({});
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [rowTimes, setRowTimes] = useState<Record<string, unknown[]>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [rowBoxes, setRowBoxes] = useState<Record<string, Bounds | undefined>>({});
  // Set once the person pans or zooms: the map then stays where they put it.
  const moved = useRef(false);
  const [drawing, setDrawing] = useState(false);
  const [vertices, setVertices] = useState<[number, number][]>([]);
  const [localTime, setLocalTime] = useState<number>();
  const dragging = useRef<{ layer: string; id: string } | null>(null);

  useEffect(() => {
    installClioTileReader((artifactId, request, signal) =>
      repository.artifactTileBytes(artifactId, request, signal),
    );
  }, [repository]);
  useMapCamera(map, props.camera, props.setCamera);

  const onInfo = useCallback((id: string, info?: ArtifactGridInfo, error?: string) => {
    setInfos((current) => (current[id] === info ? current : { ...current, [id]: info }));
    if (error) setFailures((current) => ({ ...current, [id]: error }));
  }, []);
  const [labelRows, setLabelRows] = useState<Record<string, readonly QueryRow[]>>({});
  const [categories, setCategories] = useState<Record<string, CategoryLegendEntry[]>>({});
  const onCategories = useCallback((id: string, entries: CategoryLegendEntry[]) => {
    setCategories((current) =>
      current[id] === entries || (!current[id]?.length && !entries.length)
        ? current
        : { ...current, [id]: entries },
    );
  }, []);
  const categoryLegends = useMemo<CategoryLegend[]>(
    () =>
      props.layers.flatMap((layer) =>
        layer.categoryField && (visible[layer.id] ?? true) && categories[layer.id]?.length
          ? [
              {
                layerId: layer.id,
                label: layer.label,
                field: layer.categoryField,
                entries: categories[layer.id]!,
              },
            ]
          : [],
      ),
    [categories, props.layers, visible],
  );
  // Names of a few points (a plan's stations), drawn beside them where they are now.
  const pointLabels = useMemo<PointLabel[]>(
    () =>
      props.layers.flatMap((layer) => {
        const rows = labelRows[layer.id];
        if (layer.kind !== 'points' || !layer.labelField || !rows) return [];
        if (rows.length > MAX_POINT_LABELS) return [];
        return applyEdits(layer, rows, props.edits).flatMap((row, index) => {
          const longitude = Number(row[layer.longitudeField ?? 'longitude']);
          const latitude = Number(row[layer.latitudeField ?? 'latitude']);
          const text = row[layer.labelField!];
          if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || text == null) return [];
          return [{ key: `${layer.id}:${index}`, longitude, latitude, text: String(text) }];
        });
      }),
    [labelRows, props.edits, props.layers],
  );
  const onRows = useCallback(
    (id: string, rows: readonly QueryRow[], note: string) => {
      const layer = props.layers.find((entry) => entry.id === id);
      const field = layer?.timeField;
      setRowTimes((current) => ({ ...current, [id]: field ? rows.map((row) => row[field]) : [] }));
      if (layer) setRowBoxes((current) => ({ ...current, [id]: rowBounds(layer, rows) }));
      if (layer) setLabelRows((current) => ({ ...current, [id]: rows }));
      setNotes((current) => (current[id] === note ? current : { ...current, [id]: note }));
    },
    [props.layers],
  );

  const times = useMemo(() => {
    const lists: unknown[][] = Object.values(rowTimes);
    for (const layer of props.layers) {
      const info = infos[layer.id];
      const dim = info?.leading.find((entry) => entry.dim === (layer.timeDimension ?? 'time'));
      if (dim) lists.push(dim.values);
    }
    return mergeTimes(lists);
  }, [infos, props.layers, rowTimes]);
  // Open on the data: fit the layers' extent until the person moves the map or a
  // producer binds the camera.
  const extent = useMemo(
    () =>
      unionBounds([
        ...Object.values(rowBoxes),
        ...Object.values(infos).map((info) => info?.bounds as Bounds | undefined),
      ]),
    [infos, rowBoxes],
  );
  const cameraBound = mapCameraSchema.safeParse(props.camera).success;
  useEffect(() => {
    if (!map) return;
    const mark = (event: { originalEvent?: unknown }) => {
      if (event.originalEvent) moved.current = true;
    };
    map.on('movestart', mark);
    return () => {
      map.off('movestart', mark);
    };
  }, [map]);
  useEffect(() => {
    if (!map || !extent || cameraBound || moved.current) return;
    const [west, south, east, north] = extent;
    map.fitBounds(
      [
        [west, south],
        [east, north],
      ],
      { padding: 32, maxZoom: 9, duration: 0 },
    );
  }, [cameraBound, extent, map]);
  const bound = selectedTime(props.time);
  const now = frameAt(times, bound ?? localTime);
  const index = now === undefined ? -1 : times.indexOf(now);
  const setNow = useCallback(
    (ms: number) => {
      setLocalTime(ms);
      if (props.setTime && props.timeField)
        props.setTime(timeSelection(props.timeField, ms, props.componentId) as never);
    },
    [props],
  );

  const selectedIds = useMemo(() => {
    const state = parseSelectionState(props.selection);
    return new Set(
      state && (!props.selectionField || state.field === props.selectionField)
        ? state.values.map(String)
        : [],
    );
  }, [props.selection, props.selectionField]);

  // Draft drawing overlay.
  useEffect(() => {
    if (!map) return;
    const geometry: FeatureCollection = {
      type: 'FeatureCollection',
      features: vertices.length
        ? [
            {
              type: 'Feature',
              properties: {},
              geometry: { type: 'MultiPoint', coordinates: vertices },
            },
            ...(vertices.length > 1
              ? [
                  {
                    type: 'Feature' as const,
                    properties: {},
                    geometry: (props.drawMode === 'box'
                      ? drawnGeometry('box', vertices)
                      : { type: 'LineString' as const, coordinates: vertices })!,
                  },
                ]
              : []),
          ]
        : [],
    };
    const source = map.getSource(DRAW_SOURCE) as GeoJSONSource | undefined;
    if (source) source.setData(geometry);
    else {
      map.addSource(DRAW_SOURCE, { type: 'geojson', data: geometry });
      const colour = readThemeColor('foreground');
      map.addLayer({
        id: `${DRAW_SOURCE}-line`,
        type: 'line',
        source: DRAW_SOURCE,
        paint: { 'line-color': colour, 'line-width': 2, 'line-dasharray': [2, 1] },
      });
      map.addLayer({
        id: `${DRAW_SOURCE}-point`,
        type: 'circle',
        source: DRAW_SOURCE,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-color': colour, 'circle-radius': 4 },
      });
    }
  }, [map, props.drawMode, vertices]);

  const finishDrawing = useCallback(
    (points: [number, number][]) => {
      const geometry = props.drawMode ? drawnGeometry(props.drawMode, points) : undefined;
      if (geometry && props.writeDraw) props.writeDraw(geometry);
      setDrawing(false);
    },
    [props],
  );

  const interactiveLayers = useMemo(
    () =>
      props.layers
        .filter((layer) => layer.kind === 'points' || layer.kind === 'tracks')
        .flatMap(layerStyleIds),
    [props.layers],
  );

  const onClick = useCallback(
    (event: MapLayerMouseEvent) => {
      const point: [number, number] = [event.lngLat.lng, event.lngLat.lat];
      if (drawing && props.drawMode) {
        const next = [...vertices, point];
        setVertices(next);
        if (props.drawMode === 'point' || (props.drawMode === 'box' && next.length === 2))
          finishDrawing(next);
        return;
      }
      if (!map || !props.setSelection || !props.selectionField) return;
      const hit = map.queryRenderedFeatures(event.point, {
        layers: interactiveLayers.filter((id) => map.getLayer(id)),
      })[0];
      const id = hit?.properties?.id as string | undefined;
      props.setSelection({
        field: props.selectionField,
        values: id ? [id] : [],
        source: props.componentId,
      } as never);
    },
    [drawing, finishDrawing, interactiveLayers, map, props, vertices],
  );

  // Moving an editable point: press on it, drag, release to record the edit.
  const { edits, layers, writeEdits } = props;
  useEffect(() => {
    if (!map || !writeEdits) return;
    const editable = layers
      .filter((layer) => layer.editable)
      .map((layer) => layerStyleIds(layer)[1]!);
    if (!editable.length) return;
    const down = (event: MapLayerMouseEvent) => {
      const hit = map.queryRenderedFeatures(event.point, {
        layers: editable.filter((id) => map.getLayer(id)),
      })[0];
      if (!hit) return;
      event.preventDefault();
      dragging.current = { layer: String(hit.properties?.layer), id: String(hit.properties?.id) };
      map.dragPan.disable();
    };
    const up = (event: MapLayerMouseEvent) => {
      if (!dragging.current) return;
      writeEdits(
        withEdit(edits, {
          ...dragging.current,
          longitude: event.lngLat.lng,
          latitude: event.lngLat.lat,
        }),
      );
      dragging.current = null;
      map.dragPan.enable();
    };
    map.on('mousedown', down);
    map.on('mouseup', up);
    return () => {
      map.off('mousedown', down);
      map.off('mouseup', up);
    };
  }, [edits, layers, map, writeEdits]);

  const gridLayers = props.layers.filter((layer) => layer.kind === 'grid');
  const failed = Object.entries(failures);
  const note = Object.values(notes).find(Boolean);
  const drawLabel = { box: t`Draw a box`, path: t`Draw a path`, point: t`Place a point` };
  const DrawIcon =
    props.drawMode === 'box'
      ? SquareDashedIcon
      : props.drawMode === 'point'
        ? MapPinIcon
        : SplineIcon;

  return (
    <section
      className="flex flex-col gap-2 rounded-lg border bg-card p-3"
      aria-label={props.title ?? t`Map`}
    >
      <header className="flex flex-wrap items-center gap-2">
        {props.title ? (
          <h3 className="mr-auto text-sm font-medium">{props.title}</h3>
        ) : (
          <span className="mr-auto" />
        )}
        {/* min-w-0: a fieldset will not shrink below its content by default, so the
            toggles overflowed and were clipped instead of wrapping. */}
        <fieldset className="flex min-w-0 flex-wrap gap-2 text-xs">
          <legend className="sr-only">{t`Layers`}</legend>
          {props.layers.map((layer) => (
            <label key={layer.id} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={visible[layer.id] ?? true}
                onChange={(event) =>
                  setVisible((current) => ({ ...current, [layer.id]: event.target.checked }))
                }
              />
              {layer.label}
            </label>
          ))}
        </fieldset>
        {props.drawMode ? (
          drawing ? (
            <>
              {props.drawMode === 'path' ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={vertices.length < 2}
                  onClick={() => finishDrawing(vertices)}
                >
                  <CheckIcon aria-hidden="true" />
                  {t`Finish path`}
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDrawing(false);
                  setVertices([]);
                }}
              >
                <RemoveIcon aria-hidden="true" />
                {t`Cancel drawing`}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setVertices([]);
                setDrawing(true);
              }}
            >
              <DrawIcon aria-hidden="true" />
              {drawLabel[props.drawMode]}
            </Button>
          )
        ) : null}
        {props.action ? (
          <Button size="sm" onClick={props.action}>
            {props.actionLabel ?? t`Send to agent`}
          </Button>
        ) : null}
      </header>
      <div
        ref={surfaceRef}
        data-slot="a2ui-map-surface"
        className="relative overflow-hidden rounded-md"
        style={{ height: props.height ?? 420 }}
      >
        <MapView
          initialViewState={{ longitude: 0, latitude: 20, zoom: 1.2 }}
          mapStyle={baseStyle}
          renderWorldCopies={false}
          onLoad={(event) => {
            // A capture of this view waits for its tiles through the same hook as clio.map.v1.
            if (surfaceRef.current) surfaceRef.current.__clioMap = event.target;
            setMap(event.target);
          }}
          onError={(event) => {
            if (surfaceRef.current)
              surfaceRef.current.__clioMapFailure = String(event.error?.message ?? event.error);
          }}
          onClick={onClick}
          cursor={drawing ? 'crosshair' : undefined}
          attributionControl={{ compact: true }}
          style={{ width: '100%', height: '100%' }}
        >
          <NavigationControl position="top-right" showCompass={false} />
          <ScaleControl
            position="bottom-left"
            unit="metric"
            style={{
              background: 'color-mix(in srgb, var(--background) 85%, transparent)',
              color: 'var(--foreground)',
              borderColor: 'var(--muted-foreground)',
            }}
          />
        </MapView>
        {map ? <LayeredMapContext map={map} labels={pointLabels} /> : null}
        {map
          ? props.layers.map((layer) =>
              layer.kind === 'grid' ? (
                <GridLayerSource
                  key={layer.id}
                  map={map}
                  layer={layer}
                  info={infos[layer.id]}
                  now={now}
                  visible={visible[layer.id] ?? true}
                />
              ) : layer.kind === 'shapes' ? (
                <ShapesProbe
                  key={layer.id}
                  map={map}
                  layer={layer}
                  visible={visible[layer.id] ?? true}
                />
              ) : (
                <TableLayerSource
                  key={layer.id}
                  map={map}
                  layer={layer}
                  now={now}
                  edits={props.edits}
                  selectedIds={selectedIds}
                  visible={visible[layer.id] ?? true}
                  query={props.queries[layer.id]}
                  onRows={onRows}
                  onCategories={onCategories}
                />
              ),
            )
          : null}
        {gridLayers.map((layer) => (
          <GridInfoProbe key={layer.id} layer={layer} onInfo={onInfo} />
        ))}
        {gridLayers.length ? (
          <div className="absolute top-2 left-2 flex flex-col gap-2 rounded-md bg-background/85 p-2">
            {gridLayers
              .filter((layer) => visible[layer.id] ?? true)
              .map((layer) => (
                <Legend key={layer.id} layer={layer} info={infos[layer.id]} />
              ))}
          </div>
        ) : null}
        {drawing ? (
          <p
            role="status"
            className="absolute left-2 top-2 rounded bg-background/85 px-2 py-1 text-xs"
          >
            {props.drawMode === 'path'
              ? t`Click to add points, then Finish path.`
              : props.drawMode === 'box'
                ? t`Click two opposite corners.`
                : t`Click to place the point.`}
          </p>
        ) : null}
      </div>
      <LayeredMapCategoryLegend legends={categoryLegends} />
      {times.length > 1 ? (
        <div className="flex items-center gap-2 text-xs">
          <Button
            size="icon"
            variant="ghost"
            aria-label={t`Previous time`}
            disabled={index <= 0}
            onClick={() => setNow(times[index - 1]!)}
          >
            <ChevronLeftIcon aria-hidden="true" />
          </Button>
          <input
            type="range"
            className="grow"
            min={0}
            max={times.length - 1}
            value={Math.max(index, 0)}
            aria-label={t`Time`}
            aria-valuetext={now === undefined ? undefined : isoTime(now)}
            onChange={(event) => setNow(times[Number(event.target.value)]!)}
          />
          <Button
            size="icon"
            variant="ghost"
            aria-label={t`Next time`}
            disabled={index >= times.length - 1}
            onClick={() => setNow(times[index + 1]!)}
          >
            <ChevronRightIcon aria-hidden="true" />
          </Button>
          <time
            className="min-w-36 tabular-nums"
            dateTime={now === undefined ? undefined : isoTime(now)}
          >
            {now === undefined ? '' : isoTime(now).replace('T', ' ').replace(':00Z', ' UTC')}
          </time>
          <span className="text-muted-foreground">{t`${ph({ position: index + 1 })} of ${ph({ count: times.length })}`}</span>
        </div>
      ) : null}
      {failed.length ? (
        <p role="alert" className="text-xs text-destructive">
          {t`A grid layer could not be read: ${ph({ reason: failed[0]![1] })}`}
        </p>
      ) : null}
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    </section>
  );
}
