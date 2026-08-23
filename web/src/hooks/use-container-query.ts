import { useEffect, useState, type RefObject } from 'react';

/** Tracks a layout threshold against the component's real available width. */
export function useContainerQuery(
  ref: RefObject<HTMLElement | null>,
  minimumWidth: number,
): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = (width: number) => setMatches(width >= minimumWidth);
    update(element.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) update(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [minimumWidth, ref]);

  return matches;
}
