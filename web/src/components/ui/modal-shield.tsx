import { useLayoutEffect } from 'react';

/**
 * Transparent cover in the overlay host just below a modal menu, select or
 * popover. It replaces Radix's body pointer-events lock (see
 * holdModalBodyPointerEvents): an outside press lands here, dismisses the layer
 * and never reaches the page control underneath. Layers stack at 110, dialogs
 * at 100, so the shield also covers a dialog that opened the layer.
 *
 * Mounted as a plain DOM node, outside the React tree. A React child of the
 * layer would count as a descendant of whatever rendered the layer, so moving
 * from that component onto the shield would never fire its `onPointerLeave`:
 * a hover preview (the collapsed sidebar) would stay open behind the menu.
 * The body lock sent the pointer to `<html>`, which React sees as outside.
 */
export function ModalShield({ container }: { container?: HTMLElement | null }) {
  useLayoutEffect(() => {
    const shield = document.createElement('div');
    shield.setAttribute('aria-hidden', 'true');
    shield.dataset.slot = 'modal-shield';
    shield.className = 'pointer-events-auto fixed inset-0 z-105';
    (container ?? document.body).append(shield);
    return () => shield.remove();
  }, [container]);
  return null;
}
