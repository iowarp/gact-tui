import { useCallback, useMemo, useState } from 'react';
import type { CascaderNode } from '@/components/reui/cascader/cascader-types';
import { freeSearchText, matchesFreeSearch } from '@/lib/model-filter-tokens';
import type { PickerNodeData, ProviderGroup } from './model-picker-model';
import type { PickerModelEntry, ProviderFilterCount } from './model-picker-tree';

/** A provider's search result count: models matching the text AND every token, of all it lists. */
export interface ProviderSearchCount {
  matches: number;
  total: number;
}

interface SearchViewInput {
  providers: readonly ProviderGroup[];
  entries: readonly PickerModelEntry[];
  /** The token-only counts (shown = kept by the tokens), per provider. */
  counts: ReadonlyMap<string, ProviderFilterCount>;
  total: number;
  query: string;
}

/**
 * What the picker's search results show: per provider, how many of its models
 * match BOTH the free text and the active tokens ("11 / 458"), the same sum
 * across providers for the search bar ("12 / 469"), which providers have no
 * match at all (hidden from the results, and counted for the "N providers
 * with no matches" line), and which provider groups the person folded.
 *
 * The fold state lives as long as the hook's owner keeps it -- the picker
 * resets it each time it opens (`resetCollapsed`).
 */
export function useModelPickerSearchView({ providers, entries, counts, total, query }: SearchViewInput) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const text = freeSearchText(query);
  const searching = text.length > 0;

  const view = useMemo(() => {
    const matched = new Set<string>();
    const perProvider = new Map<string, ProviderSearchCount>();
    for (const group of providers) {
      perProvider.set(group.id, { matches: 0, total: counts.get(group.id)?.total ?? 0 });
    }
    for (const entry of entries) {
      if (!entry.kept) continue;
      if (searching && !matchesFreeSearch(entry.node, text)) continue;
      matched.add(entry.node.value);
      const count = perProvider.get(entry.group.id);
      if (count) count.matches += 1;
    }
    const all = [...perProvider.values()];
    const matches = all.reduce((sum, count) => sum + count.matches, 0);
    // A provider that lists no models was never searched: it is not "no matches".
    const emptyProviders = searching ? all.filter((count) => count.total > 0 && count.matches === 0).length : 0;
    return { matched, perProvider, matches, emptyProviders };
  }, [providers, entries, counts, searching, text]);

  const toggleCollapsed = useCallback((providerId: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(providerId)) next.delete(providerId);
      else next.add(providerId);
      return next;
    });
  }, []);

  const resetCollapsed = useCallback(() => setCollapsed(new Set()), []);

  /** Whether a model matches the free text (always, with none typed). */
  const matchesText = useCallback(
    (entry: PickerModelEntry) => !searching || matchesFreeSearch(entry.node, text),
    [searching, text],
  );

  /**
   * The cascader's row filter. While free text is searched: a provider row
   * shows only when it has a match, and a model row only when it matches and
   * its provider is not folded. Otherwise the plain text matcher (a typed
   * token is never text, so it keeps every row).
   */
  const filter = useCallback(
    (node: CascaderNode<PickerNodeData>, normalizedQuery: string) => {
      if (!searching) return matchesFreeSearch(node, normalizedQuery);
      if (node.data?.kind === 'provider') {
        return (view.perProvider.get(node.data.group.id)?.matches ?? 0) > 0;
      }
      if (node.data?.kind === 'model') {
        return view.matched.has(node.value) && !collapsed.has(node.data.choice.providerId);
      }
      return matchesFreeSearch(node, normalizedQuery);
    },
    [searching, view, collapsed],
  );

  return {
    searching,
    /** Matching models across every listed provider, of `total`. */
    matches: view.matches,
    total,
    /** Per provider: "matches / total". */
    counts: view.perProvider as ReadonlyMap<string, ProviderSearchCount>,
    /** Providers the search hides for having no match. */
    emptyProviders: view.emptyProviders,
    collapsed,
    toggleCollapsed,
    resetCollapsed,
    filter,
    /** The filter panel's counts read it. */
    matchesText,
  };
}
