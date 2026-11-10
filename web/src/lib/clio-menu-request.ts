import { useEffect, useRef } from 'react';

const OPEN_CLIO_MENU_EVENT = 'clio:open-clio-menu';

/**
 * Asks the page to open its CLIO menu (the saved agents to switch to).
 * Returns false when no visible CLIO menu took the request.
 */
export function requestClioMenu(): boolean {
  return !window.dispatchEvent(new Event(OPEN_CLIO_MENU_EVENT, { cancelable: true }));
}

const PENDING_REQUEST_MS = 2000;
let pendingSince = 0;

/**
 * Opens the CLIO menu as soon as one mounts: on a phone it lives in the
 * closed left sheet, which the caller opens next.
 */
export function requestClioMenuOnMount(): void {
  if (!requestClioMenu()) pendingSince = performance.now();
}

/** Opens this CLIO menu when another control asks for it. */
export function useClioMenuRequest(open: () => void, enabled = true): void {
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  });
  useEffect(() => {
    if (!enabled) return;
    if (pendingSince && performance.now() - pendingSince < PENDING_REQUEST_MS) openRef.current();
    pendingSince = 0;
    const listener = (event: Event) => {
      event.preventDefault();
      openRef.current();
    };
    window.addEventListener(OPEN_CLIO_MENU_EVENT, listener);
    return () => window.removeEventListener(OPEN_CLIO_MENU_EVENT, listener);
  }, [enabled]);
}
