import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

const GROUP_HEADER = '[data-slot="provider-group-header"]';

/**
 * Tree keys for the one-column picker. The grouped list draws provider headers
 * as fold toggles, but the cascader's level keys drill (= toggle) any branch.
 * Here forward on an open group goes to its first model, back folds it, and
 * back on a model goes to its group's header.
 */
export function handleGroupLevelKey(
  event: ReactKeyboardEvent<HTMLDivElement>,
  facetsOpen: boolean,
): void {
  const field = event.target;
  if (
    facetsOpen ||
    !(field instanceof HTMLInputElement) ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey
  ) {
    return;
  }
  const rtl = getComputedStyle(field).direction === 'rtl';
  const forward = event.key === (rtl ? 'ArrowLeft' : 'ArrowRight');
  const back = event.key === (rtl ? 'ArrowRight' : 'ArrowLeft');
  if (!forward && !back) return;
  const end = field.value.length;
  if (
    forward ? field.selectionStart !== end || field.selectionEnd !== end : field.selectionEnd !== 0
  ) {
    return;
  }
  const panel = field.closest<HTMLElement>('[data-slot="cascader-panel"]');
  const row = panel?.querySelector<HTMLElement>('[role="option"][data-highlighted]');
  if (!panel || !row) return;
  const header = row.querySelector(GROUP_HEADER);
  if (!header) {
    // Back on a model goes to its group's header, as in a tree.
    if (back) stepUpToGroupHeader(event, field, panel, row);
    return;
  }
  if (header.hasAttribute('data-collapsed')) return;
  event.preventDefault();
  if (back) row.click();
  else
    field.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    );
}

/**
 * Moves the highlight from a model up to its group's header with the list's own ArrowUp, so the
 * cascader keeps one highlight. A long search group can render its header only once scrolled to,
 * so each frame steps as far as the rendered rows show, for a bounded number of frames.
 */
function stepUpToGroupHeader(
  event: ReactKeyboardEvent<HTMLDivElement>,
  field: HTMLInputElement,
  panel: HTMLElement,
  row: HTMLElement,
): void {
  const rowsAbove = (from: HTMLElement) => {
    const rows = [
      ...panel.querySelectorAll<HTMLElement>('[role="option"]:not([aria-disabled="true"])'),
    ];
    let steps = 0;
    for (let index = rows.indexOf(from) - 1; index >= 0; index -= 1) {
      steps += 1;
      if (rows[index]!.querySelector(GROUP_HEADER)) return { steps, header: true };
    }
    return { steps, header: false };
  };
  if (!rowsAbove(row).steps) return;
  event.preventDefault();
  const up = () =>
    field.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }),
    );
  let current = row;
  let frames = 0;
  const step = () => {
    const { steps, header } = rowsAbove(current);
    for (let index = 0; index < Math.max(1, steps); index += 1) up();
    if (header) return;
    requestAnimationFrame(() => {
      const next = panel.querySelector<HTMLElement>('[role="option"][data-highlighted]');
      // Stop at a header, or at the top where the highlight no longer moves.
      if (!next || next === current || next.querySelector(GROUP_HEADER) || ++frames > 30) return;
      current = next;
      step();
    });
  };
  step();
}
