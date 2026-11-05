import { documentAnchorSchema, type BrowserLiveState, type DocumentAnchor } from '@clio/core/v3';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { frameRect, type Viewport } from '../browser-live-input';
import type { BrowserInput } from '../browser-live-socket';
import type { CommentSurface } from './comment-model';
import { CommentRegionLayer } from './comment-region-layer';
import { CommentSessionProvider, useCommentSession } from './comment-session';

/** Listen for the page's picks (the live socket's `pick` messages); returns the unsubscribe. */
export type SubscribePicks = (listener: (anchor: unknown) => void) => () => void;

interface PageRef {
  id: string;
  url: string;
  title: string;
}

/**
 * Comments on a page in the in-app browser (comments plan, "Pages in the in-app browser"). A
 * region is drawn over the live frame and kept as a rectangle of the page's view; an element
 * or a text selection is picked on the page itself, by the picker the server installs, while
 * the session asks for one. Marks attach to the next message, where the server takes a fresh
 * screenshot and resolves each mark on the live page.
 */
export function BrowserPageComments({
  page,
  send,
  subscribe,
  children,
}: {
  page: PageRef;
  send: (input: BrowserInput) => void;
  subscribe: SubscribePicks;
  children: ReactNode;
}) {
  const surface = useMemo<CommentSurface>(
    () => ({
      title: page.title || page.url || 'Browser page',
      modes: ['text', 'element', 'region'],
      defaultMode: 'text',
      destination: { kind: 'attachment', surface: 'browser-page' },
    }),
    [page.title, page.url],
  );
  return (
    <CommentSessionProvider surface={surface}>
      <PickBridge page={page} send={send} subscribe={subscribe} />
      {children}
    </CommentSessionProvider>
  );
}

/** Starts and stops the page's picker with the session's mode, and takes its picks. */
function PickBridge({
  page,
  send,
  subscribe,
}: {
  page: PageRef;
  send: (input: BrowserInput) => void;
  subscribe: SubscribePicks;
}) {
  const session = useCommentSession();
  const addMark = session?.addMark;
  const pickMode = session?.active && session.mode !== 'region' ? session.mode : undefined;
  useEffect(
    () =>
      subscribe((raw) => {
        const parsed = documentAnchorSchema.safeParse(raw);
        if (!parsed.success || !addMark) return;
        const source = (parsed.data.source as { page?: { id?: unknown } }).page;
        if (source?.id !== page.id) return;
        addMark(parsed.data);
      }),
    [addMark, page.id, subscribe],
  );
  useEffect(() => {
    if (!pickMode) return;
    send({ type: 'pick.start', mode: pickMode });
    return () => send({ type: 'pick.stop' });
  }, [pickMode, send]);
  return null;
}

/**
 * The region tool over the live frame, in region mode only. It keeps the person's drag from
 * reaching the page, and maps the rectangle from the view onto the page's own view.
 */
export function BrowserRegionCapture({
  page,
  state,
}: {
  page: PageRef;
  state: BrowserLiveState | null;
}) {
  const session = useCommentSession();
  const host = useRef<HTMLDivElement>(null);
  const capturing = Boolean(session?.active && session.mode === 'region' && state);
  const shown = session?.open
    ? session.marks.flatMap((mark) => (mark.view ? [{ label: mark.label, rect: mark.view }] : []))
    : [];
  if (!session || !state || (!capturing && !shown.length)) return null;
  const viewport: Viewport = state.viewport;
  const stop = (event: { stopPropagation: () => void }) => {
    if (capturing) event.stopPropagation();
  };
  return (
    <div
      className="absolute inset-0"
      onPointerDown={stop}
      onPointerMove={stop}
      onPointerUp={stop}
      ref={host}
      role="presentation"
      style={{ pointerEvents: capturing ? 'auto' : 'none' }}
    >
      <CommentRegionLayer
        capturing={capturing}
        label="Drag over the page to mark a region"
        marks={shown}
        onOpenMark={session.setEditing}
        onRegion={(rect) => {
          const box = host.current?.getBoundingClientRect();
          const normal = box ? frameRect(rect, box, viewport) : null;
          if (!normal) return;
          const anchor: DocumentAnchor = {
            profile: 'region',
            rect: normal,
            natural_width: viewport.width,
            natural_height: viewport.height,
            viewport_width: viewport.width,
            source: { page: { id: page.id, url: page.url, title: page.title } },
          };
          session.addMark(anchor, {
            view: rect,
            box: box
              ? {
                  left: box.left + rect[0] * box.width,
                  top: box.top + rect[1] * box.height,
                  width: rect[2] * box.width,
                  height: rect[3] * box.height,
                }
              : undefined,
          });
        }}
      />
    </div>
  );
}
