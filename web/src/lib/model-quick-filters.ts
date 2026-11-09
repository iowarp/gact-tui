import type { FacetChip, FacetTab } from './model-facets';
import { addModelFilterToken, type ModelFilterToken } from './model-filter-tokens';
import { parseRangeToken, type RangeKind } from './model-range-tokens';

export type QuickFilterId =
  | 'tools'
  | 'vision'
  | 'reasoning'
  | 'web'
  | 'free'
  | 'context'
  | 'cost'
  | 'recent';

interface QuickFilterDefinition {
  id: QuickFilterId;
  label: string;
  token: ModelFilterToken;
  /** A range filter is on while any token of its kind is (a slider may have moved it). */
  range?: RangeKind;
}

/** The picker's row-2 quick filters, in the spec's order. */
const QUICK_FILTERS: readonly QuickFilterDefinition[] = [
  { id: 'tools', label: 'Tools', token: 'cap:tools' },
  { id: 'vision', label: 'Vision', token: 'input:image' },
  { id: 'reasoning', label: 'Reasoning', token: 'cap:reasoning' },
  { id: 'web', label: 'Web search', token: 'cap:web-search' },
  { id: 'free', label: 'Free', token: 'free' },
  { id: 'context', label: 'Context over 32K', token: 'context:>32K', range: 'context' },
  { id: 'cost', label: 'Input under $1 per 1M tokens', token: 'cost:<1', range: 'cost' },
  {
    id: 'recent',
    label: 'Released in the last 6 months',
    token: 'released:<6mo',
    range: 'released',
  },
];

export interface QuickFilter {
  id: QuickFilterId;
  label: string;
  token: ModelFilterToken;
  active: boolean;
  /** Models it would list (undefined for a range, which has no chip count). */
  count?: number;
  /** The active range token's bound, shown beside the icon (`>32K`). */
  value?: string;
  /** The default tokens pressing it swaps out. */
  replaces: readonly ModelFilterToken[];
}

function rangeKind(token: ModelFilterToken): RangeKind | undefined {
  return parseRangeToken(token)?.kind;
}

/**
 * The quick filters the listed models can use: a capability only when a
 * listed model carries it (or it is on), a range only where the catalog has
 * facts to slide over (`ranges`).
 */
export function quickFilters(
  tabs: readonly FacetTab[],
  tokens: readonly ModelFilterToken[],
  ranges: boolean,
): QuickFilter[] {
  const chips = new Map<ModelFilterToken, FacetChip>();
  for (const tab of tabs) {
    for (const group of tab.groups) {
      for (const chip of group.chips) if (!chip.remote) chips.set(chip.token, chip);
    }
  }
  const filters: QuickFilter[] = [];
  for (const definition of QUICK_FILTERS) {
    if (definition.range) {
      if (!ranges) continue;
      const active = tokens.find((token) => rangeKind(token) === definition.range);
      filters.push({
        id: definition.id,
        label: definition.label,
        token: definition.token,
        active: Boolean(active),
        value: active?.slice(active.indexOf(':') + 1),
        replaces: [],
      });
      continue;
    }
    const chip = chips.get(definition.token);
    const active = tokens.includes(definition.token);
    if (!active && (!chip || chip.count === 0)) continue;
    filters.push({
      id: definition.id,
      label: definition.label,
      token: definition.token,
      active,
      count: chip?.count,
      replaces: chip?.replaces ?? [],
    });
  }
  return filters;
}

/** The tokens after pressing a quick filter: off when on, else on (a range replaces its kind). */
export function toggleQuickFilter(
  tokens: readonly ModelFilterToken[],
  filter: QuickFilter,
): ModelFilterToken[] {
  const kind = rangeKind(filter.token);
  if (filter.active) {
    return kind
      ? tokens.filter((token) => rangeKind(token) !== kind)
      : tokens.filter((token) => token !== filter.token);
  }
  return addModelFilterToken(
    tokens.filter((token) => !filter.replaces.includes(token)),
    filter.token,
  );
}

/** Whether the quick strip draws this token (so it needs no chip of its own). */
export function isQuickFilterToken(
  token: ModelFilterToken,
  shown: readonly QuickFilter[],
): boolean {
  const kind = rangeKind(token);
  return shown.some((filter) => (kind ? rangeKind(filter.token) === kind : filter.token === token));
}
