import type { KeyboardEvent } from 'react';

/**
 * Keys shared by the Settings list rows (settings.html, Keys): Shift+F10 or the
 * Menu key opens a row's ⋯ menu, N adds to the focused list and ←/→ move across
 * a row's value cells.
 */

function editable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest('input, textarea, select, [contenteditable=""], [contenteditable=true]'))
  );
}

/**
 * A row class: its hover column stays shown while one of its menus is open, so
 * the ⋯ anchors the menu and takes focus back when it closes.
 */
export const ROW_MENU_OPEN_VISIBLE =
  '[&:has([data-slot=item-row-actions]_[aria-expanded=true])_[data-slot=item-row-actions]]:visible';

export function isRowMenuKey(event: KeyboardEvent): boolean {
  return (event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu';
}

/**
 * Opens the row's ⋯ (its last menu trigger) as the keyboard would, so the
 * first item takes focus and closing returns to the trigger.
 */
export function openRowMenu(row: HTMLElement): boolean {
  const triggers = row.querySelectorAll<HTMLElement>(
    '[data-slot=item-row-actions] [aria-haspopup=menu]',
  );
  const trigger = triggers[triggers.length - 1];
  if (!trigger || trigger.matches(':disabled')) return false;
  // The ⋯ hides again as the menu closes, before the menu can hand focus back
  // to it; when focus falls to the page or the window, the row takes it.
  const watch = new MutationObserver(() => {
    if (trigger.getAttribute('aria-expanded') === 'true') return;
    watch.disconnect();
    let frames = 12;
    const settle = () => {
      const active = document.activeElement;
      if (!row.isConnected) return;
      if (!active || active.contains(row)) row.focus();
      else if (active === trigger || !row.contains(active)) {
        if (--frames > 0) requestAnimationFrame(settle);
      }
    };
    requestAnimationFrame(settle);
  });
  watch.observe(trigger, { attributeFilter: ['aria-expanded'] });
  trigger.focus();
  trigger.dispatchEvent(
    new globalThis.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
  );
  return true;
}

/** A row's onKeyDown part: Shift+F10 on the row itself opens its ⋯ menu. */
export function handleRowMenuKey(event: KeyboardEvent<HTMLElement>): boolean {
  if (event.target !== event.currentTarget || !isRowMenuKey(event)) return false;
  if (!openRowMenu(event.currentTarget)) return false;
  event.preventDefault();
  return true;
}

/**
 * A list wrapper's onKeyDown: N, with focus on a row or one of its buttons,
 * starts a new item. Typing in a field and menus portaled from the list are left alone.
 */
export function newItemKey(onNew: (() => void) | undefined) {
  return (event: KeyboardEvent<HTMLElement>) => {
    if (!onNew || event.key.toLowerCase() !== 'n') return;
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (editable(event.target) || !(event.target instanceof Element)) return;
    if (!event.currentTarget.contains(event.target)) return;
    if (!event.target.closest('[data-slot=item-row]')) return;
    event.preventDefault();
    onNew();
  };
}

/**
 * A table row's onKeyDown: ←/→ move between its value cells (pickers), as the
 * Tools table's Permission and I/O. Cells hidden at this width are skipped.
 */
export function moveAcrossCells(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
  const target = event.target;
  if (!(target instanceof HTMLElement) || !event.currentTarget.contains(target)) return;
  const cells = [
    ...event.currentTarget.querySelectorAll<HTMLElement>('button[aria-haspopup]'),
  ].filter((cell) => cell.offsetParent !== null && !cell.matches(':disabled'));
  const index = cells.indexOf(target);
  if (index < 0) return;
  const next = cells[index + (event.key === 'ArrowRight' ? 1 : -1)];
  if (!next) return;
  event.preventDefault();
  next.focus();
}
