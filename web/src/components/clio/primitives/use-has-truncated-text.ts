import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import { truncatedTextWithin } from '@/lib/truncation';

/** Whether any text inside `ref` is cut now, rechecked when its size changes. */
export function useHasTruncatedText(ref: RefObject<HTMLElement | null>, watch: unknown = null) {
  const [cut, setCut] = useState(false);
  const measure = useCallback(() => {
    const root = ref.current;
    setCut(root ? truncatedTextWithin(root, 200).length > 0 : false);
  }, [ref]);
  useLayoutEffect(() => {
    measure();
  }, [measure, watch]);
  useEffect(() => {
    const root = ref.current;
    if (!root || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [measure, ref]);
  return cut;
}
