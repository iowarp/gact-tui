import { createContext, useContext } from 'react';

/** Keeps menus and dialogs inside a native fullscreen surface; normal pages use the overlay host. */
export const OverlayContainer = createContext<HTMLElement | undefined>(undefined);

/** Persistent portal host declared after the app root in index.html. */
export const OVERLAY_HOST_ID = 'clio-overlays';

/**
 * Portal target for menus, popovers, dialogs and tooltips. Opening one inserts
 * its portal into this host instead of <body>, so the browser restyles only the
 * host rather than every element under the app root. Pages without the host
 * (tests, fixtures) keep Radix's body default.
 */
export function useOverlayContainer(): HTMLElement | undefined {
  const container = useContext(OverlayContainer);
  if (container) return container;
  if (typeof document === 'undefined') return undefined;
  return document.getElementById(OVERLAY_HOST_ID) ?? undefined;
}

/**
 * Radix modal layers save <body> pointer-events, set it to none and restore the
 * saved value on close. Each change restyles the whole document. Starting the
 * app shell's body at none makes both writes no-ops; index.css keeps body's
 * children interactive, and ModalShield blocks the page behind modal menus,
 * selects and popovers. Dialogs and sheets block it with their overlays.
 */
export function holdModalBodyPointerEvents(body: HTMLElement = document.body): void {
  if (body.hasAttribute('data-app-shell')) body.style.pointerEvents = 'none';
}
