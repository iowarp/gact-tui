import type { DocumentAnchor } from '@clio/core/v3';
import { MessageSquarePlusIcon } from 'lucide-react';
import { useMemo, useRef, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { CommentRegionLayer, type Rect } from './comment-region-layer';
import { HtmlPickContext, type HtmlPick } from './html-pick';
import { useCommentSession } from './comment-session';
import { textQuoteFromSelection } from './text-anchor';

/** The toolbar control that opens and closes the surface's comment session. */
export function CommentToggle({ className }: { className?: string }) {
  const session = useCommentSession();
  const destination = session?.surface.destination;
  if (!session || (destination?.kind === 'artifact' && !destination.artifactId)) return null;
  const count = session.marks.length;
  return (
    <Button
      aria-pressed={session.active}
      className={className}
      data-comment-toggle="true"
      onClick={() => (session.active ? session.stop() : session.start())}
      size="sm"
      type="button"
      variant={session.active ? 'secondary' : 'ghost'}
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
  className,
}: {
  children: ReactNode;
  sourcePath?: string;
  regionAnchor?: (rect: Rect, host: HTMLElement) => DocumentAnchor | undefined;
  className?: string;
}) {
  const session = useCommentSession();
  const host = useRef<HTMLDivElement>(null);
  const textMode = session?.active && session.mode === 'text';
  const regionMode = Boolean(session?.active && session.mode === 'region' && regionAnchor);
  const addMark = session?.addMark;
  const pickMode = session?.active && session.mode !== 'region' ? session.mode : undefined;
  const pick = useMemo<HtmlPick | undefined>(
    () =>
      addMark
        ? {
            mode: pickMode,
            htmlChars: 400,
            onPick: (anchor) => addMark(sourcePath ? { ...anchor, source_path: sourcePath } : anchor),
          }
        : undefined,
    [addMark, pickMode, sourcePath],
  );
  const captureText = () => {
    if (!textMode || !host.current) return;
    const anchor = textQuoteFromSelection(host.current);
    if (!anchor) return;
    session!.addMark(sourcePath ? { ...anchor, source_path: sourcePath } : anchor);
    window.getSelection()?.removeAllRanges();
  };
  return (
    <div
      className={className ?? 'relative h-full min-h-0 min-w-0'}
      data-comment-capture={session?.active ? session.mode : undefined}
      onKeyUp={(event) => {
        if (event.shiftKey) captureText();
      }}
      onMouseUp={captureText}
      onTouchEnd={captureText}
      ref={host}
    >
      <HtmlPickContext.Provider value={pick}>{children}</HtmlPickContext.Provider>
      {regionMode ? (
        <CommentRegionLayer
          capturing
          label="Drag to mark a region"
          marks={[]}
          onRegion={(rect) => {
            const anchor = regionAnchor?.(rect, host.current!);
            if (anchor) session!.addMark(anchor);
          }}
        />
      ) : null}
    </div>
  );
}
