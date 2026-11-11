/**
 * One polite live region for status words that have no visible region of
 * their own (a save that only removes the save bar, a loading state that
 * mounts with its text already in place). Created on first use.
 */
let region: HTMLElement | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

function liveRegion(): HTMLElement {
  if (region?.isConnected) return region;
  region = document.createElement('div');
  region.setAttribute('role', 'status');
  region.setAttribute('aria-live', 'polite');
  region.setAttribute('aria-atomic', 'true');
  region.dataset.slot = 'polite-announcer';
  region.className = 'sr-only';
  document.body.append(region);
  return region;
}

/**
 * Speak `message` politely. The region is cleared first so a repeated message
 * is read again. Pass a longer `delay` from a dialog's action: a closing modal
 * keeps `aria-hidden` on the rest of the page until its exit animation ends.
 */
export function announce(message: string, delay = 120): void {
  if (typeof document === 'undefined' || !message) return;
  const node = liveRegion();
  node.textContent = '';
  clearTimeout(timer);
  timer = setTimeout(() => {
    node.textContent = message;
  }, delay);
}

/** Delay for messages sent as a modal dialog closes. */
export const AFTER_DIALOG = 400;
