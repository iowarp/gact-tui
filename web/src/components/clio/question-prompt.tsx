import { useId, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { displayLineBottoms } from './display-line-geometry';
import { QuestionMarkdown } from './question-markdown';
import { t } from '@lingui/core/macro';

const PREVIEW_LINES = 4;

/**
 * A long question's explanation and evidence: whole lines up to a short preview, then
 * Show more opens the rest in place. It never scrolls inside the card, so the answers
 * below it stay in view.
 */
export function QuestionPromptText({ children }: { children: string }) {
  const id = useId();
  const body = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [bottoms, setBottoms] = useState<number[]>([]);
  useLayoutEffect(() => {
    const element = body.current;
    if (!element) return;
    const measure = () => setBottoms(displayLineBottoms(element));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [children]);
  const clipped = bottoms.length > PREVIEW_LINES;
  const height = !expanded && clipped ? bottoms[PREVIEW_LINES - 1] : undefined;
  return (
    <div className="min-w-0">
      <div
        className={cn('min-w-0', height !== undefined && 'overflow-hidden')}
        id={id}
        style={{ maxHeight: height === undefined ? undefined : `${Math.ceil(height)}px` }}
      >
        <div ref={body}>
          <QuestionMarkdown>{children}</QuestionMarkdown>
        </div>
      </div>
      {clipped ? (
        <button
          aria-controls={id}
          aria-expanded={expanded}
          className="mt-0.5 rounded-sm text-meta font-medium text-primary outline-none hover:text-primary/80 focus-visible:ring-2 focus-visible:ring-ring"
          data-slot="question-prompt-toggle"
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          {expanded ? t`Show less` : t`Show more`}
        </button>
      ) : null}
    </div>
  );
}
