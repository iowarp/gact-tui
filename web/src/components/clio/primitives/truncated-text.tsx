import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import {
  fullTextOf,
  truncatedTextAt,
  truncatedTextForFocus,
} from '@/lib/truncation';

/** The app's tooltip delay (TooltipProvider), so every hover name reads alike. */
const HINT_DELAY_MS = 450;
/** Moving straight from one cut text to the next shows it at once. */
const HINT_WARM_MS = 300;
const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 6;

interface Hint {
  text: string;
  anchor: DOMRect;
}

/**
 * The app-wide rule: text may be cut, but never unreadable. Mounted once, it
 * shows the whole text of any ellipsized or line-clamped text under the
 * pointer, or inside the control keyboard focus lands on (or that control's
 * row), and only while something is actually cut. A surface opts out with
 * `data-truncation-hint="off"`; a cut element with a different full text
 * (a compact label) names it in `data-full-text`; a line whose parts are one
 * text (a state and a name) is marked `data-truncation-scope` and reads whole.
 */
export function TruncationHints() {
  const [hint, setHint] = useState<Hint | null>(null);
  const shownRef = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current: HTMLElement | null = null;
    let hiddenAt = 0;

    const hide = () => {
      clearTimeout(timer);
      if (current || shownRef.current) hiddenAt = performance.now();
      current = null;
      shownRef.current = false;
      setHint(null);
    };
    const schedule = (anchor: HTMLElement, read: () => string | null, place = anchor) => {
      clearTimeout(timer);
      current = anchor;
      const warm = shownRef.current || performance.now() - hiddenAt < HINT_WARM_MS;
      timer = setTimeout(
        () => {
          if (current !== anchor || !anchor.isConnected) return;
          const text = read();
          if (!text) return;
          shownRef.current = true;
          setHint({ text, anchor: place.getBoundingClientRect() });
        },
        warm ? 0 : HINT_DELAY_MS,
      );
    };

    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const cut = truncatedTextAt(event.target);
      if (cut === current) return;
      if (!cut) {
        if (current) hide();
        return;
      }
      if (shownRef.current) setHint(null);
      schedule(cut, () => fullTextOf(cut));
    };
    const onPointerOut = (event: PointerEvent) => {
      if (!current) return;
      const next = event.relatedTarget;
      if (next instanceof Node && current.contains(next)) return;
      hide();
    };
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.matches(':focus-visible')) return;
      const cut = truncatedTextForFocus(target);
      if (cut.length === 0) {
        if (current) hide();
        return;
      }
      if (shownRef.current) setHint(null);
      const last = cut.at(-1) ?? target;
      schedule(
        target,
        () =>
          Array.from(new Set(cut.filter((element) => element.isConnected).map(fullTextOf)))
            .filter(Boolean)
            .join('\n'),
        // A row's cut text sits beside the control: show the hint under it, clear of the control's name.
        target.contains(last) ? target : last,
      );
    };
    const onFocusOut = (event: FocusEvent) => {
      if (current && event.target === current) hide();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && shownRef.current) hide();
    };

    document.addEventListener('pointerover', onPointerOver, true);
    document.addEventListener('pointerout', onPointerOut, true);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('scroll', hide, { capture: true, passive: true });
    window.addEventListener('resize', hide);
    window.addEventListener('blur', hide);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerover', onPointerOver, true);
      document.removeEventListener('pointerout', onPointerOut, true);
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', onFocusOut, true);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', hide, true);
      document.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
      window.removeEventListener('blur', hide);
    };
  }, []);

  if (!hint) return null;
  return createPortal(
    <TruncationHintBubble hint={hint} />,
    document.fullscreenElement ?? document.body,
  );
}

/** The tooltip itself: the app's tooltip look, under the cut text or above it. */
function TruncationHintBubble({ hint }: { hint: Hint }) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const bubble = ref.current;
    if (!bubble) return;
    const { width, height } = bubble.getBoundingClientRect();
    const { anchor } = hint;
    const below = anchor.bottom + ANCHOR_GAP;
    const top =
      below + height <= window.innerHeight - VIEWPORT_MARGIN
        ? below
        : Math.max(VIEWPORT_MARGIN, anchor.top - ANCHOR_GAP - height);
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, anchor.left),
      window.innerWidth - VIEWPORT_MARGIN - width,
    );
    setPosition({ top, left: Math.max(VIEWPORT_MARGIN, left) });
  }, [hint]);

  return (
    <div
      className="pointer-events-none fixed w-max max-w-[min(32rem,calc(100vw-16px))] rounded-md bg-foreground px-3 py-1.5 text-xs leading-[1.45] break-words whitespace-pre-wrap text-background shadow-md"
      data-slot="truncation-hint"
      ref={ref}
      role="tooltip"
      style={
        position
          ? { top: position.top, left: position.left }
          : { top: 0, left: 0, visibility: 'hidden' }
      }
    >
      {hint.text}
    </div>
  );
}

export interface TruncatedTextProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  /** Lines shown before the cut: 1 is an ellipsis, more is a line clamp. */
  lines?: number;
  /** The whole text, when the shown content is not it (a composed label). */
  fullText?: string;
  /** Whether the text shows whole instead of cut (an expanded notice). */
  expanded?: boolean;
}

/**
 * Text cut to `lines` with an ellipsis, readable whole through the app-wide
 * truncation hint; `expanded` lets a surface with its own Show more control
 * show it all.
 */
export const TruncatedText = forwardRef<HTMLSpanElement, TruncatedTextProps>(function TruncatedText(
  { children, className, expanded = false, fullText, lines = 1, style, ...rest },
  ref,
) {
  return (
    <span
      className={cn(
        'min-w-0',
        expanded
          ? 'break-words whitespace-normal'
          : lines === 1
            ? 'truncate'
            : 'overflow-hidden break-words whitespace-normal',
        className,
      )}
      data-full-text={fullText}
      data-slot="truncated-text"
      ref={ref}
      style={
        !expanded && lines > 1
          ? {
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: lines,
              ...style,
            }
          : style
      }
      {...rest}
    >
      {children}
    </span>
  );
});
