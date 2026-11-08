/**
 * Transparent cover rendered in the overlay host just below a modal menu,
 * select or popover. It replaces Radix's body pointer-events lock (see
 * holdModalBodyPointerEvents): an outside press lands here, dismisses the layer
 * and never reaches the page control underneath. Layers stack at 110, dialogs
 * at 100, so the shield also covers a dialog that opened the layer.
 */
export function ModalShield() {
  return (
    <div aria-hidden className="pointer-events-auto fixed inset-0 z-105" data-slot="modal-shield" />
  );
}
