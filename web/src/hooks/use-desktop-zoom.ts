import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { inTauri } from '@/lib/transport/tauri-runtime';
import {
  applyZoom,
  automaticZoom,
  saveZoom,
  savedZoom,
  screenWidth,
  stepZoom,
} from '@/tauri/desktop-zoom';

/** Wheel travel (px) that counts as one zoom step, so a trackpad pinch doesn't race. */
const WHEEL_STEP_DELTA = 50;

export interface DesktopZoom {
  /** The current zoom factor (1 = 100%). */
  zoom: number;
  zoomIn: () => void;
  zoomOut: () => void;
  /** Forget the user's choice and return to the screen-based level. */
  resetZoom: () => void;
}

function announce(level: number): void {
  toast(`Zoom ${Math.round(level * 100)}%`, { id: 'desktop-zoom', duration: 1200 });
}

/**
 * Desktop window zoom: Ctrl/Cmd + mouse wheel, Ctrl/Cmd + `+`/`-`/`0`, and the
 * app menu. Applies the saved or screen-based level on start and follows a
 * move to a different-sized screen while the user hasn't chosen a level.
 * Outside the desktop app it does nothing: browsers have their own zoom.
 */
export function useDesktopZoom(): DesktopZoom {
  const desktop = inTauri();
  const [zoom, setZoom] = useState(() => savedZoom() ?? 1);
  const zoomRef = useRef(zoom);
  // Applies run one after another, each reading the latest level, so a fast
  // burst of wheel notches can't land out of order.
  const applying = useRef<Promise<void>>(Promise.resolve());

  const applyLatest = useCallback(() => {
    applying.current = applying.current
      .then(() => applyZoom(zoomRef.current))
      .catch((error: unknown) => {
        console.error('Desktop zoom failed', error);
      });
  }, []);

  const set = useCallback(
    (level: number, choice: 'user' | 'automatic', notify: boolean) => {
      if (!desktop) return;
      saveZoom(choice === 'user' ? level : null);
      zoomRef.current = level;
      setZoom(level);
      applyLatest();
      if (notify) announce(level);
    },
    [applyLatest, desktop],
  );

  const setAutomatic = useCallback(
    (reason: 'start' | 'reset' | 'resize') => {
      screenWidth()
        .then((width) => {
          const level = automaticZoom(width);
          // Resize fires constantly while dragging: re-apply only on a change.
          if (reason === 'resize' && level === zoomRef.current) return;
          set(level, 'automatic', reason === 'reset');
        })
        .catch((error: unknown) => console.error('Desktop zoom: screen size unavailable', error));
    },
    [set],
  );

  const zoomIn = useCallback(() => set(stepZoom(zoomRef.current, 1), 'user', true), [set]);
  const zoomOut = useCallback(() => set(stepZoom(zoomRef.current, -1), 'user', true), [set]);
  const resetZoom = useCallback(() => setAutomatic('reset'), [setAutomatic]);

  useEffect(() => {
    if (!desktop) return;
    // A saved choice is already the initial state: only the WebView needs it.
    if (savedZoom() === null) setAutomatic('start');
    else applyLatest();

    let wheelTravel = 0;
    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      wheelTravel += event.deltaY;
      if (Math.abs(wheelTravel) < WHEEL_STEP_DELTA) return;
      const direction = wheelTravel < 0 ? 1 : -1;
      wheelTravel = 0;
      set(stepZoom(zoomRef.current, direction), 'user', true);
    };
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.key === '=' || event.key === '+') {
        event.preventDefault();
        set(stepZoom(zoomRef.current, 1), 'user', true);
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        set(stepZoom(zoomRef.current, -1), 'user', true);
      } else if (event.key === '0') {
        event.preventDefault();
        setAutomatic('reset');
      }
    };
    // A move to another monitor fires resize; follow it only while automatic.
    const onResize = () => {
      if (savedZoom() === null) setAutomatic('resize');
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [applyLatest, desktop, set, setAutomatic]);

  return { zoom, zoomIn, zoomOut, resetZoom };
}
