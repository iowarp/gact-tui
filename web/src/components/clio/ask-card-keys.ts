import { createContext, type KeyboardEvent } from 'react';

/** Keyboard and paging contract shared by every ask card. */
export interface AskPager {
  index: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
}

/** The queue position the host supplies; each card shows it in its own header. */
export const AskPagerContext = createContext<AskPager | undefined>(undefined);

/** One key the card answers to: digits, letters, `Enter`, `Escape`, `[`, `]`. */
export type AskKey = string;

export function askKeyAttributes(keys: readonly AskKey[]): Record<string, string> {
  if (!keys.length) return {};
  return {
    'data-ask-keys': keys.join(' '),
    'aria-keyshortcuts': keys.join(' '),
  };
}

function eventKey(event: KeyboardEvent): string {
  if (event.key === 'Enter' || event.key === 'Escape') return event.key;
  return event.key.length === 1 ? event.key.toLowerCase() : '';
}

/** Keys work while focus is in the card; text fields keep their own typing. */
export function handleAskCardKeys(event: KeyboardEvent<HTMLElement>) {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
  const target = event.target as HTMLElement;
  if (
    target.closest(
      'input, textarea, select, [contenteditable="true"], [role="menu"], [role="listbox"], [role="dialog"]',
    )
  )
    return;
  const key = eventKey(event);
  if (!key) return;
  // A focused control answers Enter itself; ↵ picks the filled button otherwise.
  if (
    key === 'Enter' &&
    target !== event.currentTarget &&
    target.closest('button, a, [role="button"], [role="checkbox"], [role="radio"]')
  )
    return;
  const control = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(`[data-ask-keys~="${key}"]`),
  ).find(
    (element) =>
      !element.closest('[hidden]') &&
      !(element as HTMLButtonElement).disabled &&
      element.getAttribute('aria-disabled') !== 'true',
  );
  if (!control) return;
  event.preventDefault();
  event.stopPropagation();
  control.click();
  if (key !== 'Enter' && key !== 'Escape' && document.activeElement === document.body)
    control.focus({ preventScroll: true });
}
