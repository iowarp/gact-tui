import type { ScientificMapPoint } from './scientific-map-view';
import { plural, t } from '@lingui/core/macro';
import { formatNumber } from '@/lib/locale-format';

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
      aria-label={t`${valueLabel} colour scale`}
      className="grid grid-cols-[auto_minmax(5rem,1fr)_auto] items-center gap-x-2 gap-y-1 border-t px-3 py-2 text-xs text-muted-foreground"
      data-slot="a2ui-map-legend"
    >
      <span className="col-span-3 font-medium text-foreground">{valueLabel}</span>
      <span className="whitespace-nowrap tabular-nums">
        {formatNumber(valueExtent[0])}
        {valueUnit ? ` ${valueUnit}` : ''}
      </span>
      <span
        aria-hidden="true"
        className="h-2.5 min-w-0 rounded-full"
        style={{
          background:
            'linear-gradient(to right, var(--scale-low), var(--scale-mid), var(--scale-high))',
        }}
      />
      <span className="whitespace-nowrap tabular-nums">
        {formatNumber(valueExtent[1])}
        {valueUnit ? ` ${valueUnit}` : ''}
      </span>
      {points.some((point) => point.value === undefined) ? (
        <span className="col-span-3">{t`Grey: no value`}</span>
      ) : null}
    </div>
  ) : categoryColors.size > MAX_INLINE_CATEGORY_LEGEND ? (
    <div
      aria-label={t`Map colour summary`}
      className="border-t px-3 py-2 text-xs text-muted-foreground"
      data-slot="a2ui-map-legend"
    >
      {geometrySelectionByPoints
        ? points.length > 1_000
          ? plural(categoryColors.size, {
              one: '# track on the map. Colours repeat; filter to compare them. Zoom in for observations.',
              other:
                '# tracks on the map. Colours repeat; filter to compare them. Zoom in for observations.',
            })
          : plural(categoryColors.size, {
              one: '# track on the map. Colours repeat; filter to compare them.',
              other: '# tracks on the map. Colours repeat; filter to compare them.',
            })
        : plural(categoryColors.size, {
            one: '# category on the map. Colours repeat; filter to compare them.',
            other: '# categories on the map. Colours repeat; filter to compare them.',
          })}
    </div>
  ) : categoryColors.size > 0 ? (
    <div
      aria-label={t`Map category colours`}
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
            style={{ backgroundColor: 'var(--muted-foreground)' }}
          />
          {t`Uncategorized`}
        </span>
      ) : null}
      {new Set(categoryColors.values()).size < categoryColors.size ? (
        <span>{t`Some category colours repeat; use labels or filter to compare them.`}</span>
      ) : null}
    </div>
  ) : null;
}
