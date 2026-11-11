import type { KeyboardEvent } from 'react';

const FOCUSABLE =
  'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
// Keys inside these belong to the control (caret, value, its own roving focus).
const OWNS_ARROWS =
  'input,textarea,select,[contenteditable="true"],[role="radiogroup"],[role="menu"],[role="listbox"],[role="tablist"],[role="slider"],[role="spinbutton"],[role="combobox"]';

const visible = (node: HTMLElement) => node.getClientRects().length > 0;

function stops(row: HTMLElement): HTMLElement[] {
  return [...row.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (node) => visible(node) && node.closest('[data-slot="item-row"]') === row,
  );
}

/**
 * Up, Down, Home and End move between the rows of an item list, keeping the
 * same column (the second action of one row goes to the second action of the
 * next). Tab still walks every control in order.
 */
export function rowArrowKeyDown(event: KeyboardEvent<HTMLElement>) {
  const { key } = event;
  if (key !== 'ArrowDown' && key !== 'ArrowUp' && key !== 'Home' && key !== 'End') return;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const target = event.target as HTMLElement;
  if (target.closest(OWNS_ARROWS)) return;
  const row = target.closest<HTMLElement>('[data-slot="item-row"]');
  if (!row || !event.currentTarget.contains(row)) return;
  const rows = [
    ...event.currentTarget.querySelectorAll<HTMLElement>('[data-slot="item-row"]'),
  ].filter(
    (candidate) =>
      visible(candidate) && stops(candidate).length + (candidate.tabIndex >= 0 ? 1 : 0) > 0,
  );
  const from = rows.indexOf(row);
  if (from === -1) return;
  const column = target === row ? -1 : stops(row).indexOf(target);
  const to =
    key === 'Home' ? 0 : key === 'End' ? rows.length - 1 : from + (key === 'ArrowDown' ? 1 : -1);
  const next = rows[to];
  if (!next || next === row) return;
  event.preventDefault();
  const targets = stops(next);
  const focus =
    column === -1 && next.tabIndex >= 0
      ? next
      : (targets[Math.max(0, Math.min(column, targets.length - 1))] ?? next);
  focus.focus();
}
