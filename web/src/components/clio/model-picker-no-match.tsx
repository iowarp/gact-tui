import { SearchIcon } from 'lucide-react';
import { RemoveIcon } from '@/lib/icon-vocabulary';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ShortcutKeys } from './primitives/key-chip';
import { cn } from '@/lib/utils';
import {
  freeSearchText,
  matchesFreeSearch,
  type ModelFilterToken,
} from '@/lib/model-filter-tokens';
import { matchesActiveTokens, parseRangeToken } from '@/lib/model-range-tokens';
import type { QuickFilter } from '@/lib/model-quick-filters';
import type { PickerModelEntry } from './model-picker-tree';
import { ph, t, plural } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';

interface WayOut {
  key: string;
  icon: ReactNode;
  label: ReactNode;
  count: number;
  run: () => void;
}

interface ModelPickerNoMatchProps {
  query: string;
  tokens: readonly ModelFilterToken[];
  /** Tokens on by default (`input:text`, `output:text`): never named, dropped only as "every model type". */
  quietTokens: readonly ModelFilterToken[];
  entries: readonly PickerModelEntry[];
  /** Row 2's filters, for the names the person sees ("Free", not `free`). */
  quickFilters: readonly QuickFilter[];
  onTokensChange: (tokens: ModelFilterToken[]) => void;
  onQueryChange: (query: string) => void;
  /** The filter panel owns the keys while it is open. */
  keyboard?: boolean;
}

function tokenName(token: ModelFilterToken, filters: readonly QuickFilter[]): string {
  const kind = parseRangeToken(token)?.kind;
  const filter = filters.find(
    (item) => item.token === token || (kind && parseRangeToken(item.token)?.kind === kind),
  );
  return filter?.label ?? token;
}

function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
      current.push(value);
      best = Math.min(best, value);
    }
    if (best > limit) return limit + 1;
    previous = current;
  }
  return previous[b.length]!;
}

/** The nearest word the kept models' names carry, for a word nothing matches ("sonet" -> "sonnet"). */
function respelled(text: string, kept: readonly PickerModelEntry[]): string | undefined {
  const words = text.toLowerCase().split(' ').filter(Boolean);
  const vocabulary = new Map<string, number>();
  for (const entry of kept) {
    const haystack = [entry.node.label, ...(entry.node.keywords ?? [])].join(' ').toLowerCase();
    for (const word of haystack.split(/[^a-z0-9.]+/u)) {
      if (word.length >= 3) vocabulary.set(word, (vocabulary.get(word) ?? 0) + 1);
    }
  }
  let changed = false;
  const next = words.map((word) => {
    if ([...vocabulary.keys()].some((known) => known.includes(word))) return word;
    const limit = word.length <= 4 ? 1 : 2;
    let best: { word: string; distance: number; uses: number } | undefined;
    for (const [known, uses] of vocabulary) {
      const distance = editDistance(word, known, limit);
      if (distance > limit) continue;
      if (!best || distance < best.distance || (distance === best.distance && uses > best.uses))
        best = { word: known, distance, uses };
    }
    if (!best) return word;
    changed = true;
    return best.word;
  });
  return changed ? next.join(' ') : undefined;
}

/**
 * The picker's no-match state (pickers-search.html, "No match"): it says why
 * -- the text, and the filters it was searched with -- and offers the ways
 * out the listed models support: drop a filter, every model type, or the
 * nearest spelling, each with how many models it would list.
 */
