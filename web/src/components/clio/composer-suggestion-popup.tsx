import {
  useEffect,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useOverlayContainer } from '@/components/ui/overlay-container';
import { cn } from '@/lib/utils';

/** Tallest a composer suggestion menu grows before its list scrolls (pickers spec, 380px). */
export const COMPOSER_POPUP_MAX_HEIGHT_PX = 380;
/** Space between the composer box and the menu above it. */
const POPUP_GAP_PX = 6;
/** Below this window width the menu spans the window instead of the composer. */
const NARROW_WINDOW_PX = 480;

/**
 * A menu group heading, as the pickers spec renders `.pgh` (:1115): 42px tall with the 11px
 * label centred below 9px of padding. The spec's height comes from its 30px count cell, so
 * the last row of one group sits about 40px above the next label.
 */
export const COMPOSER_GROUP_HEADING =
  'flex h-[42px] min-w-0 items-center gap-[7px] px-2 pt-[9px] pb-[3px] text-caption leading-[1.4] font-semibold whitespace-nowrap text-muted-foreground';

/** The typed text inside a row's name, in the accent. */
export function Highlighted({ text, query }: { text: string; query: string }): ReactNode {
  const at = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark className="bg-transparent font-semibold text-accent-foreground">
        {text.slice(at, at + query.length)}
      </mark>
      {text.slice(at + query.length)}
    </>
  );
}
/** Marks the parts of a row's one line that the detail strip completes when they are cut. */
export const ROW_CUT_SLOT = 'suggestion-row-cut';

/** Whether any marked part of the row is cut by its ellipsis. */
function rowIsCut(rowId: string): boolean {
  const row = document.getElementById(rowId);
  if (!row) return false;
  for (const part of row.querySelectorAll<HTMLElement>(`[data-slot="${ROW_CUT_SLOT}"]`))
    if (part.scrollWidth > part.clientWidth + 1) return true;
  return false;
}

/**
 * The whole name and description of the highlighted (or pointed-at) row, shown
 * only when the strip says more than the row: its one 30px line cuts the name or
 * description, or the menu has words the row leaves out (`more`). Whether the row
 * is cut is read once per described row and written straight to the strip, so
 * moving the highlight never renders the menu twice. Screen readers already hear
 * the name and description from the option's label.
 */
export function SuggestionDetail({
  description,
  mono,
  more = false,
  name,
  rowId,
}: {
  description: string;
  mono?: boolean;
  /** The description holds words the row does not show. */
  more?: boolean;
  name: string;
  /** The described option, whose cut parts carry ROW_CUT_SLOT. */
  rowId: string;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (strip) strip.hidden = !more && !rowIsCut(rowId);
  }, [description, more, name, rowId]);
  return (
    <div
      aria-hidden="true"
      className="shrink-0 border-t px-2.5 py-1.5 text-label leading-[1.45] text-muted-foreground"
      data-slot="composer-suggestion-detail"
      hidden
      ref={stripRef}
    >
      <p className="line-clamp-3 [overflow-wrap:anywhere]">
        <span
          className={cn(
            'mr-2 font-medium text-foreground',
            mono && 'font-mono text-caption font-normal',
          )}
        >
          {name}
        </span>
        {description}
      </p>
    </div>
  );
}

/** The field's faint count, a bare number as drawn; the word is for screen readers. */
export function MatchCount({ total }: { total: number }) {
  return (
    <span className="ml-1 shrink-0 font-mono text-caption text-faint tabular-nums">
      {total}
      <span className="sr-only">{total === 1 ? ' match' : ' matches'}</span>
    </span>
  );
}

/**
 * The composer box that `@` and `/` menus open above: the box around the
 * editor whose `aria-controls` names the popup, or the editor itself.
 */
function composerAnchor(popupId: string): Element | null {
  const editor = document.querySelector(`[aria-controls="${popupId}"]`);
  return editor?.closest('[data-slot="clio-composer"]') ?? editor;
}

/**
 * The lowest edge of the window's title bar and the pane headers above the
 * composer: the headers beside its ancestors, never the transcript's contents.
 */
function headerBottom(anchor: Element): number {
  let bottom = 0;
  for (let node: Element | null = anchor; node; node = node.parentElement) {
    for (
      let sibling = node.previousElementSibling;
      sibling;
      sibling = sibling.previousElementSibling
    ) {
      if (sibling.tagName === 'HEADER')
        bottom = Math.max(bottom, sibling.getBoundingClientRect().bottom);
    }
  }
  return bottom;
}

/**
 * A suggestion menu that opens above the composer, as wide as its box, in the
 * shared overlay host. It is positioned with one measurement when it opens and
 * again only when the composer box resizes or the window changes, written
 * straight to the popup's style so moving it never re-renders its rows.
 */
export function ComposerSuggestionPopup({
  children,
  className,
  onDismiss,
  popupId,
}: {
  children: ReactNode;
  className?: string;
  /** Escape inside the popup, or a press anywhere outside it. */
  onDismiss?: () => void;
  /** The id the editor's `aria-controls` names. */
  popupId: string;
}) {
  const container = useOverlayContainer();
  const popupRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const popup = popupRef.current;
    const anchor = composerAnchor(popupId);
    if (!popup || !anchor) return;
    let placed = '';
    // Headers do not move while the menu is open; the composer may.
    const top = headerBottom(anchor);
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const viewport = window.innerWidth;
      const narrow = viewport < NARROW_WINDOW_PX;
      const left = narrow ? viewport * 0.01 : rect.left;
      const width = narrow ? viewport * 0.98 : rect.width;
      const bottom = window.innerHeight - rect.top + POPUP_GAP_PX;
      // Never taller than the room between the headers and the composer; the
      // list scrolls inside.
      const maxHeight = Math.max(
        0,
        Math.min(COMPOSER_POPUP_MAX_HEIGHT_PX, rect.top - Math.max(top, 0) - POPUP_GAP_PX * 2),
      );
      const next = `${left}|${width}|${bottom}|${maxHeight}`;
      if (next === placed) return;
      placed = next;
      popup.style.left = `${left}px`;
      popup.style.width = `${width}px`;
      popup.style.bottom = `${bottom}px`;
      popup.style.maxHeight = `${maxHeight}px`;
    };
    place();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(place);
    observer?.observe(anchor);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, { capture: true, passive: true });
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, { capture: true });
    };
  }, [popupId]);

  // Not a focus trap and no backdrop, so a press anywhere else closes it. A
  // press in the editor only moves its caret, which decides for itself whether
  // a mention is still open. `pointerdown` rather than `click` so a press on a
  // control outside dismisses before that control reacts.
  useEffect(() => {
    if (!onDismiss) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (popupRef.current?.contains(target)) return;
      if (document.querySelector(`[aria-controls="${popupId}"]`)?.contains(target)) return;
      onDismiss();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [onDismiss, popupId]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || !onDismiss) return;
    event.preventDefault();
    event.stopPropagation();
    onDismiss();
  };

  return createPortal(
    // Keys reach it only from its own controls (a search box, a group heading).
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className={cn(
        'fixed z-50 flex min-w-0 flex-col overflow-hidden rounded-xl bg-popover text-menu text-popover-foreground shadow-md ring-1 ring-foreground/10',
        className,
      )}
      data-slot="composer-suggestions"
      id={popupId}
      onKeyDown={onKeyDown}
      ref={popupRef}
      style={{ bottom: 0, left: 0, maxHeight: COMPOSER_POPUP_MAX_HEIGHT_PX }}
    >
      {children}
    </div>,
    container ?? document.body,
  );
}
