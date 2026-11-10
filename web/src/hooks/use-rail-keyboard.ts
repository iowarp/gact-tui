import { useEffect, type RefObject } from 'react';
import { useShortcut } from '@/lib/shortcuts/hooks';

/** A row of the left bar's lists; its value names the row across re-renders. */
const ITEM = '[data-rail-item]';
/** The row's own control: the link or disclosure button that arrows move between. */
const FOCUS = '[data-rail-focus]';
/** Where a row's menu or dialog takes focus; a row record survives a trip there. */
const POPUP =
  '[role="menu"],[role="dialog"],[role="alertdialog"],[data-radix-popper-content-wrapper]';

function railItems(region: Element): HTMLElement[] {
  return [...region.querySelectorAll<HTMLElement>(ITEM)].filter(
    (item) => item.querySelector(FOCUS) && item.getClientRects().length > 0,
  );
}

function focusItem(item: Element | null | undefined): boolean {
  const target = item?.querySelector<HTMLElement>(FOCUS);
  if (!target) return false;
  target.focus();
  return document.activeElement === target;
}

function currentItem(region: Element | null, event: KeyboardEvent): HTMLElement | null {
  const target = event.target instanceof Element ? event.target : null;
  const item = target?.closest<HTMLElement>(ITEM) ?? null;
  return item && region?.contains(item) ? item : null;
}

/**
 * The left bar's list keys, through the shortcut registry: ↑ ↓ move between
 * rows, Shift F10 (Ctrl Enter on a Mac) opens the focused row's menu. When a
 * rename, delete, move or archive takes the focused row away, focus lands on
 * the same row in its new place, else the row after it, else the one before,
 * never on the page body.
 */
export function useRailKeyboard(region: RefObject<HTMLElement | null>) {
  useShortcut(
    'menu-move',
    (event) => {
      const node = region.current;
      const item = currentItem(node, event);
      if (!node || !item) return;
      const items = railItems(node);
      const index = items.indexOf(item);
      const step = event.key === 'ArrowUp' ? -1 : 1;
      focusItem(items[Math.max(0, Math.min(items.length - 1, index + step))]);
    },
    { region, when: (event) => currentItem(region.current, event) !== null },
  );
  useShortcut(
    'focused-menu',
    (event) => {
      const trigger = currentItem(region.current, event)?.querySelector<HTMLElement>(
        '[aria-haspopup="menu"]',
      );
      if (!trigger) return;
      // The row's ⋯ opens as from the keyboard, so its first item takes focus.
      trigger.focus();
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    },
    { region, when: (event) => currentItem(region.current, event) !== null },
  );

  useEffect(() => {
    const node = region.current;
    if (!node) return undefined;
    let last: { element: HTMLElement; order: string[] } | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const remember = (item: HTMLElement) => {
      const items = railItems(node);
      const index = items.indexOf(item);
      const key = item.dataset.railItem ?? '';
      const keys = items.map((entry) => entry.dataset.railItem ?? '');
      // The row itself, then those after it, then those before, nearest first.
      last = {
        element: item,
        order: [key, ...keys.slice(index + 1), ...keys.slice(0, Math.max(index, 0)).reverse()],
      };
    };
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target && node.contains(target)) {
        const item = target.closest<HTMLElement>(ITEM);
        if (item) remember(item);
        else last = null;
        return;
      }
      if (target?.closest(POPUP)) return;
      last = null;
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target && (node.contains(target) || target.closest(POPUP))) return;
      last = null;
    };
    const restore = () => {
      if (!last) return;
      const active = document.activeElement;
      if (active && active !== document.body) return;
      const items = railItems(node);
      const byKey = new Map(items.map((item) => [item.dataset.railItem ?? '', item]));
      const order = last.order;
      last = null;
      for (const key of order) if (focusItem(byKey.get(key))) return;
      if (focusItem(items[0])) return;
      node.querySelector<HTMLElement>('a[href],button:not([disabled])')?.focus();
    };
    // Rows leave or move in the list, inline editors and dialogs close, as DOM
    // changes; once they settle, a focus that fell to the body comes back.
    const observer = new MutationObserver(() => {
      if (!last) return;
      clearTimeout(timer);
      timer = setTimeout(restore, 30);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [region]);
}
