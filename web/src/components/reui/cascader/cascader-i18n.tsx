import type { CascaderLabels, CascaderMode } from '@/components/reui/cascader/cascader-types';
import { plural, ph, t } from '@lingui/core/macro';

/** Name of the root level. Hoisted so the root announcement can reuse it. */
const ROOT_LEVEL = t`Top level`;

/** Hoisted for the same reason: several defaults end in an item count. */
const itemCount = (count: number) => plural(count, { one: '# item', other: '# items' });

/**
 * Interface-language defaults. Every string the primitive can render lives
 * here, so a consumer can still replace the whole surface by passing `labels`.
 */
export const CASCADER_LABELS: CascaderLabels = {
  // Deliberately NOT lowercased. `toLowerCase()` is locale-hostile - it maps
  // Turkish "İ" to a two-code-point sequence and German "İstanbul" style
  // proper nouns lose their casing - and a label is already written the way
  // its author wants it read.
  search: (parentLabel) => (parentLabel ? t`Search ${parentLabel}...` : t`Search...`),
  back: t`Back`,
  loading: t`Loading...`,
  loadingMore: t`Loading more...`,
  loadMore: t`Load more`,
  error: t`Could not load items.`,
  retry: t`Retry`,
  empty: t`No results found.`,
  selectedCount: (count) => t`${count} selected`,
  chipsLabel: t`Selected items`,
  removeChip: (label) => t`Remove ${label}`,
  // i18n-ignore: a separator glyph
  pathSeparator: '/',
  rootLevel: ROOT_LEVEL,
  itemCount,
  branchAffordance: t`submenu`,
  selectedState: t`selected`,
  partiallySelectedState: t`partially selected`,
  columnsLabel: t`Levels`,
  actionsLabel: t`Actions`,
  submenuAffordance: t`opens a menu`,
  panelLabel: t`Options`,
  keyboardHint: (mode: CascaderMode, dir: 'ltr' | 'rtl') => {
    // "Deeper" is the direction the text runs, so the level keys mirror in
    // RTL and the hint has to name the mirrored pair there - an LTR-worded
    // hint would teach exactly the wrong keys.
    const rtl = dir === 'rtl';
    if (mode === 'tree') {
      return rtl
        ? t`Use the Left Arrow key to expand and the Right Arrow key to collapse.`
        : t`Use the Right Arrow key to expand and the Left Arrow key to collapse.`;
    }
    if (mode === 'columns') {
      return rtl
        ? t`Use the Left Arrow key to open the next column and the Right Arrow key to go back.`
        : t`Use the Right Arrow key to open the next column and the Left Arrow key to go back.`;
    }
    return rtl
      ? t`Use the Left Arrow key to open a branch and the Right Arrow key to go back.`
      : t`Use the Right Arrow key to open a branch and the Left Arrow key to go back.`;
  },
  rootAnnouncement: (count) => t`${ph({ level: ROOT_LEVEL })}, ${ph({ items: itemCount(count) })}`,
  expandedAnnouncement: (label, count) => t`${label} expanded, ${ph({ items: itemCount(count) })}`,
  collapsedAnnouncement: (label) => t`${label} collapsed`,
  levelAnnouncement: (parentLabel, depth, count) =>
    t`${parentLabel}, level ${depth}, ${ph({ items: itemCount(count) })}`,
  resultsAnnouncement: (count) => plural(count, { one: '# result', other: '# results' }),
  maxReachedAnnouncement: (max) => t`Selection limit of ${max} reached`,
  cascadeAnnouncement: (label, count, selecting) =>
    selecting
      ? t`${label} selected, ${ph({ items: itemCount(count) })} followed`
      : t`${label} deselected, ${ph({ items: itemCount(count) })} followed`,
  searchingAnnouncement: t`Searching...`,
};

/**
 * Shallow-merges consumer overrides over the defaults, so `labels` can carry a
 * single key without restating the rest.
 */
export function resolveCascaderLabels(labels?: Partial<CascaderLabels>): CascaderLabels {
  if (!labels) return CASCADER_LABELS;
  return { ...CASCADER_LABELS, ...labels };
}

/** Resolves the search placeholder, which may be a string or a function. */
export function resolveCascaderSearchLabel(labels: CascaderLabels, parentLabel?: string): string {
  return typeof labels.search === 'function' ? labels.search(parentLabel) : labels.search;
}
