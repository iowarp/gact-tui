import { useEffect } from 'react';
import { useShortcut } from './hooks';

/**
 * F6 and Shift F6 move between the window's regions (navigation, the
 * conversation, the workspace canvas), marked `data-keyboard-region`. Focus
 * returns to where it last was in a region, else the region's text field
 * (the composer), else its first control.
 */

const REGION = '[data-keyboard-region]';
const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

const lastFocus = new WeakMap<Element, HTMLElement>();

function shown(element: Element): boolean {
  const box = element.getBoundingClientRect();
  return box.width > 0 && box.height > 0 && !element.closest('[inert], [aria-hidden="true"]');
}

function usable(element: HTMLElement | undefined, region: Element): element is HTMLElement {
  return Boolean(element?.isConnected && region.contains(element) && shown(element));
}

function focusRegion(region: Element) {
  const remembered = lastFocus.get(region);
  const candidates = [...region.querySelectorAll<HTMLElement>(TABBABLE)].filter(
    (element) => shown(element) && element.tabIndex >= 0,
  );
  const target = usable(remembered, region)
    ? remembered
    : (candidates.find((element) => element.isContentEditable) ?? candidates[0]);
  target?.focus();
}

function step(direction: 1 | -1) {
  const regions = [...document.querySelectorAll(REGION)].filter(shown);
  if (!regions.length) return;
  const active = document.activeElement;
  const current = regions.findIndex((region) => active && region.contains(active));
  let next = (current + direction + regions.length) % regions.length;
  if (current < 0) {
    // Between regions (a resize handle) or nowhere: take the neighbour in
    // document order, wrapping round the ends.
    const anchor = active && active !== document.body ? active : undefined;
    const after = anchor
      ? regions.findIndex(
          (region) => anchor.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING,
        )
      : 0;
    const following = after < 0 ? regions.length : after;
    next =
      direction > 0
        ? following % regions.length
        : (following - 1 + regions.length) % regions.length;
  }
  focusRegion(regions[next]!);
}

export function useRegionShortcuts() {
  useEffect(() => {
    const remember = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const region = target.closest(REGION);
      if (region) lastFocus.set(region, target);
    };
    document.addEventListener('focusin', remember);
    return () => document.removeEventListener('focusin', remember);
  }, []);
  // The resize handles take F6 for their own cycling; the region move wins.
  useShortcut('next-region', () => step(1), { allowInTextField: true, overrideHandled: true });
  useShortcut('previous-region', () => step(-1), {
    allowInTextField: true,
    overrideHandled: true,
  });
}
