import { RemoveIcon } from '@/lib/icon-vocabulary';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { CascaderInput } from '@/components/reui/cascader/cascader-nav';
import { Badge } from '@/components/reui/badge';
import type { FacetChip, FacetTab } from '@/lib/model-facets';
import { filterTokenSuggestions, type ModelFilterToken } from '@/lib/model-filter-tokens';
import { ModelPickerFacetPanel } from './model-picker-facet-panel';

interface ModelPickerSearchProps {
  query: string;
  /** Replaces the free-text query (the picker owns it; the cascader reads it). */
  onQueryChange: (query: string) => void;
  tokens: readonly ModelFilterToken[];
  onTokensChange: (tokens: ModelFilterToken[]) => void;
  /** Every token the listed models carry: what completion offers. */
  availableTokens: ReadonlySet<ModelFilterToken>;
  /** Models matching the search text AND every token, of `total`. */
  shown: number;
  total: number;
  /** The filter panel's tabs (chips from the listed models' own tags). */
  facetTabs: readonly FacetTab[];
  /** Whether the filter panel is open (the picker owns it: Escape closes it first). */
  facetsOpen: boolean;
  onFacetsOpenChange: (open: boolean) => void;
}

/** The word being typed: the text after the last space. */
function lastWord(query: string): string {
  return query.split(/\s+/u).at(-1) ?? '';
}

/**
 * The picker's search field: the active filter tokens as removable chips,
 * then the free-text search (model name and provider), then how many models
 * match the text AND the tokens, of every listed model ("12 / 469"). Pressing
 * the field opens the filter panel under it. Typing the start of a token offers the
 * tokens that exist; a finished token followed by a space becomes a chip;
 * Backspace in an empty field removes the last chip.
 */
export function ModelPickerSearch({
  query,
  onQueryChange,
  tokens,
  onTokensChange,
  availableTokens,
  shown,
  total,
  facetTabs,
  facetsOpen,
  onFacetsOpenChange,
}: ModelPickerSearchProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const suggestions = filterTokenSuggestions(lastWord(query), availableTokens, tokens).slice(0, 8);

  function addToken(token: ModelFilterToken) {
    if (!tokens.includes(token)) onTokensChange([...tokens, token]);
    const words = query.split(/\s+/u);
    words.pop();
    onQueryChange(words.join(' '));
  }

  /** A chip press: off when on; otherwise on, swapping out any default token it replaces. */
  function toggleChip(chip: FacetChip) {
    if (tokens.includes(chip.token)) {
      onTokensChange(tokens.filter((item) => item !== chip.token));
      return;
    }
    onTokensChange([...tokens.filter((item) => !chip.replaces.includes(item)), chip.token]);
  }

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
    if (facetsOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter')) {
      onFacetsOpenChange(false);
    }
    if (event.key === 'Backspace' && !query && tokens.length) {
      onTokensChange(tokens.slice(0, -1));
      return;
    }
    if (event.key === ' ') {
      const word = lastWord(query).toLowerCase();
      if (availableTokens.has(word) || word === 'free') {
        event.preventDefault();
        addToken(word);
      }
    }
  }

  return (
    <div className="relative flex w-full min-w-0 flex-col gap-1.5" data-slot="model-picker-search" ref={rootRef}>
      <div className="flex w-full min-w-0 items-center gap-1">
        {tokens.length ? (
          <div className="flex shrink-0 flex-wrap items-center gap-1" data-slot="filter-tokens">
            {tokens.map((token) => (
              <Badge
                className="gap-0.5 pe-0.5 font-mono font-normal"
                data-token={token}
                key={token}
                radius="full"
                size="lg"
                variant="primary-light"
              >
                {token}
                <button
                  aria-label={`Remove ${token}`}
                  className="inline-flex size-4 items-center justify-center rounded-full outline-none hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring/50"
                  onClick={() => onTokensChange(tokens.filter((item) => item !== token))}
                  type="button"
                >
                  <RemoveIcon aria-hidden="true" className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <CascaderInput
            aria-label="Search providers and models"
            onKeyDown={handleKeyDown}
            onPointerDown={() => onFacetsOpenChange(true)}
            placeholder="Search providers and models"
          />
        </div>
        <span
          aria-label={`${shown} of ${total} models match`}
          className="shrink-0 px-1 text-xs text-muted-foreground tabular-nums"
          data-slot="model-count"
        >
          {shown} / {total}
        </span>
      </div>
      {suggestions.length ? (
        <div className="flex flex-wrap items-center gap-1 px-1 pb-1" data-slot="filter-token-suggestions">
          {suggestions.map((token) => (
            <Badge asChild key={token} radius="full" size="lg" variant="outline">
              <button
                className="cursor-pointer font-mono font-normal hover:bg-accent"
                onClick={() => addToken(token)}
                type="button"
              >
                {token}
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
      {facetsOpen ? <ModelPickerFacetPanel onToggleChip={toggleChip} tabs={facetTabs} /> : null}
    </div>
  );
}
