import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import { focusQuietly } from './primitives/quiet-focus';

/** What a maximized canvas covers: its workspace section, its phone sheet, or the window. */
export type MaximizeScope = 'section' | 'sheet' | 'window';

/**
 * The canvas's maximized state: what it covers, the body flag that hides
 * floating surfaces under it, and where focus lands after the change.
 *
 * Maximizing is a style change on the canvas where it is, never a move into
 * another host: moving an iframe in the DOM reloads it, and an App's view
 * would lose its state (selection, camera) on every maximize or restore.
 */
export function useWorkbenchMaximize() {
  const [maximized, setMaximized] = useState(false);
  const [scope, setScope] = useState<MaximizeScope>('window');
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
    const anchor = trigger ?? maximizeButtonRef.current;
    setScope(
      anchor?.closest('[data-slot=sheet-content]')
        ? 'sheet'
        : anchor?.closest('[data-workbench-maximize-host]')
          ? 'section'
          : 'window',
    );
    setMaximized((value) => !value);
    // Keep focus where the person was: the active tab when a tab had focus, else
    // Maximize/Restore (a control that leaves the tab row as the canvas restyles).
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
    /** Inside a workspace section the canvas covers it rather than the window. */
    scope,
  };
}

/**
 * Where a canvas maximized over its workspace section sits: fixed over the
 * section's box, measured and kept in step with resizes, so the canvas stays in
 * its place in the DOM.
 */
export function useMaximizedSectionBounds(
  canvasRef: RefObject<HTMLElement | null>,
  active: boolean,
): CSSProperties | undefined {
  const [bounds, setBounds] = useState<CSSProperties>();
  useLayoutEffect(() => {
    if (!active) return;
    const section = canvasRef.current?.closest('[data-workbench-maximize-host]');
    if (!section) return;
    let frame = 0;
    const measure = () => {
      const box = section.getBoundingClientRect();
      setBounds({ top: box.top, left: box.left, width: box.width, height: box.height });
    };
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(section);
    window.addEventListener('resize', update);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [active, canvasRef]);
  return active ? bounds : undefined;
}
