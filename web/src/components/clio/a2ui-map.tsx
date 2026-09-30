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
import { MapIcon, MapPinIcon, MousePointerSquareDashedIcon } from 'lucide-react';
import type { ReactNode } from 'react';
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
import { useContainerQuery } from '@/hooks/use-container-query';
import { cn } from '@/lib/utils';
import {
  a2uiAccessibilityLabel,
  a2uiAccessibilityProps,
  type A2UIAccessibility,
} from './a2ui-accessibility';
import { refinedStrictObject } from './a2ui-refined-schema';
import { DataFilterPopover, type DataFilterField } from './data-filter-popover';
import { DataReferenceThisButton } from './data-reference-this-button';
import { columnKindFromRows, columnKindFromSchema, describeQueryFilter, mergeFilters } from './data-query-filters';
import { dataQuerySchema, fieldNameSchema } from './data-query-schema';
import { buildZoneReference, type DataZoneReference } from './data-zone-reference';
import type { ClioColumnFilterValue } from './data-table-column-filter';
import type { ScientificMapPoint } from './scientific-map-view';
import {
  isBoundToPath,
  isSelectionValue,
  parseSelectionState,
  selectionIncludes,
  type SelectionValue,
  type SelectionWriter,
} from './selection-state';
import {
  artifactIdFromDataUri,
  type QueryRow,
  type TableDataQuery,
  useTableQueryRows,
} from './table-query-rows';

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
  /** A `dataUri` map's own filter popover, slotted into the header by `ClioMapArtifactSource`. */
  headerExtra?: ReactNode;
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
  headerExtra,
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
  }, []);

  return (
    <div className="min-w-0" data-slot="a2ui-map" ref={surfaceRef}>
      <Frame
        {...a2uiAccessibilityProps(accessibility)}
        aria-label={a2uiAccessibilityLabel(accessibility) ?? `${title} map`}
        dense
        role="group"
      >
        <FrameHeader className="flex-row flex-wrap items-center gap-x-2 gap-y-1.5">
          <MapIcon aria-hidden="true" className="size-4 text-primary" />
          <div className="min-w-0 flex-1">
            <FrameTitle>{title}</FrameTitle>
            <FrameDescription>{points.length} labeled locations</FrameDescription>
          </div>
          {headerExtra}
          {setSelection ? (
            <span
              className="hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex"
              title="Hold Shift and drag a rectangle to select every point inside it"
            >
              <MousePointerSquareDashedIcon aria-hidden="true" className="size-3.5" />
              Shift+drag to select an area
            </span>
          ) : null}
        </FrameHeader>
        <FramePanel
          className={cn(
            'grid min-h-[26rem] gap-0 p-0',
            sideBySide && 'grid-cols-[minmax(0,1fr)_15rem]',
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
              'h-[20rem] overflow-hidden border-b',
              sideBySide && 'border-r border-b-0',
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
                onSelect={setSelectedId}
                onZoneSelect={setSelection ? handleZoneSelect : undefined}
                points={points}
                selectedId={selectedId}
              />
            </Suspense>
          </div>
          <div className="flex min-h-0 flex-col">
            <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
              {/* A visible, non-virtualized count: with the point list
                  virtualized (MEDIUM 6) and a large point count drawn as one
                  GeoJSON layer rather than individually pressed buttons, an
                  "N of M" zone selection would otherwise have no on-screen
                  indication at all once the highlighted points scroll out of
                  the rendered window — sighted or not. */}
              {boundIds && boundIds.size !== points.length
                ? `${boundIds.size.toLocaleString()} of ${points.length.toLocaleString()} selected`
                : 'Locations'}
            </div>
            <div
              className={cn('max-h-64 flex-1 overflow-y-auto p-2', sideBySide && 'max-h-none')}
              data-slot="a2ui-map-points-list"
              ref={listRef}
            >
              <div className="relative w-full" style={{ height: pointsVirtualizer.getTotalSize() }}>
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
                    </div>
                  );
                })}
              </div>
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
        {unsupportedSelectionField ? (
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">
            This map's points have no “{selectionField}” value to select by — inline points support
            only id, label, or category. Selecting a point here does nothing.
          </p>
        ) : null}
      </Frame>
    </div>
  );
}

function toFiniteNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toText(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : String(value);
}

function toSelectionValue(value: unknown): SelectionValue | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  return typeof value === 'string' ? value : undefined;
}

export interface MapFieldNames {
  latitudeField: string;
  longitudeField: string;
  labelField: string;
  idField?: string;
  detailField?: string;
  categoryField?: string;
  /** A dataset column read into each point's `selectionValue` (a bound selection's key). */
  selectionField?: string;
}

/**
 * Maps queried rows to map points by the producer's `*Field` column names. A
 * row missing a finite latitude/longitude or a label is skipped rather than
 * drawn wrong; a row with no `idField` gets a stable synthetic id from its
 * position in the (server-ordered) result — never used for a bound
 * selection, which reads and writes `selectionField` (required by the schema
 * whenever `selection` is bound) instead.
 */
// oxlint-disable-next-line react/only-export-components
export function pointsFromRows(rows: readonly QueryRow[], fields: MapFieldNames): ScientificMapPoint[] {
  const points: ScientificMapPoint[] = [];
  rows.forEach((row, index) => {
    const latitude = toFiniteNumber(row[fields.latitudeField]);
    const longitude = toFiniteNumber(row[fields.longitudeField]);
    const label = toText(row[fields.labelField]);
    if (latitude === undefined || longitude === undefined || !label) return;
    const id = fields.idField ? toText(row[fields.idField]) : undefined;
    points.push({
      id: id ?? `row-${index}`,
      label,
      latitude,
      longitude,
      detail: fields.detailField ? toText(row[fields.detailField]) : undefined,
      category: fields.categoryField ? toText(row[fields.categoryField]) : undefined,
      selectionValue: fields.selectionField ? toSelectionValue(row[fields.selectionField]) : undefined,
    });
  });
  return points;
}

interface ClioMapArtifactSourceProps extends MapFieldNames {
  accessibility?: A2UIAccessibility;
  title?: string;
  dataUri: string;
  dataQuery?: TableDataQuery;
  selected?: string;
  action?: () => void;
  actionLabel?: string;
  componentId?: string;
  selection?: unknown;
  setSelection?: SelectionWriter;
}

