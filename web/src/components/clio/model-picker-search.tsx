import { XIcon } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { CascaderInput } from '@/components/reui/cascader/cascader-nav';
import { Badge } from '@/components/reui/badge';
import { filterTokenSuggestions, type ModelFilterToken } from '@/lib/model-filter-tokens';

interface ModelPickerSearchProps {
  query: string;
  /** Replaces the free-text query (the picker owns it; the cascader reads it). */
  onQueryChange: (query: string) => void;
  tokens: readonly ModelFilterToken[];
  onTokensChange: (tokens: ModelFilterToken[]) => void;
  /** Every token the listed models carry: what completion offers. */
  availableTokens: ReadonlySet<ModelFilterToken>;
  shown: number;
  total: number;
}

/** The word being typed: the text after the last space. */
function lastWord(query: string): string {
  return query.split(/\s+/u).at(-1) ?? '';
}

/**
 * The picker's search field: the active filter tokens as removable chips,
 * then the free-text search (model name and provider), then how many models
 * the filters leave ("456 / 653"). Typing the start of a token offers the
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
}: ModelPickerSearchProps) {
  const suggestions = filterTokenSuggestions(lastWord(query), availableTokens, tokens).slice(0, 8);

  function addToken(token: ModelFilterToken) {
    if (!tokens.includes(token)) onTokensChange([...tokens, token]);
    const words = query.split(/\s+/u);
    words.pop();
    onQueryChange(words.join(' '));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
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
    <div className="flex w-full min-w-0 flex-col gap-1.5" data-slot="model-picker-search">
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
                  <XIcon aria-hidden="true" className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <CascaderInput
            aria-label="Search providers and models"
            onKeyDown={handleKeyDown}
            placeholder="Search providers and models"
          />
        </div>
        <span
          aria-label={`${shown} of ${total} models shown`}
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
    </div>
  );
}
