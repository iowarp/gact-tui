import { useEffect, useLayoutEffect, useState, type CSSProperties } from 'react';
import { create } from 'zustand';
import type { WorkbenchTab } from './workbench-shared';

/**
 * What the phone shell needs to know about the workbench's tabs: whether an App
 * tab is open (the sheet is then non-modal, so the conversation stays usable
 * beside it) and whether one is shown (the sheet then docks between the
 * conversation's header and its composer). Kept after the sheet unmounts so
 * reopening it does not flip its modality, which would remount the App's frame.
 */
export const useWorkbenchAppTabs = create<{ open: boolean; shown: boolean }>(() => ({
  open: false,
  shown: false,
}));

/** The workbench publishes its App tabs for the phone shell. */
export function usePublishWorkbenchAppTabs(
  tabs: readonly WorkbenchTab[],
  activeTab: WorkbenchTab | undefined,
): void {
  const open = tabs.some((tab) => tab.kind === 'mcp-app');
  const shown = activeTab?.kind === 'mcp-app';
  useEffect(() => {
    useWorkbenchAppTabs.setState({ open, shown });
  }, [open, shown]);
}

function measure(): CSSProperties | undefined {
  const surface = document.querySelector('[data-slot="conversation-surface"]');
  const header = surface?.firstElementChild;
  const composer = surface?.querySelector('[data-slot="clio-composer-stack"]');
  if (!header || !composer) return undefined;
  const top = Math.max(0, Math.round(header.getBoundingClientRect().bottom));
  const bottom = Math.max(0, Math.round(window.innerHeight - composer.getBoundingClientRect().top));
  return { top, bottom, height: 'auto', width: '100vw', maxWidth: 'none' };
}

/**
 * On a phone an App tab docks between the conversation's header and its
 * composer, so the person can keep typing (and close the canvas from the
 * header) while the App is shown. Returns the sheet's position, or nothing
 * when it is not docked.
 */
export function usePhoneAppDock(active: boolean): CSSProperties | undefined {
  const [dock, setDock] = useState<CSSProperties>();
  useLayoutEffect(() => {
    if (!active) return;
    let frame = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => setDock(measure()));
    };
    update();
    const surface = document.querySelector('[data-slot="conversation-surface"]');
    const observer = new ResizeObserver(update);
    if (surface) {
      observer.observe(surface);
      for (const child of [
        surface.firstElementChild,
        surface.querySelector('[data-slot="clio-composer-stack"]'),
      ])
        if (child) observer.observe(child);
    }
    window.addEventListener('resize', update);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [active]);
  return active ? dock : undefined;
}