/** Resolves `clio.map.v1`'s `dataUri` + `*Field` names to points, then renders the map. */
function ClioMapArtifactSource({
  dataQuery,
  dataUri,
  latitudeField,
  longitudeField,
  labelField,
  idField,
  detailField,
  categoryField,
  selectionField,
  title = 'Locations',
  ...rest
}: ClioMapArtifactSourceProps) {
  const columns = useMemo(() => {
    const names = [
      latitudeField,
      longitudeField,
      labelField,
      idField,
      detailField,
      categoryField,
      selectionField,
    ];
    return [...new Set(names.filter((name): name is string => Boolean(name)))];
  }, [categoryField, detailField, idField, labelField, latitudeField, longitudeField, selectionField]);
  // The same server-side filter controls the table gets, layered onto (never
  // replacing) the producer's own `dataQuery.filter` (owner ruling, #1533).
  const [filters, setFilters] = useState<ReadonlyMap<string, ClioColumnFilterValue>>(new Map());
  const handleFilterChange = useCallback(
    (key: string, value: ClioColumnFilterValue | undefined) => {
      setFilters((current) => {
        const next = new Map(current);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      });
    },
    [],
  );
  const effectiveDataQuery = useMemo<TableDataQuery | undefined>(() => {
    const merged = mergeFilters(dataQuery?.filter, filters);
    if (!merged.length) return dataQuery;
    return { ...dataQuery, filter: merged };
  }, [dataQuery, filters]);
  const { rows, loading, error, matchedRows, returnedRows, schema } = useTableQueryRows({
    columns,
    data: undefined,
    dataQuery: effectiveDataQuery,
    dataUri,
  });
  const filterableFields = useMemo<DataFilterField[]>(() => {
    const seen = new Set<string>();
    const fields: DataFilterField[] = [];
    for (const key of [categoryField, detailField]) {
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const kind = columnKindFromSchema(schema, key) ?? columnKindFromRows(rows, key);
      fields.push({ key, kind, label: key.replaceAll('_', ' ') });
    }
    return fields;
  }, [categoryField, detailField, rows, schema]);
  const filterPopover = filterableFields.length ? (
    <DataFilterPopover fields={filterableFields} filters={filters} onFilterChange={handleFilterChange} />
  ) : undefined;
  const buildReference = (): DataZoneReference => {
    const total = matchedRows ?? rows?.length ?? 0;
    const shown = returnedRows ?? rows?.length ?? 0;
    const previewColumns = [idField, labelField, categoryField, latitudeField, longitudeField].filter(
      (name): name is string => Boolean(name),
    );
    return buildZoneReference({
      componentLabel: title,
      datasetLabel: artifactIdFromDataUri(dataUri) ?? dataUri,
      filters: (effectiveDataQuery?.filter ?? []).map(describeQueryFilter),
      previewColumns,
      previewRows: (rows ?? []).slice(0, 5),
      query: { dataQuery: effectiveDataQuery, dataUri },
      zoneDescription:
        shown < total
          ? `${shown.toLocaleString()} of ${total.toLocaleString()} points`
          : `the whole view (${total.toLocaleString()} points)`,
    });
  };
  const headerExtra = (
    <>
      {filterPopover}
      {rows ? <DataReferenceThisButton buildReference={buildReference} /> : null}
    </>
  );
  const reducedCaption =
    matchedRows !== undefined && returnedRows !== undefined && returnedRows < matchedRows
      ? `Showing ${returnedRows.toLocaleString()} of ${matchedRows.toLocaleString()} points.`
      : '';
  const points = useMemo(
    () =>
      rows
        ? pointsFromRows(rows, {
            categoryField,
            detailField,
            idField,
            labelField,
            latitudeField,
            longitudeField,
            selectionField,
          })
        : undefined,
    [
      categoryField,
      detailField,
      idField,
      labelField,
      latitudeField,
      longitudeField,
      rows,
      selectionField,
    ],
  );

  if (error) {
    return (
      <Frame dense role="group">
        <FrameHeader className="flex-row items-center gap-2">
          <MapIcon aria-hidden="true" className="size-4 text-primary" />
          <FrameTitle>{title}</FrameTitle>
        </FrameHeader>
        <FramePanel>
          <p className="text-sm text-destructive">Map unavailable: {error}</p>
        </FramePanel>
      </Frame>
    );
  }
  if (loading || !points) {
    return (
      <Frame dense role="group">
        <FrameHeader className="flex-row items-center gap-2">
          <MapIcon aria-hidden="true" className="size-4 text-primary" />
          <FrameTitle>{title}</FrameTitle>
        </FrameHeader>
        <FramePanel className="p-0">
          <Skeleton aria-label={`Loading ${title} map`} className="h-[26rem] w-full rounded-none" />
        </FramePanel>
      </Frame>
    );
  }
  return (
    <div className="grid gap-1">
      <ClioScientificMap
        {...rest}
        headerExtra={headerExtra}
        points={points}
        selectionField={selectionField}
        title={title}
      />
      {reducedCaption ? (
        <p className="text-xs text-muted-foreground">{reducedCaption}</p>
      ) : null}
    </div>
  );
}

const mapDataProperties = {
  title: CommonSchemas.DynamicString.optional(),
  points: z.array(pointSchema).min(1).max(A2UI_MAP_POINTS_MAX).optional(),
  dataUri: z.string().regex(/^artifact:\/\/artifact_[A-Za-z0-9_-]+$/u).optional(),
  dataQuery: dataQuerySchema.optional(),
  latitudeField: fieldNameSchema.optional(),
  longitudeField: fieldNameSchema.optional(),
  labelField: fieldNameSchema.optional(),
  idField: fieldNameSchema.optional(),
  detailField: fieldNameSchema.optional(),
  categoryField: fieldNameSchema.optional(),
  selected: z.string().optional(),
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
    context.addIssue({ code: 'custom', message: 'selectionField is required when selection is bound' });
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
    if (props.dataUri) {
      return (
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
      );
    }
    return (
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
    );
  },
);
