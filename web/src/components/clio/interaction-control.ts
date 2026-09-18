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

/** Focus a card's first real control, or the card itself when it has none. */
export function focusFirstFocusable(container: HTMLElement): void {
  const target = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ?? container;
  target.focus({ preventScroll: true });
}
