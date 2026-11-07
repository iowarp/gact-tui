import type { DocumentAnchor } from '@clio/core/v3';
import { useEffect, useState } from 'react';
import { textQuoteRange, textRangeRects } from './text-anchor';

export interface TextLayerMark {
  label: string;
  anchor: DocumentAnchor;
}

interface Drawn {
  label: string;
  boxes: { left: number; top: number; width: number; height: number }[];
}

/**
 * Draws a session's text marks over the viewer they were made on: each quote is found again
 * in the viewer's current text and its lines are outlined, with the mark's label. The boxes
 * follow the text as it scrolls, reflows or re-renders (a source file, a PDF's text layer),
 * and a quote that is no longer there is not drawn. Only the label takes the pointer, so
 * the text under a mark can still be selected; choosing the label opens the mark's editor.
 */
export function CommentTextLayer({
  host,
  marks,
  onOpenMark,
}: {
  host: HTMLElement;
  marks: readonly TextLayerMark[];
  onOpenMark?: (label: string) => void;
}) {
  const [drawn, setDrawn] = useState<Drawn[]>([]);
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const at = host.getBoundingClientRect();
      setDrawn(
        marks.flatMap((mark) => {
          const range = textQuoteRange(host, mark.anchor);
          if (!range) return [];
          const boxes = textRangeRects(range).map((rect) => ({
            left: rect.left - at.left,
            top: rect.top - at.top,
            width: rect.width,
            height: rect.height,
          }));
          return boxes.length ? [{ label: mark.label, boxes }] : [];
        }),
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    schedule();
    host.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    const resized = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : undefined;
    resized?.observe(host);
    const changed = new MutationObserver((records) => {
      // The layer's own boxes are inside the host: redrawing them is not a change of text.
      if (
        records.some(
          (record) => !(record.target as Element).closest?.('[data-slot="comment-text-layer"]'),
        )
      )
        schedule();
    });
    changed.observe(host, { childList: true, subtree: true, characterData: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      host.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      resized?.disconnect();
      changed.disconnect();
    };
  }, [host, marks]);
  if (!drawn.length) return null;
  return (
    <div
      aria-hidden={onOpenMark ? undefined : true}
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
      data-capture-ui="true"
      data-comment-skip="true"
      data-slot="comment-text-layer"
    >
      {drawn.map((mark) => (
        <div data-mark-label={mark.label} key={mark.label}>
          {mark.boxes.map((box, index) => (
            <div
              className="absolute rounded-sm border-b-2 border-primary bg-primary/15"
              key={index}
              style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
            />
          ))}
          {onOpenMark ? (
            <button
              aria-label={`Edit ${mark.label}`}
              className="pointer-events-auto absolute -translate-y-full rounded-t bg-primary px-1.5 text-xs font-bold text-primary-foreground"
              onClick={() => onOpenMark(mark.label)}
              style={{ left: mark.boxes[0]!.left, top: mark.boxes[0]!.top }}
              type="button"
            >
              {mark.label}
            </button>
          ) : (
            <span
              className="absolute -translate-y-full rounded-t bg-primary px-1.5 text-xs font-bold text-primary-foreground"
              style={{ left: mark.boxes[0]!.left, top: mark.boxes[0]!.top }}
            >
              {mark.label}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
