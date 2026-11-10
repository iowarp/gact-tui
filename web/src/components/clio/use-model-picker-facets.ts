import { useMemo } from 'react';
import { buildModelFacets } from '@/lib/model-facets';
import type { ModelFilterToken } from '@/lib/model-filter-tokens';
import type { PickerModelEntry } from './model-picker-tree';

/**
 * What the picker's filter panel shows for the listed models: its chip tabs
 * (counts under the search text and the active tokens) and the top input
 * price the models state, which is the Cost slider's upper end.
 */
export function useModelPickerFacets(
  entries: readonly PickerModelEntry[],
  tokens: readonly ModelFilterToken[],
  searching: boolean,
  matchesText: (entry: PickerModelEntry) => boolean,
) {
  const facetTabs = useMemo(
    () =>
      buildModelFacets(
        entries.map((entry) => ({
          providerId: entry.group.id,
          providerName: entry.group.name,
          tags: entry.tags,
          tokens: entry.tokens,
          facts: entry.facts,
          matchesText: matchesText(entry),
        })),
        tokens,
        { hideEmpty: searching },
      ),
    [entries, tokens, searching, matchesText],
  );
  const maxInputPrice = useMemo(
    () =>
      entries.reduce(
        (top, entry) =>
          entry.facts.inputPrice?.kind === 'usd' ? Math.max(top, entry.facts.inputPrice.per1m) : top,
        0,
      ),
    [entries],
  );
  // The Size filter needs a stated parameter count; without one it is hidden.
  const hasSizes = useMemo(
    () => entries.some((entry) => Boolean(entry.facts.parameters?.total)),
    [entries],
  );
  return { facetTabs, maxInputPrice, hasSizes };
}
