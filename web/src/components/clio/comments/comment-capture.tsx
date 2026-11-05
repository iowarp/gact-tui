import type { DocumentAnchor } from '@clio/core/v3';
import { MessageSquarePlusIcon } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { CommentRegionLayer, type Rect } from './comment-region-layer';
import { useCommentSession } from './comment-session';
import { SvgElementLayer } from './svg-element-layer';
import { textQuoteFromSelection } from './text-anchor';

function screenBox(rect: DOMRect) {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

/** The toolbar control that opens and closes the surface's comment session. */
export function CommentToggle({ className }: { className?: string }) {
  const session = useCommentSession();
  const destination = session?.surface.destination;
  if (!session || (destination?.kind === 'artifact' && !destination.artifactId)) return null;
  const count = session.marks.length;
  return (
    <Button
      aria-pressed={session.open}
      className={className}
      data-comment-toggle="true"
      onClick={() => (session.open ? session.stop() : session.start())}
      size="sm"
      type="button"
      variant={session.open ? 'secondary' : 'ghost'}
    >
      <MessageSquarePlusIcon aria-hidden="true" />
      <span className="@max-[520px]/viewer:sr-only">Comment</span>
      {count ? <span className="tabular-nums">{count}</span> : null}
    </Button>
  );
}

/**
 * Text and region capture over one viewer. In text mode, a selection inside it becomes a
 * text-quote mark; in region mode, a drag over it becomes a region mark normalized to it.
 * `regionAnchor` turns the rectangle into the viewer's own anchor (a page and rectangle on
 * a PDF, the image's rectangle on an image); without it the viewer takes no regions.
 */
export function CommentCapture({
  children,
  sourcePath,
  regionAnchor,
  svg,
  className,
}: {
  children: ReactNode;
  sourcePath?: string;
  regionAnchor?: (rect: Rect, host: HTMLElement) => DocumentAnchor | undefined;
  /** An SVG shown as an image: its bytes, so element marks can pick its elements. */
  svg?: Uint8Array;
  className?: string;
}) {
  const session = useCommentSession();
  const host = useRef<HTMLDivElement>(null);
  const [hostElement, setHostElement] = useState<HTMLDivElement | null>(null);
  const elementMode = Boolean(session?.active && session.mode === 'element' && svg);
  const textMode = session?.active && session.mode === 'text';
  const regionMode = Boolean(session?.active && session.mode === 'region' && regionAnchor);
  const captureText = () => {
    if (!textMode || !host.current) return;
    const anchor = textQuoteFromSelection(host.current);
    if (!anchor) return;
    const range = window.getSelection()?.rangeCount
      ? window.getSelection()!.getRangeAt(0)
      : undefined;
    const selected =
      typeof range?.getBoundingClientRect === 'function'
        ? range.getBoundingClientRect()
        : undefined;
    session!.addMark(sourcePath ? { ...anchor, source_path: sourcePath } : anchor, {
      box: selected ? screenBox(selected) : undefined,
    });
    window.getSelection()?.removeAllRanges();
  };
  const shown = session?.open
    ? session.marks.flatMap((mark) => (mark.view ? [{ label: mark.label, rect: mark.view }] : []))
    : [];
  return (
    <div
      className={className ?? 'relative h-full min-h-0 min-w-0'}
      data-comment-capture={session?.active ? session.mode : undefined}
      onKeyUp={(event) => {
        if (event.shiftKey) captureText();
      }}
      onMouseUp={captureText}
      onTouchEnd={captureText}
      ref={(element) => {
        host.current = element;
        setHostElement(element);
      }}
    >
      {children}
      {elementMode && hostElement && svg ? (
        <SvgElementLayer
          bytes={svg}
          host={hostElement}
          onPick={(anchor, box) =>
            session!.addMark(sourcePath ? { ...anchor, source_path: sourcePath } : anchor, {
              box: { left: box.left, top: box.top, width: box.width, height: box.height },
            })
          }
        />
      ) : null}
      {regionMode || shown.length ? (
        <CommentRegionLayer
          capturing={regionMode}
          label="Drag to mark a region"
          marks={shown}
          onOpenMark={session?.setEditing}
          onRegion={(rect) => {
            const anchor = regionAnchor?.(rect, host.current!);
            if (!anchor) return;
            const at = host.current!.getBoundingClientRect();
            session!.addMark(anchor, {
              view: rect,
              box: {
                left: at.left + rect[0] * at.width,
                top: at.top + rect[1] * at.height,
                width: rect[2] * at.width,
                height: rect[3] * at.height,
              },
            });
          }}
        />
      ) : null}
    </div>
  );
}
