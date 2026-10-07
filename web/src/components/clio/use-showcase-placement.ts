import { useCallback, useLayoutEffect, useMemo, useState, type RefObject } from 'react';
import { showcaseGutter, type ShowcaseGutter } from './showcase-placement';

/** Measure the actual free gutter; never narrow or move the conversation to make room. */
export function useShowcasePlacement(
  buttonRef: RefObject<HTMLButtonElement | null>,
  surfaceRef?: RefObject<HTMLElement | null>,
  onGutterLost?: () => void,
) {
  const [gutter, setGutter] = useState<ShowcaseGutter>();
  const [flyoutHeight, setFlyoutHeight] = useState<number>();
  const measureNow = useCallback(() => {
    const button = buttonRef.current;
    const surface = surfaceRef?.current ?? button?.closest('[data-slot="session-transcript"]');
    const column = surface?.querySelector('[data-slot="transcript-column"]');
    const composer = surface?.querySelector('[data-slot="clio-composer-stack"] form');
    const next =
      surface && column && composer
        ? showcaseGutter(
            surface.getBoundingClientRect(),
            column.getBoundingClientRect(),
            composer.getBoundingClientRect(),
          )
        : undefined;
    if (button && composer)
      setFlyoutHeight(
        Math.max(
          0,
          Math.min(
            512,
            composer.getBoundingClientRect().top - button.getBoundingClientRect().bottom - 24,
          ),
        ),
      );
    setGutter((current) =>
      current?.left === next?.left &&
      current?.top === next?.top &&
      current?.width === next?.width &&
      current?.height === next?.height
        ? current
        : next,
    );
    return next;
  }, [buttonRef, surfaceRef]);
  useLayoutEffect(() => {
    const button = buttonRef.current;
    const surface = surfaceRef?.current ?? button?.closest('[data-slot="session-transcript"]');
    if (!surface) return;
    let frame: number | undefined;
    const measure = () => {
      const column = surface.querySelector('[data-slot="transcript-column"]');
      const composer = surface.querySelector('[data-slot="clio-composer-stack"] form');
      if (column) resize.observe(column);
      if (composer) resize.observe(composer);
      const next = measureNow();
      // A disappearing gutter closes the dock; a resize never converts it into an overlay.
      if (!next) onGutterLost?.();
    };
    const schedule = () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(surface);
    const column = surface.querySelector('[data-slot="transcript-column"]');
    if (column) resize.observe(column);
    const children = new MutationObserver(schedule);
    children.observe(surface, { childList: true, subtree: true });
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      resize.disconnect();
      children.disconnect();
      window.removeEventListener('resize', schedule);
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [buttonRef, surfaceRef, onGutterLost, measureNow]);
  const dockAnchor = useMemo(
    () => ({
      current: {
        getBoundingClientRect: () => {
          if (gutter) return new DOMRect(gutter.left, gutter.top, 0, 0);
          return buttonRef.current?.getBoundingClientRect() ?? new DOMRect();
        },
      },
    }),
    [buttonRef, gutter],
  );
  const flyoutAnchor = useMemo(
    () => ({
      current: {
        getBoundingClientRect: () => buttonRef.current?.getBoundingClientRect() ?? new DOMRect(),
      },
    }),
    [buttonRef],
  );
  return { gutter, flyoutHeight, dockAnchor, flyoutAnchor, measureNow };
}
