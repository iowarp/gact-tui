import { useCallback, type Ref } from 'react';

const MODIFIERS = new Set(['Control', 'Meta', 'Shift', 'Alt']);
let keyboard = false;

if (typeof window !== 'undefined') {
  window.addEventListener(
    'keydown',
    (event) => {
      if (!MODIFIERS.has(event.key)) keyboard = true;
    },
    true,
  );
  window.addEventListener(
    'pointerdown',
    () => {
      keyboard = false;
    },
    true,
  );
}

/**
 * A menu content's ref that marks how the menu opened (`data-opened-by`), so a
 * menu opened with the mouse can leave out the jump letters a keyboard needs.
 */
export function useOpenedByRef<T extends HTMLElement>(ref?: Ref<T>) {
  return useCallback(
    (node: T | null) => {
      if (node) node.dataset.openedBy = keyboard ? 'keyboard' : 'pointer';
      forwardRef(ref, node);
    },
    [ref],
  );
}

function forwardRef<T>(ref: Ref<T> | undefined, node: T | null) {
  if (typeof ref === 'function') ref(node);
  else if (ref) (ref as { current: T | null }).current = node;
}
