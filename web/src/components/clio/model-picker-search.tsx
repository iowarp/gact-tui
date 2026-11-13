import { ChevronDownIcon, SearchIcon } from 'lucide-react';
import { AdjustIcon } from '@/lib/icon-vocabulary';
import { TooltipProvider } from '@/components/ui/tooltip';
import { NamedTooltip } from './primitives/icon-button';
import { isQuickFilterToken, quickFilters, toggleQuickFilter } from '@/lib/model-quick-filters';
import { useCallback, useEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import { CascaderInput } from '@/components/reui/cascader/cascader-nav';
import type { FacetChip, FacetTab } from '@/lib/model-facets';
import { cn } from '@/lib/utils';
import {
  addModelFilterToken,
  filterTokenSuggestions,
  type ModelFilterToken,
} from '@/lib/model-filter-tokens';
import { isRangeModifier, isRangeToken } from '@/lib/model-range-tokens';
import { ModelPickerAnchors, ModelPickerFieldTokens } from './model-picker-anchors';
import { ModelPickerFacetPanel, type FacetPanelHandle } from './model-picker-facet-panel';
import { rangeFilterSections } from './model-picker-filter-ranges';
import { ModelPickerQuickStrip } from './model-picker-quick-strip';
import { identifierInputProps } from '@/lib/identifier-input';
import { t, ph } from '@lingui/core/macro';

interface ModelPickerSearchProps {
  query: string;
  /** Replaces the free-text query (the picker owns it; the cascader reads it). */
  onQueryChange: (query: string) => void;
  tokens: readonly ModelFilterToken[];
  /**
   * Tokens on by default that row 2 does not draw (`input:text`,
   * `output:text`): the Filters panel shows and changes them, Backspace
   * leaves them, and the Filters count leaves them out.
   */
  quietTokens?: readonly ModelFilterToken[];
  onTokensChange: (tokens: ModelFilterToken[]) => void;
  /** Every token the listed models carry: what completion offers. */
  availableTokens: ReadonlySet<ModelFilterToken>;
  /** Models matching the search text AND every token, of `total`. */
  shown: number;
  total: number;
  /** Remote discovery counts loaded rows rather than a complete Hub inventory. */
  countScope?: 'loaded';
  /** The filter panel's tabs (chips from the listed models' own tags). */
  facetTabs: readonly FacetTab[];
  /** Whether the filter panel is open (the picker owns it: Escape closes it first). */
  facetsOpen: boolean;
  onFacetsOpenChange: (open: boolean) => void;
  /** The highest input price the listed models state (the Cost slider's top). */
  maxInputPrice?: number;
  /** Whether any listed model states its size: the Size chip and slider show only then. */
  sizes?: boolean;
  /** Downloads share the picker search without claiming serving capabilities or prices. */
  label?: string;
  inputId?: string;
  /** Repository searches run remotely on submission rather than filtering a loaded catalog. */
  onSearch?: () => void;
  /**
   * The narrowest picker (under 400px): row 2 folds into the Filters button
   * and shows above the filter panel while it is open.
   */
  compact?: boolean;
  /** One column: the count is the matches alone ("6"), as each group states its own. */
  single?: boolean;
  /** Spec `.c3btns`: Task, Organization and Capabilities anchors under the field (Find a model). */
  anchors?: boolean;
  /** Results are loading: the anchors say so instead of offering no choices. */
  searching?: boolean;
}

/** The word being typed: the text after the last space. */
function lastWord(query: string): string {
  return query.split(/\s+/u).at(-1) ?? '';
}

/** The count's spoken label, one whole message per wording. */
function countLabel(
  shown: number,
  total: number,
  { totalOnly, single, loaded }: { totalOnly: boolean; single: boolean; loaded: boolean },
): string {
  if (!totalOnly) {
    return loaded
      ? t`${shown} of ${total} loaded results match`
      : t`${shown} of ${total} models match`;
  }
  if (loaded) return single ? t`${shown} loaded results match` : t`${shown} loaded results`;
  return single ? t`${shown} models match` : t`${shown} models`;
}

/**
 * The picker's two search rows. Row 1: the free-text search (model name and
 * provider), how many models match the text AND the filters of every listed
 * model ("12 / 469"), and the Filters button with how many filters are on.
 * Row 2: the quick filters as icons, then any other filter that is on. Pressing
 * the field opens the filter panel under it. Typing the start of a token offers
 * the tokens that exist; a finished token followed by a space turns it on;
 * Backspace in an empty field drops the last one.
 */
export function ModelPickerSearch({
  query,
  onQueryChange,
  tokens,
  quietTokens = [],
  onTokensChange,
  availableTokens,
  shown,
  total,
  countScope,
  facetTabs,
  facetsOpen,
  onFacetsOpenChange,
  maxInputPrice,
  sizes = false,
  label = t`Search providers and models`,
  inputId,
  onSearch,
  compact = false,
  single = false,
  anchors = false,
  searching = false,
}: ModelPickerSearchProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<FacetPanelHandle>(null);
  // Nothing narrowed out: the total alone ("3"), as the spec's count reads; "2 / 3" once something is.
  const totalOnly = single || shown === total;
  const suggestions = filterTokenSuggestions(lastWord(query), availableTokens, tokens).slice(0, 8);
  const chosen = tokens.filter((token) => !quietTokens.includes(token));
  const strip = quickFilters(facetTabs, tokens, maxInputPrice !== undefined, sizes);
  const extraTokens = chosen.filter((token) => !isQuickFilterToken(token, strip));
  // With the spec anchors, the filters that are on read as named tokens inside the field.
  const fieldTokens = anchors && onSearch ? extraTokens : [];
  const rowTokens = fieldTokens.length ? [] : extraTokens;
  const hasFilters = facetTabs.some((tab) => tab.chipCount > 0) || (compact && strip.length > 0);
  const rowTwo =
    (strip.length || rowTokens.length || suggestions.length) &&
    (!compact || facetsOpen || suggestions.length);

  function addToken(token: ModelFilterToken) {
    onTokensChange(addModelFilterToken(tokens, token));
    const words = query.split(/\s+/u);
    words.pop();
    onQueryChange(words.join(' '));
  }

  /** A chip press: off when on; otherwise on, swapping out any default token it replaces. */
  const toggleChip = useCallback(
    (chip: FacetChip) => {
      if (tokens.includes(chip.token)) {
        onTokensChange(tokens.filter((item) => item !== chip.token));
        return;
      }
      onTokensChange([...tokens.filter((item) => !chip.replaces.includes(item)), chip.token]);
    },
    [tokens, onTokensChange],
  );
  const removeToken = useCallback(
    (token: string) => onTokensChange(tokens.filter((item) => item !== token)),
    [tokens, onTokensChange],
  );
  const closeFacets = useCallback(() => onFacetsOpenChange(false), [onFacetsOpenChange]);
  // The anchors and the open panel depend on the filters, not the typed query,
  // so they keep their render between keys.
  const anchorRow = useMemo(
    () =>
      anchors ? (
        <div className="pt-2">
          <ModelPickerAnchors
            onRemoveToken={removeToken}
            onToggleChip={toggleChip}
            searching={searching}
            tabs={facetTabs}
            tokens={tokens}
          />
        </div>
      ) : null,
    [anchors, removeToken, toggleChip, searching, facetTabs, tokens],
  );
  const facetPanel = useMemo(
    () =>
      facetsOpen ? (
        <ModelPickerFacetPanel
          onClose={closeFacets}
          onToggleChip={toggleChip}
          ranges={
            maxInputPrice === undefined
              ? undefined
              : rangeFilterSections({ tokens, onTokensChange, maxInputPrice, sizes })
          }
          ref={panelRef}
          tabs={facetTabs}
        />
      ) : null,
    [facetsOpen, closeFacets, toggleChip, maxInputPrice, tokens, onTokensChange, sizes, facetTabs],
  );

  // A press anywhere outside the field and the panel closes the panel.
  useEffect(() => {
    if (!facetsOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      onFacetsOpenChange(false);
    }
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [facetsOpen, onFacetsOpenChange]);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // The picker's own highlight seed presses arrows; those are not the person's.
    if (event.currentTarget.dataset.seeding !== undefined) return;
    // The open panel moves and toggles its own rows; the list behind it stays put.
    if (facetsOpen && panelRef.current?.keyDown(event)) {
      event.preventDefault();
      (
        event as KeyboardEvent<HTMLInputElement> & { preventBaseUIHandler?: () => void }
      ).preventBaseUIHandler?.();
      return;
    }
    if (event.key === 'Enter' && onSearch) {
      event.preventDefault();
      onFacetsOpenChange(false);
      onSearch();
      return;
    }
    // Alt+ArrowDown (the combobox key for "show the choices") opens the panel
    // from the keyboard, as a press on the field does with a pointer. Focus
    // alone never opens it: the dialog focuses the field as it opens, and the
    // list hands focus back to it after every row press.
    if (event.key === 'ArrowDown' && event.altKey) {
      event.preventDefault();
      onFacetsOpenChange(true);
      return;
    }
    // Moving through the results (or picking one) is done with the list in view.
    if (
      facetsOpen &&
      (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter')
    ) {
      onFacetsOpenChange(false);
    }
    if (event.key === 'Backspace' && !query && chosen.length) {
      const last = chosen.at(-1);
      onTokensChange(tokens.filter((token) => token !== last));
      return;
    }
    if (event.key === ' ') {
      const typed = lastWord(query);
      const word = typed.toLowerCase();
      if (isRangeToken(word)) {
        // A range keeps its units as typed (size:>32B stays upper case).
        event.preventDefault();
        addToken(typed.replace(/^[^:]+/u, (key) => key.toLowerCase()));
      } else if (availableTokens.has(word) || word === 'free' || isRangeModifier(word)) {
        event.preventDefault();
        addToken(word);
      }
    }
  }

  return (
    <div
      className="@container/picker-search relative flex w-full min-w-0 flex-col"
      data-slot="model-picker-search"
      data-tokens={tokens.join(' ')}
      ref={rootRef}
    >
      <div
        className={cn(
          'flex h-10 w-full min-w-0 items-center gap-1.5 ps-3 pe-2',
          // Spec `.c3in`: the Hub search is a 30px field.
          onSearch &&
            'h-[30px] rounded-[7px] border border-input bg-input/30 ps-2.5 pe-1 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20',
        )}
      >
        <SearchIcon
          aria-hidden="true"
          className={cn('shrink-0 text-muted-foreground', onSearch ? 'size-3.5' : 'size-[15px]')}
        />
        <div className={cn('min-w-0 flex-1', onSearch && 'flex items-center gap-1')}>
          {fieldTokens.length ? (
            <ModelPickerFieldTokens
              onRemoveToken={(token) => onTokensChange(tokens.filter((item) => item !== token))}
              tabs={facetTabs}
              tokens={fieldTokens}
            />
          ) : null}
          {onSearch ? (
            <input
              {...identifierInputProps}
              id={inputId}
              aria-label={label}
              className="h-7 w-full min-w-[2.5rem] flex-1 bg-transparent text-menu outline-hidden placeholder:text-faint"
              placeholder={label}
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={handleKeyDown}
              onPointerDown={() => onFacetsOpenChange(facetTabs.some((tab) => tab.chipCount > 0))}
            />
          ) : (
            <CascaderInput
              aria-label={label}
              className="px-0 text-ui placeholder:text-faint"
              onKeyDown={handleKeyDown}
              onPointerDown={() => onFacetsOpenChange(true)}
              placeholder={label}
            />
          )}
        </div>
        <span
          aria-label={countLabel(shown, total, {
            totalOnly,
            single,
            loaded: countScope === 'loaded',
          })}
          className="ms-1 shrink-0 font-mono text-caption whitespace-nowrap text-muted-foreground tabular-nums"
          data-slot="model-count"
        >
          {shown}
          {totalOnly ? '' : ` / ${total}`}
          {countScope === 'loaded' ? ' loaded' : ''}
        </span>
        {hasFilters ? (
          <>
            <span aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-border" />
            <TooltipProvider disableHoverableContent>
              <NamedTooltip label={t`Filters`} shortcut="menu-filters">
                <button
                  aria-expanded={facetsOpen}
                  aria-label={
                    chosen.length ? t`Filters, ${ph({ count: chosen.length })} on` : t`Filters`
                  }
                  className={cn(
                    'group/filters relative inline-flex h-[26px] shrink-0 items-center rounded-[6px] text-muted-foreground outline-none hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50',
                    facetsOpen &&
                      'bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                  data-slot="model-filters-button"
                  // The panel answers keys through the search field, so a press
                  // leaves focus there and a key press on the button returns it.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onFacetsOpenChange(!facetsOpen);
                    rootRef.current
                      ?.querySelector<HTMLInputElement>('input')
                      ?.focus({ preventScroll: true });
                  }}
                  type="button"
                >
                  <span className="grid w-6 place-items-center">
                    <AdjustIcon aria-hidden="true" className="size-[15px]" />
                  </span>
                  <span
                    className={cn(
                      'grid w-[13px] place-items-center',
                      !facetsOpen && 'text-faint group-hover/filters:text-foreground',
                    )}
                  >
                    <ChevronDownIcon aria-hidden="true" className="size-[11px]" />
                  </span>
                  {chosen.length ? (
                    <span
                      aria-hidden="true"
                      className="absolute -top-[3px] -right-[3px] rounded-[6px] bg-primary px-[3px] text-[0.53125rem] leading-3 font-semibold text-primary-foreground tabular-nums"
                    >
                      {chosen.length}
                    </span>
                  ) : null}
                </button>
              </NamedTooltip>
            </TooltipProvider>
          </>
        ) : null}
      </div>
      {anchorRow}
      {rowTwo ? (
        <ModelPickerQuickStrip
          extraTokens={rowTokens}
          filters={strip}
          onRemoveToken={(token) => onTokensChange(tokens.filter((item) => item !== token))}
          onSuggestion={addToken}
          onToggle={(filter) => onTokensChange(toggleQuickFilter(tokens, filter))}
          suggestions={suggestions}
        />
      ) : null}
      {facetPanel}
    </div>
  );
}