export function ModelPickerNoMatch({
  query,
  tokens,
  quietTokens,
  entries,
  quickFilters,
  onTokensChange,
  onQueryChange,
  keyboard = true,
}: ModelPickerNoMatchProps) {
  const text = freeSearchText(query);
  const chosen = tokens.filter((token) => !quietTokens.includes(token));
  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const ways = useMemo(() => {
    const count = (active: readonly ModelFilterToken[], search: string) =>
      entries.filter(
        (entry) =>
          matchesActiveTokens(entry.tokens, entry.facts, active) &&
          matchesFreeSearch(entry.node, search),
      ).length;
    const list: WayOut[] = [];
    for (const token of chosen.slice(-2).reverse()) {
      const without = tokens.filter((item) => item !== token);
      const found = count(without, text);
      if (found) {
        list.push({
          key: `drop:${token}`,
          icon: <RemoveIcon aria-hidden="true" />,
          label: t`Search without ${ph({ filter: tokenName(token, quickFilters) })}`,
          count: found,
          run: () => onTokensChange(without),
        });
      }
    }
    const quiet = tokens.filter((token) => quietTokens.includes(token));
    if (quiet.length) {
      const everyType = tokens.filter((token) => !quietTokens.includes(token));
      const found = count(everyType, text);
      if (found) {
        list.push({
          key: 'every-type',
          icon: <RemoveIcon aria-hidden="true" />,
          label: t`Search every model type`,
          count: found,
          run: () => onTokensChange(everyType),
        });
      }
    }
    const kept = entries.filter((entry) => matchesActiveTokens(entry.tokens, entry.facts, tokens));
    const spelling = text ? respelled(text, kept) : undefined;
    const respelledCount = spelling ? count(tokens, spelling) : 0;
    if (spelling && respelledCount) {
      list.push({
        key: 'respell',
        icon: <SearchIcon aria-hidden="true" />,
        label: (
          <Trans>
            Search <b className="font-semibold text-foreground">{spelling}</b> instead
          </Trans>
        ),
        count: respelledCount,
        run: () => onQueryChange(query.replace(text, spelling)),
      });
    }
    if (!list.length && text) {
      list.push({
        key: 'clear',
        icon: <RemoveIcon aria-hidden="true" />,
        label: t`Clear the search`,
        count: kept.length,
        run: () => onQueryChange(query.replace(text, '').trim()),
      });
    }
    return list;
  }, [
    entries,
    tokens,
    quietTokens,
    chosen,
    text,
    query,
    quickFilters,
    onTokensChange,
    onQueryChange,
  ]);

  const highlighted = Math.min(active, Math.max(ways.length - 1, 0));

  // Focus stays in the search field (the cascader's combobox), so the arrows
  // and Enter reach these rows from there while the list is empty.
  useEffect(() => {
    const dialog = rootRef.current?.closest('[role="dialog"]');
    if (!dialog || !keyboard || !ways.length) return undefined;
    function handleKeyDown(event: Event) {
      const key = event as KeyboardEvent;
      if (key.altKey || key.ctrlKey || key.metaKey || key.shiftKey) return;
      if (!(key.target instanceof HTMLInputElement)) return;
      if (key.key === 'ArrowDown' || key.key === 'ArrowUp') {
        key.preventDefault();
        key.stopPropagation();
        const step = key.key === 'ArrowDown' ? 1 : -1;
        setActive(
          (current) => (Math.min(current, ways.length - 1) + step + ways.length) % ways.length,
        );
      } else if (key.key === 'Enter') {
        key.preventDefault();
        key.stopPropagation();
        ways[Math.min(active, ways.length - 1)]?.run();
        setActive(0);
      }
    }
    dialog.addEventListener('keydown', handleKeyDown, true);
    return () => dialog.removeEventListener('keydown', handleKeyDown, true);
  }, [keyboard, ways, active]);

  const filterNames = chosen.map((token) => tokenName(token, quickFilters));
  const searched = text || query;
  const filters = filterNames.length
    ? filterNames.map((name, index) => (
        <span key={name}>
          {index ? ', ' : ''}
          <b className="font-semibold text-foreground">{name}</b>
        </span>
      ))
    : null;
  return (
    <div className="flex min-h-0 flex-col p-1" data-slot="model-picker-no-match" ref={rootRef}>
      <p
        className="flex min-w-0 items-center gap-2 px-2 py-2 text-menu text-muted-foreground [&_svg]:size-3.5 [&_svg]:shrink-0"
        role="status"
      >
        <SearchIcon aria-hidden="true" />
        <span className="min-w-0 truncate">
          {filters ? (
            <Trans>
              No model matches <b className="font-semibold text-foreground">{searched}</b> with{' '}
              {filters}.
            </Trans>
          ) : (
            <Trans>
              No model matches <b className="font-semibold text-foreground">{searched}</b>.
            </Trans>
          )}
        </span>
      </p>
      {ways.map((way, index) => (
        <button
          className={cn(
            'flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-start text-ui text-muted-foreground outline-hidden hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset [&_svg]:size-3.5 [&_svg]:shrink-0',
            index === highlighted && 'bg-menu-highlight text-foreground',
          )}
          data-highlighted={index === highlighted || undefined}
          data-slot="model-picker-way-out"
          key={way.key}
          onClick={way.run}
          onPointerMove={() => setActive(index)}
          type="button"
        >
          {way.icon}
          <span className="min-w-0 flex-1 truncate">{way.label}</span>
          <span className="shrink-0 font-mono text-caption text-faint tabular-nums">
            {plural(way.count, { one: '# model', other: '# models' })}
          </span>
          <span className={cn('w-5 shrink-0', index !== highlighted && 'invisible')}>
            <ShortcutKeys id="menu-pick" variant="row" />
          </span>
        </button>
      ))}
    </div>
  );
}
