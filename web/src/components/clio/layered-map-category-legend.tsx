import { useState } from 'react';
import { plural, ph, t } from '@lingui/core/macro';
import { CATEGORY_LEGEND_SHOWN, type CategoryLegend } from './layered-map-categories';

function LayerCategories({ legend }: { legend: CategoryLegend }) {
  const [expanded, setExpanded] = useState(false);
  const { entries } = legend;
  const shown = expanded ? entries : entries.slice(0, CATEGORY_LEGEND_SHOWN);
  const hidden = entries.length - shown.length;
  const repeats = new Set(entries.map((entry) => entry.color)).size < entries.length;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      <span className="font-medium text-foreground">
        {legend.label}{' '}
        <span className="font-normal text-muted-foreground">{t`colored by ${ph({ field: legend.field })}`}</span>
      </span>
      <ul
        className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1"
        aria-label={t`Map category colours`}
      >
        {shown.map((entry) => (
          <li
            className="inline-flex min-w-0 max-w-full items-center gap-1.5"
            key={entry.category ?? ''}
          >
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full ring-1 ring-background"
              style={{ backgroundColor: entry.color }}
            />
            <span className="truncate">{entry.category ?? t`Uncategorized`}</span>
          </li>
        ))}
      </ul>
      {hidden > 0 || expanded ? (
        <button
          type="button"
          className="rounded px-1 text-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? t`Show fewer` : plural(hidden, { one: '+# more', other: '+# more' })}
        </button>
      ) : null}
      {repeats ? (
        <span className="basis-full">{t`Some category colours repeat; use labels or filter to compare them.`}</span>
      ) : null}
    </div>
  );
}

/**
 * Which colour is which category, for every shown points or tracks layer coloured by
 * `categoryField`. It sits under the map, beside the time control, so it never covers
 * the data; past `CATEGORY_LEGEND_SHOWN` categories the most frequent show and the rest
 * open from "+N more".
 */
export function LayeredMapCategoryLegend({ legends }: { legends: readonly CategoryLegend[] }) {
  const shown = legends.filter((legend) => legend.entries.length > 0);
  if (!shown.length) return null;
  return (
    <div
      className="flex flex-col gap-1 text-xs text-muted-foreground"
      data-slot="a2ui-layered-map-legend"
    >
      {shown.map((legend) => (
        <LayerCategories key={legend.layerId} legend={legend} />
      ))}
    </div>
  );
}
