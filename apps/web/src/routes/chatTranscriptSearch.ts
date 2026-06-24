/**
 * Solid controller for in-transcript text search over the message feed.
 * Exports {@link createTranscriptSearch}.
 */
import { createEffect, createMemo, createSignal, type Accessor, type Setter } from 'solid-js';
import type { Message } from '@clio/core';

export interface TranscriptSearchController {
  open: Accessor<boolean>;
  setOpen: Setter<boolean>;
  query: Accessor<string>;
  setQuery: Setter<string>;
  currentIndex: Accessor<number>;
  setCurrentIndex: Setter<number>;
  totalMatches: Accessor<number>;
  currentMatchKey: Accessor<string>;
  bumpMatch: (delta: number) => void;
  close: () => void;
}

export function createTranscriptSearch(messages: Accessor<Message[]>): TranscriptSearchController {
  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal('');
  const [currentIndex, setCurrentIndex] = createSignal(0);

  const totalMatches = createMemo(() => {
    const q = query().trim().toLowerCase();
    if (!q) return 0;
    let count = 0;
    for (const message of messages()) {
      for (const part of message.parts) {
        if (part.type === 'text' && part.text) {
          const lower = part.text.toLowerCase();
          let index = lower.indexOf(q);
          while (index !== -1) {
            count += 1;
            index = lower.indexOf(q, index + q.length);
          }
        }
      }
    }
    return count;
  });

  const currentMatchKey = createMemo<string>(() => {
    const total = totalMatches();
    if (total === 0) return '';
    const q = query().trim().toLowerCase();
    if (!q) return '';
    const target = ((currentIndex() % total) + total) % total;
    let seen = 0;
    for (const message of messages()) {
      for (const part of message.parts) {
        if (part.type === 'text' && part.text) {
          const lower = part.text.toLowerCase();
          let index = lower.indexOf(q);
          while (index !== -1) {
            if (seen === target) return `${message.id}:${seen}`;
            seen += 1;
            index = lower.indexOf(q, index + q.length);
          }
        }
      }
    }
    return '';
  });

  createEffect(() => {
    const key = currentMatchKey();
    if (!key) return;
    queueMicrotask(() => {
      const el = document.querySelector(
        `[data-match-key="${CSS.escape(key)}"]`,
      ) as HTMLElement | null;
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });

  function bumpMatch(delta: number) {
    const total = totalMatches();
    if (total === 0) return;
    setCurrentIndex((index) => (index + delta + total) % total);
  }

  function close() {
    setOpen(false);
    setQuery('');
  }

  return {
    open,
    setOpen,
    query,
    setQuery,
    currentIndex,
    setCurrentIndex,
    totalMatches,
    currentMatchKey,
    bumpMatch,
    close,
  };
}
