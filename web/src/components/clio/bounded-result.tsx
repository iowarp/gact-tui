import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

import { displayLineBottoms } from './display-line-geometry';

/** Keep a bounded preview; reveal short results once, and open large results separately. */
export function BoundedResult({
  children,
  lines,
  hasMore = false,
  loadMore,
  running = false,
  title = 'Complete result',
}: {
  children: ReactNode;
  lines: number;
  hasMore?: boolean;
  loadMore?: (signal: AbortSignal) => Promise<void>;
  running?: boolean;
  title?: string;
}) {
  const id = useId();
  const body = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState(false);
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
  const hidden = bottoms.length > lines || hasMore;
  const separate = hasMore || bottoms.length > Math.max(30, lines * 2);
  const height = running ? lines * 24 : expanded ? undefined : bottoms[lines - 1];
  const expand = async () => {
    setError('');
    if (hasMore && loadMore) {
      if (request.current && !request.current.signal.aborted) return;
      const controller = new AbortController();
      request.current = controller;
      setLoading(true);
      try {
        await loadMore(controller.signal);
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Unable to load result');
        return;
      } finally {
        setLoading(false);
        request.current = null;
      }
    }
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
      {!running && hidden && !separate ? (
        <Button
          variant="ghost"
          size="sm"
          aria-controls={id}
          aria-expanded={expanded}
          disabled={loading}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Show less' : 'Show more'}
        </Button>
      ) : null}
      {!running && (separate || open) ? (
        <Dialog
          open={open}
          onOpenChange={(value) => {
            setOpen(value);
            if (!value) request.current?.abort();
          }}
        >
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" aria-expanded={open} onClick={() => void expand()}>
              Show more
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85dvh] sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>
                Full output, kept separate from the conversation preview.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[65dvh] min-w-0 overflow-auto text-sm leading-6">{children}</div>
            {loading ? <p role="status">Loading complete result…</p> : null}
            {error ? (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            ) : null}
          </DialogContent>
        </Dialog>
      ) : null}
      <span className="sr-only" role="status">
        {expanded ? 'Complete result revealed' : ''}
      </span>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
