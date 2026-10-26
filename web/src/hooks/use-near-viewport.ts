import { useEffect, useState, type RefObject } from 'react';

/** Prepare nearby content without starting reads for every row in a long conversation. */
export function useNearViewport(ref: RefObject<HTMLElement | null>, margin = 300): boolean {
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setNear(Boolean(entry?.isIntersecting)),
      { rootMargin: `${margin}px` },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, margin]);
  return near;
}
