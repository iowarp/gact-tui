/**
 * Modal focus trap (W3 Tier-1 a11y).
 *
 * Keyboard users must not be able to Tab out of an open modal into the
 * obscured page behind it, and closing the modal must hand focus back to
 * the element that opened it. Usage (inside a Solid component):
 *
 *   let ref: HTMLDivElement | undefined;
 *   onMount(() => {
 *     const release = trapFocus(ref!);
 *     onCleanup(release);
 *   });
 *
 * The trap is intentionally dependency-free and DOM-only so it works the
 * same in jsdom unit tests and the real WebView.
 */

import { onCleanup } from 'solid-js';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusables(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    // Skip elements hidden via the `hidden` attribute or inline
    // display:none. (Deliberately NOT offsetParent — jsdom doesn't lay
    // out, and modal content is visible by definition while open.)
    (el) => !el.hasAttribute('hidden') && el.style.display !== 'none',
  );
}

/**
 * Trap Tab/Shift+Tab inside `container` and focus its first focusable
 * element. Returns a release function that removes the listener and
 * restores focus to whatever was focused before the trap engaged.
 */
export function trapFocus(container: HTMLElement): () => void {
  const previouslyFocused =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  // Focus the first focusable child (fall back to the container itself so
  // arrow-key handlers still receive events).
  const initial = focusables(container)[0];
  if (initial) {
    initial.focus();
  } else {
    container.tabIndex = -1;
    container.focus();
  }

  const onKeydown = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const items = focusables(container);
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    // Wrap: Shift+Tab on the first element → last; Tab on the last → first.
    if (e.shiftKey && (active === first || !container.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !container.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  };

  container.addEventListener('keydown', onKeydown);

  return () => {
    container.removeEventListener('keydown', onKeydown);
    // Hand focus back to the opener (if it's still in the document).
    if (previouslyFocused && document.contains(previouslyFocused)) {
      previouslyFocused.focus();
    }
  };
}

/**
 * Solid `ref` helper: `<div role="dialog" ref={trapFocusRef}>`. Engages the
 * trap once the element has rendered (microtask) and releases it when the
 * surrounding <Show> branch is disposed (modal closes), restoring focus to
 * the opener.
 */
export function trapFocusRef(el: HTMLElement): void {
  let release: (() => void) | undefined;
  queueMicrotask(() => {
    if (document.contains(el)) release = trapFocus(el);
  });
  onCleanup(() => release?.());
}
