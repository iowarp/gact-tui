import * as React from 'react';

const MODAL =
  '[data-slot="dialog-content"], [data-slot="alert-dialog-content"], [data-slot="sheet-content"]';
const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [contenteditable="true"], [tabindex]';

function tabbable(element: HTMLElement): boolean {
  if (element.tabIndex < 0) return false;
  const box = element.getBoundingClientRect();
  return box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== 'hidden';
}

/**
 * On macOS, Option Tab moves through every control when keyboard navigation is
 * off, the Safari and WKWebView default. Radix's focus trap only wraps a plain
 * Tab, so Option Tab stuck on a modal's last (or, backwards, first) control.
 * This wraps it the same way.
 */
export function wrapOptionTabInModals(target: Window = window): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Tab' || !event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.defaultPrevented) return;
    const active = document.activeElement;
    const modal = active instanceof HTMLElement ? active.closest<HTMLElement>(MODAL) : null;
    if (!modal) return;
    const controls = [...modal.querySelectorAll<HTMLElement>(TABBABLE)].filter(tabbable);
    const first = controls[0];
    const last = controls.at(-1);
    const edge = event.shiftKey ? first : last;
    if (!edge || (active !== edge && !(active === modal && event.shiftKey))) return;
    event.preventDefault();
    (event.shiftKey ? last : first)?.focus();
  };
  target.addEventListener('keydown', onKeyDown);
  return () => target.removeEventListener('keydown', onKeyDown);
}

const openModals = new Set<HTMLElement>();
const modalListeners = new Set<() => void>();

function setModalOpen(node: HTMLElement, open: boolean) {
  if (open) openModals.add(node);
  else openModals.delete(node);
  modalListeners.forEach((listener) => listener());
}

/** Whether an open dialog, sheet or menu sits above this element. */
export function isBehindModal(element: Element | null): boolean {
  if (!element) return false;
  for (const modal of openModals) if (!modal.contains(element)) return true;
  const menu = document.querySelector('[role="menu"][data-state="open"]');
  return Boolean(menu && !menu.contains(element));
}

/** Calls the listener when a dialog or sheet opens or closes. */
export function subscribeToModals(listener: () => void): () => void {
  modalListeners.add(listener);
  return () => modalListeners.delete(listener);
}

let lastBlurred: HTMLElement | null = null;
if (typeof document !== 'undefined') {
  document.addEventListener(
    'focusout',
    (event) => {
      if (event.target instanceof HTMLElement) lastBlurred = event.target;
    },
    true,
  );
}

/**
 * Radix modal content returns focus only to its `Dialog.Trigger`. The palette,
 * shortcuts, settings and other dialogs opened by a shortcut or a controlled
 * `open` have none, so closing them dropped focus on the page. This returns
 * focus to whatever had it when the dialog opened, while that is still on the
 * page; a consumer's own `onCloseAutoFocus` that prevents default still wins.
 */
export function useModalFocusReturn<T extends HTMLElement>({
  ref,
  onCloseAutoFocus,
}: {
  ref?: React.Ref<T>;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const opener = React.useRef<HTMLElement | null>(null);
  const attached = React.useRef<{ node: T; cleanup?: () => void } | null>(null);
  return {
    // Record the opener as the content attaches: some dialogs focus their own field in an
    // effect, before Radix's open-auto-focus event; then the element that just lost focus opened it.
    ref: React.useCallback(
      (node: T | null) => {
        if (!node) {
          const previous = attached.current;
          attached.current = null;
          if (previous) setModalOpen(previous.node, false);
          if (previous?.cleanup) previous.cleanup();
          else if (typeof ref === 'function') ref(null);
          else if (ref) ref.current = null;
          return;
        }
        const active = document.activeElement;
        let candidate = active && node.contains(active) ? lastBlurred : active;
        // A menu item that opened the dialog is about to unmount: return to the
        // trigger of its outermost menu (a submenu is labelled by its sub-trigger).
        let menu = candidate instanceof Element ? candidate.closest('[role=menu]') : null;
        while (menu) {
          const trigger = document.getElementById(menu.getAttribute('aria-labelledby') ?? '');
          if (!trigger) break;
          candidate = trigger;
          menu = trigger.closest('[role=menu]');
        }
        if (
          candidate instanceof HTMLElement &&
          candidate !== document.body &&
          !node.contains(candidate)
        ) {
          opener.current = candidate;
        }
        let cleanup: (() => void) | undefined;
        if (typeof ref === 'function') cleanup = ref(node) ?? undefined;
        else if (ref) ref.current = node;
        attached.current = { node, cleanup };
        setModalOpen(node, true);
      },
      [ref],
    ),
    onCloseAutoFocus: React.useCallback(
      (event: Event) => {
        onCloseAutoFocus?.(event);
        const target = opener.current;
        opener.current = null;
        if (event.defaultPrevented || !target?.isConnected) return;
        event.preventDefault();
        target.focus({ preventScroll: true });
      },
      [onCloseAutoFocus],
    ),
  };
}
