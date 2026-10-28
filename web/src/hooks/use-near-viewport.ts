import { useEffect, useState, type RefObject } from 'react';

/**
 * Prepare nearby content without starting reads for every row in a long conversation.
 * `margin` is pixels, or any CSS root margin such as `'100%'` (one viewport height).
 */
export function useNearViewport(
  ref: RefObject<HTMLElement | null>,
  margin: number | string = 300,
): boolean {
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setNear(Boolean(entry?.isIntersecting)),
      { rootMargin: typeof margin === 'number' ? `${margin}px` : margin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, margin]);
  return near;
}
