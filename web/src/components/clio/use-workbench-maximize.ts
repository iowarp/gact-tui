import { useEffect, useRef, useState } from 'react';
import { useOverlayContainer } from '@/components/ui/overlay-container';
import { focusQuietly } from './primitives/quiet-focus';

/**
 * The canvas's maximized state: where it maximizes to, the body flag that hides
 * floating surfaces under it, and where focus lands after it remounts.
 */
export function useWorkbenchMaximize() {
  const [maximized, setMaximized] = useState(false);
  const [maximizeHost, setMaximizeHost] = useState<Element | null>(null);
  // A bare host (no sheet, no workspace section) maximizes into the overlay
  // host, never <body>: a body child restyles the whole app root.
  const overlayHost = useOverlayContainer();
  const maximizeButtonRef = useRef<HTMLButtonElement>(null);

  // Floating surfaces over the conversation (the rail) hide under a maximized
  // canvas. A body attribute, unlike `body:has(...)`, does not make every DOM
  // mutation re-check and restyle the whole document.
  useEffect(() => {
    if (!maximized) return;
    document.body.setAttribute('data-canvas-maximized', '');
    return () => document.body.removeAttribute('data-canvas-maximized');
  }, [maximized]);

  const toggleMaximized = (trigger?: Element | null) => {
    // Maximize covers the conversation only: the left bar stays, and the
    // strip comes along inside the canvas.
    setMaximizeHost(
      trigger?.closest('[data-slot=sheet-content]') ??
        trigger?.closest('[data-workbench-maximize-host]') ??
        overlayHost ??
        document.body,
    );
    setMaximized((value) => !value);
    // The canvas remounts in its new host, so a focused control inside it is gone:
    // return to the active tab when a tab had focus, else to Maximize/Restore.
    const fromTab = document.activeElement?.closest('[data-slot=canvas-tab-row] [role=tab]');
    requestAnimationFrame(() => {
      if (document.activeElement && document.activeElement !== document.body) return;
      let canvas = maximizeButtonRef.current?.parentElement;
      while (canvas && !canvas.querySelector('[data-slot=canvas-tab-row]')) {
        canvas = canvas.parentElement;
      }
      const activeTab = canvas?.querySelector<HTMLElement>(
        '[data-slot=canvas-tab-row] [role=tab][aria-selected=true]',
      );
      focusQuietly(fromTab && activeTab ? activeTab : maximizeButtonRef.current);
    });
  };

  /** Escape on the maximized canvas restores it and returns focus to Maximize. */
  const restore = () => {
    setMaximized(false);
    requestAnimationFrame(() => focusQuietly(maximizeButtonRef.current));
  };

  return {
    maximized,
    setMaximized,
    toggleMaximized,
    restore,
    maximizeButtonRef,
    /** The element the maximized canvas portals into. */
    portalHost: maximizeHost ?? overlayHost ?? document.body,
    /** Inside a workspace section the canvas fills it rather than the window. */
    inSection: maximizeHost?.hasAttribute('data-workbench-maximize-host') ?? false,
  };
}
