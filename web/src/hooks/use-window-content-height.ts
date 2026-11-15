import { useLayoutEffect, useRef, useState } from 'react';

/** The settings window's scrolling height, so the pane can fill it beside a long list. */
export function useWindowContentHeight() {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();
  useLayoutEffect(() => {
    const scroller = ref.current?.closest<HTMLElement>('[data-window-content]');
    if (!scroller || typeof ResizeObserver === 'undefined') return;
    const measure = () => setHeight(scroller.clientHeight || undefined);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);
  return [ref, height] as const;
}
