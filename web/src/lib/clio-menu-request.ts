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

/**
 * Opens this CLIO menu when another control asks for it. `enabled` may be a
 * check made at request time, so a covered menu lets the request fall through.
 */
export function useClioMenuRequest(
  open: () => void,
  enabled: boolean | (() => boolean) = true,
): void {
  const openRef = useRef(open);
  const enabledRef = useRef(enabled);
  useEffect(() => {
    openRef.current = open;
    enabledRef.current = enabled;
  });
  const listening = enabled !== false;
  useEffect(() => {
    if (!listening) return;
    const takes = () => {
      const current = enabledRef.current;
      return typeof current === 'function' ? current() : current;
    };
    if (pendingSince && performance.now() - pendingSince < PENDING_REQUEST_MS) {
      if (takes()) {
        pendingSince = 0;
        openRef.current();
      }
    } else pendingSince = 0;
    const listener = (event: Event) => {
      if (!takes()) return;
      event.preventDefault();
      openRef.current();
    };
    window.addEventListener(OPEN_CLIO_MENU_EVENT, listener);
    return () => window.removeEventListener(OPEN_CLIO_MENU_EVENT, listener);
  }, [listening]);
}
