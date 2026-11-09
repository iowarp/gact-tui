import { type Ref, type RefObject, useCallback, useLayoutEffect } from 'react';

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

/**
 * Close focus for a shielded layer. Radix runs these layers non-modal, so a
 * press on the shield counts as an outside interaction and Radix leaves focus
 * on `<body>`. Return it to the layer's trigger, as Radix's modal mode did.
 * The caller's handler runs first and can prevent this; focus that already
 * moved somewhere real (a dialog the layer opened) is left alone.
 */
export function useShieldFocusReturn(
  shielded: boolean,
  trigger: RefObject<HTMLElement | null>,
  onCloseAutoFocus: ((event: Event) => void) | undefined,
) {
  const close = useCallback(
    (event: Event) => {
      onCloseAutoFocus?.(event);
      const target = trigger.current;
      if (event.defaultPrevented || !target?.isConnected) return;
      const active = document.activeElement;
      if (active && active !== document.body) return;
      target.focus({ preventScroll: true });
    },
    [onCloseAutoFocus, trigger],
  );
  return shielded ? close : onCloseAutoFocus;
}

/** Points `trigger` at the element while also forwarding the caller's ref. */
export function useTriggerRef<T extends HTMLElement>(
  trigger: RefObject<HTMLElement | null>,
  ref: Ref<T> | undefined,
) {
  return useCallback(
    (element: T | null) => {
      trigger.current = element;
      if (typeof ref === 'function') return ref(element);
      if (ref) ref.current = element;
    },
    [trigger, ref],
  );
}
