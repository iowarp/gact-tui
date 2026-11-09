import { useEffect, useRef } from 'react';

const OPEN_CLIO_MENU_EVENT = 'clio:open-clio-menu';

/**
 * Asks the page to open its CLIO menu (the saved agents to switch to).
 * Returns false when no visible CLIO menu took the request.
 */
export function requestClioMenu(): boolean {
  return !window.dispatchEvent(new Event(OPEN_CLIO_MENU_EVENT, { cancelable: true }));
}

/** Opens this CLIO menu when another control asks for it. */
export function useClioMenuRequest(open: () => void, enabled = true): void {
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  });
  useEffect(() => {
    if (!enabled) return;
    const listener = (event: Event) => {
      event.preventDefault();
      openRef.current();
    };
    window.addEventListener(OPEN_CLIO_MENU_EVENT, listener);
    return () => window.removeEventListener(OPEN_CLIO_MENU_EVENT, listener);
  }, [enabled]);
}
