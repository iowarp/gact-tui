import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

import { displayLineBottoms } from './display-line-geometry';

/** Reveal display-line pages without mounting the entire remote result. */
export function BoundedResult({
  children,
  lines,
  hasMore = false,
  loadMore,
  running = false,
}: {
  children: ReactNode;
  lines: number;
  hasMore?: boolean;
  loadMore?: () => Promise<void>;
  running?: boolean;
}) {
  const id = useId();
  const body = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [pages, setPages] = useState(1);
  const [bottoms, setBottoms] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useLayoutEffect(() => {
    const element = body.current;
    if (!element) return;
    const measure = () => {
      setBottoms(displayLineBottoms(element));
      if (running && following.current && viewport.current)
        viewport.current.scrollTop = viewport.current.scrollHeight;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [children, running]);
  const budget = lines * pages;
  const hidden = bottoms.length > budget || hasMore;
  const height = running ? lines * 24 : bottoms[budget - 1];
  const expand = async () => {
    if (!hidden) {
      setPages(1);
      return;
    }
    setError('');
    if (hasMore && bottoms.length <= budget + lines && loadMore) {
      setLoading(true);
      try {
        await loadMore();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Unable to load result');
        return;
      } finally {
        setLoading(false);
      }
    }
    setPages((value) => value + 1);
  };
  return (
    <div className="min-w-0">
      <div
        id={id}
        ref={viewport}
        className={running ? 'overflow-auto' : 'overflow-hidden'}
        style={{ maxHeight: height === undefined ? undefined : `${height}px` }}
        onScroll={(event) => {
          const node = event.currentTarget;
          following.current = node.scrollHeight - node.scrollTop - node.clientHeight < 8;
        }}
      >
        <div ref={body} className="tool-presentation-body text-sm leading-6">
          {children}
        </div>
      </div>
      {!running && (hidden || pages > 1) ? (
        <Button
          variant="ghost"
          size="sm"
          aria-controls={id}
          aria-expanded={pages > 1}
          disabled={loading}
          onClick={() => void expand()}
        >
          {loading ? 'Loading…' : hidden ? 'Show more' : 'Show less'}
        </Button>
      ) : null}
      <span className="sr-only" role="status">
        {pages > 1 ? `${Math.min(bottoms.length, budget)} display lines revealed` : ''}
      </span>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
