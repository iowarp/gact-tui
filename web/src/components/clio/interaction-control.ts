/** Observe a card response whose error is already retained on that card. */
export function respondFromControl(response: Promise<void>): void {
  void response.catch(() => {
    // The owning interaction card renders the retained failure in place.
  });
}

/** Stable transcript target: the pending-response tray card for one interaction. */
export function pendingInteractionDomId(interactionId: string): string {
  return `pending-interaction-${encodeURIComponent(interactionId)}`;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Focus a card's first response-relevant control.
 *
 * An A2UI card's own interactive content lives in its
 * `[data-slot="a2ui-response-viewport"]`, which sits below the card's header
 * (resize grip, fullscreen button) in DOM order — a plain "first focusable in
 * the card" search lands on that header chrome, not on anything the reader
 * can actually answer with. When that viewport is present, its own first
 * focusable control wins; every other card kind (permission, question,
 * structured/URL forms) has no such viewport and keeps the whole-card search.
 * The card itself is the last-resort fallback, same as before.
 */
export function focusFirstFocusable(container: HTMLElement): void {
  const viewport = container.querySelector<HTMLElement>('[data-slot="a2ui-response-viewport"]');
  const target =
    viewport?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ??
    container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ??
    container;
  target.focus({ preventScroll: true });
}
