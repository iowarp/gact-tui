import { documentAnchorSchema, type BrowserLiveState, type DocumentAnchor } from '@clio/core/v3';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { frameRect, viewRect, type Viewport } from '../browser-live-input';
import type { BrowserInput, MarksReport } from '../browser-live-socket';
import type { CommentSurface, DraftMark } from './comment-model';
import { CommentRegionLayer, type LayerMark } from './comment-region-layer';
import { CommentSessionProvider, useCommentSession } from './comment-session';

/** Listen for the page's picks (the live socket's `pick` messages); returns the unsubscribe. */
export type SubscribePicks = (listener: (anchor: unknown) => void) => () => void;

/** Listen for where the page found the followed marks (`marks` messages). */
export type SubscribeMarks = (listener: (report: MarksReport) => void) => () => void;

/** The page's latest report on the marks this view follows. */
const MarksContext = createContext<MarksReport | null>(null);

export const ANCHOR_NOT_FOUND = "Couldn't find this anchor on the page";
export const ANCHOR_HIDDEN = 'This anchor is on the page but not shown';

/** An address without its fragment: the page a mark was made on, wherever it was scrolled. */
function pageAddress(url: string | undefined): string {
  const at = (url ?? '').indexOf('#');
  return at < 0 ? (url ?? '') : (url ?? '').slice(0, at);
}

function markPage(mark: DraftMark): { id?: unknown; url?: unknown } {
  const source = (mark.anchor.source ?? {}) as { page?: { id?: unknown; url?: unknown } };
  return source.page ?? {};
}

/** A mark the page itself can find again: a picked element or a text selection. */
function followed(mark: DraftMark, pageId: string): boolean {
  return (
    (mark.anchor.profile === 'dom' || mark.anchor.profile === 'text-quote') &&
    markPage(mark).id === pageId
  );
}

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
  subscribeMarks,
  interactive,
  children,
}: {
  page: PageRef;
  send: (input: BrowserInput) => void;
  subscribe: SubscribePicks;
  /** Where the page finds the marks again, to pin them on the view and note any it lost. */
  subscribeMarks?: SubscribeMarks;
  /** This view sends input to the page; only such a view can ask it for a pick. */
  interactive: boolean;
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
      <PickBridge interactive={interactive} page={page} send={send} subscribe={subscribe} />
      <MarkWatch interactive={interactive} page={page} send={send} subscribe={subscribeMarks}>
        {children}
      </MarkWatch>
    </CommentSessionProvider>
  );
}

/** Starts and stops the page's picker with the session's mode, and takes its picks. */
function PickBridge({
  page,
  send,
  subscribe,
  interactive,
}: {
  page: PageRef;
  send: (input: BrowserInput) => void;
  subscribe: SubscribePicks;
  interactive: boolean;
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
  // Asked again whenever this view gains the page's input: a view that took over from
  // another (the canvas remounted) is view-only until the other leaves, which ends any pick.
  useEffect(() => {
    if (!pickMode || !interactive) return;
    send({ type: 'pick.start', mode: pickMode });
    return () => send({ type: 'pick.stop' });
  }, [interactive, pickMode, send]);
  return null;
}

/**
 * Has the page follow the session's element and text marks, as the comments on a file follow
 * its text: the page finds each again by its selector, image source, accessible role and name,
 * or quoted text with its context, after a reload, a navigation back or a change to the page,
 * and reports where. A mark it cannot find gets a note, like a comment on an older version of
 * a file; a mark found under a new selector takes it, so the agent is pointed at it.
 */
function MarkWatch({
  page,
  send,
  subscribe,
  interactive,
  children,
}: {
  page: PageRef;
  send: (input: BrowserInput) => void;
  subscribe?: SubscribeMarks;
  interactive: boolean;
  children: ReactNode;
}) {
  const session = useCommentSession();
  const [report, setReport] = useState<MarksReport | null>(null);
  const marks = session?.open ? session.marks : [];
  const watched = marks.filter((mark) => followed(mark, page.id));
  const key = JSON.stringify(watched.map((mark) => [mark.label, mark.anchor]));
  useEffect(() => subscribe?.(setReport), [subscribe]);
  useEffect(() => {
    if (!interactive || !subscribe) return;
    const list = JSON.parse(key) as [string, DocumentAnchor][];
    send({ type: 'marks.watch', marks: list.map(([label, anchor]) => ({ label, anchor })) });
  }, [interactive, key, send, subscribe]);
  useEffect(() => {
    if (!subscribe) return;
    return () => send({ type: 'marks.watch', marks: [] });
  }, [send, subscribe]);

  const updateMark = session?.updateMark;
  // Only a new report is acted on; the marks it changes must not act on it again.
  const latest = useRef(watched);
  useEffect(() => {
    latest.current = watched;
  });
  useEffect(() => {
    if (!report || !updateMark) return;
    const here = pageAddress(report.url);
    for (const mark of latest.current) {
      if (pageAddress(String(markPage(mark).url ?? '')) !== here) continue;
      const found = report.marks.find((item) => item.label === mark.label);
      if (!found) continue;
      const note = found.found
        ? undefined
        : found.reason === 'hidden'
          ? ANCHOR_HIDDEN
          : ANCHOR_NOT_FOUND;
      const patch: Partial<DraftMark> = {};
      if (note !== mark.note) patch.note = note;
      if (found.found && found.selector && found.selector !== mark.anchor.selector)
        patch.anchor = { ...mark.anchor, selector: found.selector };
      if (Object.keys(patch).length) updateMark(mark.label, patch);
    }
  }, [report, updateMark]);
  return <MarksContext.Provider value={report}>{children}</MarksContext.Provider>;
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
  const report = useContext(MarksContext);
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const capturing = Boolean(session?.active && session.mode === 'region' && state);
  const drawn = Boolean(session?.open && state);
  useEffect(() => {
    const node = host.current;
    if (!drawn || !node) return;
    const measure = () => {
      const box = node.getBoundingClientRect();
      setSize((was) =>
        was?.width === box.width && was.height === box.height
          ? was
          : { width: box.width, height: box.height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [drawn]);
  // Element and text marks are drawn where the page last found them, on the page they were
  // made on; a region stays where it was drawn on the view, and only on the page it was drawn on.
  const here = pageAddress(state?.url);
  const pins = new Map<string, LayerMark>();
  if (session?.open && report && size && pageAddress(report.url) === here) {
    for (const item of report.marks) {
      const rect = item.found && item.rect ? viewRect(item.rect, size, report.viewport) : null;
      if (rect) pins.set(item.label, { label: item.label, rect, text: item.how === 'quote' });
    }
  }
  const shown: LayerMark[] = session?.open
    ? session.marks.flatMap((mark) => {
        if (mark.view) {
          const from = markPage(mark);
          const onPage = from.id === page.id && pageAddress(String(from.url ?? '')) === here;
          return onPage ? [{ label: mark.label, rect: mark.view }] : [];
        }
        const pin = followed(mark, page.id) ? pins.get(mark.label) : undefined;
        return pin ? [pin] : [];
      })
    : [];
  if (!session || !state || !drawn) return null;
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
        openByBadge
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
