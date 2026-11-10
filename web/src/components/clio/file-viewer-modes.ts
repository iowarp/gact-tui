import { createContext } from 'react';
import type { FileMode } from './file-mode-controls';

/** A renderer's own representations, lifted into the frame's one segment. */
export interface RendererModes {
  modes: readonly FileMode[];
  value: string;
  onChange: (value: string) => void;
}

/**
 * The frame's mode segment. A renderer's mode control renders its tabs into
 * `host` and registers them, so the frame shows one toggle (Render, Source,
 * Lineage) and folds them into one menu when narrow.
 */
export interface FileViewerModeSlot {
  host: HTMLElement | null;
  register: (id: string, modes?: RendererModes) => void;
  /** The frame shows one of its own views (Lineage), not the renderer's. */
  frameActive: boolean;
  /** Back to the renderer, when one of its modes is chosen again. */
  showRenderer: () => void;
}

export const FileViewerModeSlotContext = createContext<FileViewerModeSlot | undefined>(undefined);

/** The renderer mode that shows the bytes as text. */
export const isSourceMode = (mode: Pick<FileMode, 'value'>) =>
  mode.value === 'source' || mode.value === 'raw';

/**
 * Switching unmounts the old body, and focus with it. Keep it in the frame,
 * on the new body's panel (or the active mode), so the key toggles back.
 */
export function keepFocusInFrame(frame: Element | null) {
  if (!frame) return;
  // A panel that only hid (the renderer stays mounted under Lineage) hides what it holds.
  const hidden = (element: Element) =>
    element.closest('[role="tabpanel"][data-state="inactive"]') !== null;
  requestAnimationFrame(() => {
    if (!frame.isConnected) return;
    const active = document.activeElement;
    if (active && frame.contains(active) && !hidden(active)) return;
    // A renderer with its own modes nests its panels (Render, Source) in the host's; focus that one.
    const nested = (panel: Element) =>
      [...panel.querySelectorAll('[role="tabpanel"][data-state="active"]')].find(
        (element) =>
          element.parentElement?.closest('[role="tabpanel"]') === panel && !hidden(element),
      ) ?? panel;
    // A hidden candidate (the modes fold away when narrow) refuses focus; try the next.
    for (const selector of [
      '[role="tabpanel"][data-state="active"]',
      '[data-slot="viewer-modes"] [data-state="active"]',
    ]) {
      const found = [...frame.querySelectorAll(selector)].find((element) => !hidden(element));
      const next = found?.getAttribute('role') === 'tabpanel' ? nested(found) : found;
      if (!(next instanceof HTMLElement)) continue;
      next.focus({ preventScroll: true });
      if (document.activeElement === next) return;
    }
  });
}
