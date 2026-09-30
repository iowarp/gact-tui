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
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
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
import { dataQuerySchema, fieldNameSchema } from './data-query-schema';
import type { ScientificMapPoint } from './scientific-map-view';
import {
  isBoundToPath,
  parseSelectionState,
  selectionIncludes,
  type SelectionValue,
  type SelectionWriter,
} from './selection-state';
import { type QueryRow, type TableDataQuery, useTableQueryRows } from './table-query-rows';

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
}

/** Point properties a linked selection may name when no `selectionField` is given. */
const SELECTABLE_POINT_FIELDS = ['id', 'label', 'category'] as const;
type SelectablePointField = (typeof SELECTABLE_POINT_FIELDS)[number];

function isSelectablePointField(field: string): field is SelectablePointField {
  return (SELECTABLE_POINT_FIELDS as readonly string[]).includes(field);
}

/** A point's value of `field` — one of its own properties, or its dataset `selectionValue`. */
function pointSelectValue(point: ScientificMapPoint, field: string): SelectionValue | undefined {
  if (field === 'id') return point.id;
  if (field === 'label') return point.label;
  if (field === 'category') return point.category;
  return point.selectionValue;
}

export function ClioScientificMap({
  accessibility,
  title = 'Locations',
  points,
  selected,
  action,
  actionLabel = 'Use selected location',
  componentId,
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
  const boundIds = useMemo(
    () =>
      state
        ? new Set(
            points
              .filter((point) => selectionIncludes(state, pointSelectValue(point, field)))
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
  const setSelectedId = (id: string) => {
    setLocalId(id);
    const point = points.find((candidate) => candidate.id === id);
    const value = point ? pointSelectValue(point, field) : undefined;
    if (setSelection && value !== undefined) {
      setSelection({ field, values: [value], ...(componentId ? { source: componentId } : {}) });
    }
  };
  const surfaceRef = useRef<HTMLDivElement>(null);
  const sideBySide = useContainerQuery(surfaceRef, 700);
  const selectedPoint = points.find((point) => point.id === selectedId);
  const canvasRef = useRef<HTMLDivElement>(null);
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
            ref={canvasRef}
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
                  aria-pressed={isSelected(point.id)}
                  className={cn(
                    'mb-1 h-auto w-full justify-start gap-2 px-2 py-2 text-left',
                    isSelected(point.id) && 'border-primary/50 bg-primary/10',
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
  const { rows, loading, error, matchedRows, returnedRows } = useTableQueryRows({
    columns,
    data: undefined,
    dataQuery,
    dataUri,
  });
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
      <ClioScientificMap {...rest} points={points} selectionField={selectionField} title={title} />
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
