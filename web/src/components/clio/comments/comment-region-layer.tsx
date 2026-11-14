import { useRef, useState, type PointerEvent } from 'react';
import { t, ph } from '@lingui/core/macro';

export type Rect = [number, number, number, number];

export interface LayerMark {
  label: string;
  rect: Rect;
  /** A text selection is drawn as a highlight; anything else as a box. */
  text?: boolean;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * The one drag tool (comments plan, "Region capture"), generalized from the A2UI capture:
 * it covers its positioned parent, reports a dragged rectangle normalized to that parent
 * (x, y, width, height in 0..1), and draws the session's marks with their label badges.
 * Pointer events cover mouse, pen and touch; it only takes them while `capturing`.
 */
export function CommentRegionLayer({
  capturing,
  marks,
  onRegion,
  onOpenMark,
  openByBadge = false,
  label,
  onPoint,
}: {
  capturing: boolean;
  marks: readonly LayerMark[];
  onRegion: (rect: Rect) => void;
  /** Open a mark's editor from its box on the view, as on an A2UI surface. */
  onOpenMark?: (label: string) => void;
  /** Only the label badge opens the mark, so the marked content stays usable (a live page). */
  openByBadge?: boolean;
  label: string;
  /** A click without a drag marks a point (x, y in 0..1); without it, a click marks nothing. */
  onPoint?: (x: number, y: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number }>(undefined);
  const [draft, setDraft] = useState<Rect>();
  const point = (event: PointerEvent<HTMLDivElement>) => {
    const box = host.current!.getBoundingClientRect();
    return {
      x: clamp((event.clientX - box.left) / box.width),
      y: clamp((event.clientY - box.top) / box.height),
    };
  };
  return (
    <div
      aria-label={label}
      className="absolute inset-0 z-10"
      data-capture-ui="true"
      data-slot="comment-region-layer"
      onPointerDown={(event) => {
        if (!capturing || event.button !== 0) return;
        start.current = point(event);
        setDraft([start.current.x, start.current.y, 0, 0]);
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
      }}
      onPointerMove={(event) => {
        if (!start.current) return;
        const at = point(event);
        setDraft([
          Math.min(at.x, start.current.x),
          Math.min(at.y, start.current.y),
          Math.abs(at.x - start.current.x),
          Math.abs(at.y - start.current.y),
        ]);
      }}
      onPointerUp={() => {
        const finished = draft;
        start.current = undefined;
        setDraft(undefined);
        const box = host.current?.getBoundingClientRect();
        if (!finished || !box) return;
        if (finished[2] * box.width < 6 || finished[3] * box.height < 6) {
          if (onPoint && finished[2] * box.width < 6 && finished[3] * box.height < 6)
            onPoint(finished[0] + finished[2] / 2, finished[1] + finished[3] / 2);
          return;
        }
        onRegion(finished);
      }}
      ref={host}
      role="presentation"
      style={{
        pointerEvents: capturing ? 'auto' : 'none',
        cursor: capturing ? 'crosshair' : undefined,
        touchAction: capturing ? 'none' : undefined,
      }}
    >
      {[...marks, ...(draft ? [{ label: '', rect: draft, text: false }] : [])].map((mark) => {
        const style = {
          left: `${mark.rect[0] * 100}%`,
          top: `${mark.rect[1] * 100}%`,
          width: `${mark.rect[2] * 100}%`,
          height: `${mark.rect[3] * 100}%`,
        };
        const badge = mark.label ? (
          <span className="absolute -top-5 left-0 rounded-t bg-primary px-1.5 text-xs font-bold text-primary-foreground">
            {mark.label}
          </span>
        ) : null;
        const shape = mark.text
          ? 'border-b-2 border-primary bg-primary/20'
          : 'border-2 border-primary bg-primary/10';
        if (mark.label && onOpenMark && openByBadge) {
          const open = onOpenMark;
          return (
            <div
              className={`pointer-events-none absolute ${shape}`}
              data-mark-label={mark.label}
              key={mark.label}
              style={style}
            >
              <button
                aria-label={t`Edit ${ph({ label: mark.label })}`}
                className="pointer-events-auto absolute -top-5 left-0 rounded-t bg-primary px-1.5 text-xs font-bold text-primary-foreground"
                onClick={() => open(mark.label)}
                onPointerDown={(event) => event.stopPropagation()}
                type="button"
              >
                {mark.label}
              </button>
            </div>
          );
        }
        return mark.label && onOpenMark ? (
          <button
            aria-label={t`Edit ${ph({ label: mark.label })}`}
            className={`absolute ${shape}`}
            data-mark-label={mark.label}
            key={mark.label}
            onClick={() => onOpenMark(mark.label)}
            onPointerDown={(event) => event.stopPropagation()}
            style={{ ...style, pointerEvents: 'auto' }}
            type="button"
          >
            {badge}
          </button>
        ) : (
          <div
            className="pointer-events-none absolute border-2 border-primary bg-primary/10"
            data-mark-label={mark.label || undefined}
            key={mark.label || 'draft'}
            style={style}
          >
            {badge}
          </div>
        );
      })}
    </div>
  );
}
