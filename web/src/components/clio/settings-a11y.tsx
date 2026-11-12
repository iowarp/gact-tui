import { useEffect, useRef, type ReactNode } from 'react';
import { announce } from '@/lib/announce';
import { rowArrowKeyDown } from '@/lib/row-arrow-keys';

// Loading, empty and unavailable lines mount with their words already in
// place, which screen readers skip (and loading is aria-busy). Errors already
// use role="alert", so they are left alone here.
const SPOKEN_STATES =
  '[data-slot="state-view"]:not([data-kind="error"]):not([data-kind="marker"]),[data-announce-state]';

function stateWords(node: Element): string {
  const copy = node.cloneNode(true) as Element;
  copy.querySelectorAll('button,a,[aria-hidden="true"]').forEach((child) => child.remove());
  const parts: string[] = [];
  const walker = document.createTreeWalker(copy, NodeFilter.SHOW_TEXT);
  for (let text = walker.nextNode(); text; text = walker.nextNode())
    if (text.textContent?.trim()) parts.push(text.textContent.trim());
  return sentences(parts);
}

/** Joins lines into one message, adding a full stop only where a line has none. */
function sentences(lines: string[]): string {
  return lines
    .map((line) => line.replace(/\s+/gu, ' ').trim())
    .filter(Boolean)
    .map((line) => (/[.…!?:]$/u.test(line) ? line : `${line}.`))
    .join(' ');
}

/** A state that blinks out and back (a refetch) is not read again within this time. */
const REPEAT_MS = 10_000;

/**
 * Mirrors the window's state lines (Loading access rules…, No sessions to
 * schedule work in yet) into the shared polite region as they appear. The
 * Settings window renders it once in its main region, so every section and
 * search result is covered without a copy per section.
 */
export function AnnounceStates() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const anchor = ref.current;
    const root = anchor?.closest('main') ?? anchor?.parentElement;
    if (!root || typeof MutationObserver === 'undefined') return;
    let pending: string[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const spoken = new Map<string, number>();
    const flush = () => {
      timer = undefined;
      const now = Date.now();
      const words = [...new Set(pending)].filter(
        (line) => line && now - (spoken.get(line) ?? -Infinity) > REPEAT_MS,
      );
      pending = [];
      words.forEach((line) => spoken.set(line, now));
      if (words.length) announce(sentences(words));
    };
    const collect = (node: Element) => {
      if (node.matches(SPOKEN_STATES)) pending.push(stateWords(node));
      node.querySelectorAll(SPOKEN_STATES).forEach((state) => pending.push(stateWords(state)));
      // Lines that appear together (two lists loading) are read as one message.
      if (pending.length && !timer) timer = setTimeout(flush, 150);
    };
    collect(root);
    const observer = new MutationObserver((records) => {
      for (const record of records)
        record.addedNodes.forEach((node) => {
          if (node instanceof Element) collect(node);
        });
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);
  return <span aria-hidden="true" hidden ref={ref} />;
}

/** Adds row arrow keys to the item list(s) inside, without a layout box. */
export function RowKeys({ children }: { children: ReactNode }) {
  return (
    <div className="contents" onKeyDown={rowArrowKeyDown}>
      {children}
    </div>
  );
}
