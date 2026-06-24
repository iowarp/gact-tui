/**
 * In-transcript find bar: query input, match navigation, and highlight wiring
 * for searching the visible conversation.
 */
import { Show, onMount } from 'solid-js';
import { Icon } from './Icon.js';
import { registerWindowKeydown } from '../domListeners.js';
import './transcript-search.css';

export interface TranscriptSearchProps {
  open: boolean;
  query: string;
  matchCount: number;
  currentIndex: number;
  onQueryChange: (q: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

/**
 * Cmd+F overlay strip pinned above the transcript pane. Drives a
 * parent-owned highlight state so the actual `<mark>` wrapping lives
 * inside the message renderer.
 */
export function TranscriptSearch(props: TranscriptSearchProps) {
  let inputRef: HTMLInputElement | undefined;

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!props.open) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        props.onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) props.onPrev();
        else props.onNext();
      }
    };
    registerWindowKeydown(onKey, true);
  });

  // Auto-focus the input each time the bar opens.
  let prevOpen = false;
  const focusEffect = () => {
    if (props.open && !prevOpen) queueMicrotask(() => inputRef?.focus());
    prevOpen = props.open;
  };

  return (
    <Show when={props.open}>
      {(() => {
        focusEffect();
        return (
          <div class="tx-search" data-testid="transcript-search">
            <Icon name="search" size={14} class="tx-search__icon" />
            <input
              ref={inputRef}
              type="text"
              class="tx-search__input"
              placeholder="Find in conversation…"
              value={props.query}
              onInput={(e) => props.onQueryChange(e.currentTarget.value)}
              data-testid="transcript-search-input"
            />
            <span class="tx-search__count" data-testid="transcript-search-count">
              {props.query ? (
                props.matchCount > 0
                  ? `${props.currentIndex + 1} / ${props.matchCount}`
                  : '0 / 0'
              ) : ''}
            </span>
            <button
              type="button"
              class="tx-search__btn"
              title="Previous match (Shift+Enter)"
              onClick={props.onPrev}
              disabled={props.matchCount === 0}
              data-testid="transcript-search-prev"
            >
              <Icon name="chevron-down" size={14} class="tx-search__btn-up" />
            </button>
            <button
              type="button"
              class="tx-search__btn"
              title="Next match (Enter)"
              onClick={props.onNext}
              disabled={props.matchCount === 0}
              data-testid="transcript-search-next"
            >
              <Icon name="chevron-down" size={14} />
            </button>
            <button
              type="button"
              class="tx-search__btn tx-search__btn--close"
              title="Close (Esc)"
              onClick={props.onClose}
              data-testid="transcript-search-close"
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        );
      })()}
    </Show>
  );
}
