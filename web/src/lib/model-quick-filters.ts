import type { FacetChip, FacetTab } from './model-facets';

const QUICK_FILTER_LIMIT = 5;

/**
 * The picker's row-2 quick filters: the capabilities most of the listed models
 * share, that are not on yet and would still list something.
 */
export function quickFilterChips(tabs: readonly FacetTab[]): FacetChip[] {
  const capabilities = tabs.find((tab) => tab.id === 'capabilities');
  if (!capabilities) return [];
  return capabilities.groups
    .flatMap((group) => group.chips)
    .filter((chip) => !chip.active && !chip.remote && chip.count > 0 && !chip.replaces.length)
    .sort((left, right) => right.count - left.count)
    .slice(0, QUICK_FILTER_LIMIT);
}
