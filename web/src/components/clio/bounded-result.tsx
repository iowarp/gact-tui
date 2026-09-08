import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';

import { displayLineBottoms } from './display-line-geometry';
import { ResultDialogContent } from './result-dialog-content';

/** Keep a bounded preview; reveal short results once, and open large results separately. */
export function BoundedResult({
  children,
  lines,
  hasMore = false,
  loadMore,
  running = false,
  title = 'Complete result',
  fullContent,
  separateViewer = false,
  unit = 'lines',
}: {
  children: ReactNode;
  lines: number;
  hasMore?: boolean;
  loadMore?: (signal: AbortSignal) => Promise<void>;
  running?: boolean;
  title?: string;
  fullContent?: ReactNode;
  separateViewer?: boolean;
  unit?: 'lines' | 'items';
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
      if (unit === 'items') {
        // Clipped task rows must not remain keyboard stops or screen-reader
        // content. inert preserves their geometry for the measured preview.
        element.querySelectorAll<HTMLElement>(':scope > ul > li').forEach((item, index) => {
          item.toggleAttribute('inert', !expanded && index >= lines);
        });
      }
      setBottoms(
        unit === 'items'
          ? Array.from(
              element.querySelectorAll(':scope > ul > li'),
              (item) => item.getBoundingClientRect().bottom - element.getBoundingClientRect().top,
            )
          : displayLineBottoms(element),
      );
      if (running && following.current && viewport.current)
        viewport.current.scrollTop = viewport.current.scrollHeight;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [children, running, unit, expanded, lines]);
  const hidden = bottoms.length > lines || hasMore;
  const separate =
    separateViewer || hasMore || bottoms.length > Math.max(unit === 'items' ? 10 : 30, lines * 2);
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
        if (request.current === controller) {
          setLoading(false);
          request.current = null;
        }
      }
    }
  };
  return (
    <div className="min-w-0">
      <div
        id={id}
        ref={viewport}
        className={running ? 'overflow-auto' : 'overflow-hidden'}
        role={running ? 'region' : undefined}
        aria-label={running ? 'Live terminal output' : undefined}
        tabIndex={running ? 0 : undefined}
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
          <ResultDialogContent
            title={title}
            description="Full output, kept separate from the conversation preview."
            footer={
              <>
                {loading ? <p role="status">Loading complete result…</p> : null}
                {error ? (
                  <p role="alert" className="text-destructive">
                    {error}
                  </p>
                ) : null}
              </>
            }
          >
            {fullContent ?? children}
          </ResultDialogContent>
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
