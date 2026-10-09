import type { ScientificMapPoint } from './scientific-map-view';
import {
  CONTINUOUS_HIGH_COLOR,
  CONTINUOUS_LOW_COLOR,
  CONTINUOUS_MID_COLOR,
  UNCATEGORIZED_COLOR,
} from './map-category-palette';

const MAX_INLINE_CATEGORY_LEGEND = 12;

interface MapLegendProps {
  valueExtent?: [number, number];
  valueLabel: string;
  valueUnit?: string;
  points: ScientificMapPoint[];
  categoryColors: ReadonlyMap<string, string>;
  geometrySelectionByPoints?: boolean;
  hasUncategorized: boolean;
}

/** Presents the continuous or categorical colour scale used by the map. */
export function MapLegend({
  valueExtent,
  valueLabel,
  valueUnit,
  points,
  categoryColors,
  geometrySelectionByPoints,
  hasUncategorized,
}: MapLegendProps) {
  return valueExtent ? (
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
  ) : categoryColors.size > MAX_INLINE_CATEGORY_LEGEND ? (
    <div
      aria-label="Map colour summary"
      className="border-t px-3 py-2 text-xs text-muted-foreground"
      data-slot="a2ui-map-legend"
    >
      {categoryColors.size.toLocaleString()} {geometrySelectionByPoints ? 'tracks' : 'categories'}{' '}
      on the map. Colours repeat; filter to compare them.
      {geometrySelectionByPoints && points.length > 1_000 ? ' Zoom in for observations.' : ''}
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
      {new Set(categoryColors.values()).size < categoryColors.size ? (
        <span>Some category colours repeat; use labels or filter to compare them.</span>
      ) : null}
    </div>
  ) : null;
}
