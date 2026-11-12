import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { CheckIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { findTourAnchor } from '@/lib/onboarding/tour-anchors';
import { TOUR_SCRIPT_STATUS, type TourStep } from '@/lib/onboarding/tour-script';
import { cn } from '@/lib/utils';

const PAD = 6;
const GAP = 12;
const CARD_WIDTH = 352;
/** Narrowest the card gets to stay beside the spotlight instead of over it. */
const MIN_CARD_WIDTH = 256;
/** The spotlight ring's width. */
const RING = 2;
/** How long a missing anchor may still be mounting before the step is reported as degraded. */
const ANCHOR_GRACE_MS = 1500;
/** Frames the scroller must hold still before a step's focus is scrolled into view. */
const SETTLED_FRAMES = 6;

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

function sameBox(a: Box | undefined, b: Box | undefined): boolean {
  return (
    a === b ||
    Boolean(
      a &&
        b &&
        a.top === b.top &&
        a.left === b.left &&
        a.width === b.width &&
        a.height === b.height,
    )
  );
}

function visibleBox(rect: DOMRect, bounds: DOMRect | undefined): Box | undefined {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // The ring draws outside the box, so it keeps RING px clear of the window's edges.
  // Something flush with an edge gets an inset ring on every side, not a lopsided one.
  const edge = Math.min(rect.top, rect.left, vw - rect.right, vh - rect.bottom);
  const pad = Math.min(PAD, Math.max(-RING, edge - RING));
  const top = Math.max(rect.top - pad, bounds?.top ?? 0, RING);
  const left = Math.max(rect.left - pad, bounds?.left ?? 0, RING);
  const bottom = Math.min(rect.bottom + pad, bounds?.bottom ?? Infinity, vh - RING);
  const right = Math.min(rect.right + pad, bounds?.right ?? Infinity, vw - RING);
  return bottom - top > PAD && right - left > PAD
    ? { top, left, width: right - left, height: bottom - top }
    : undefined;
}

/** Open menus and pickers (not tooltips), as boxes. */
function openPopups(): Box[] {
  const boxes: Box[] = [];
  for (const wrapper of document.querySelectorAll('[data-radix-popper-content-wrapper]')) {
    if (!wrapper.querySelector('[role="menu"], [role="dialog"], [role="listbox"]')) continue;
    const box = visibleBox(wrapper.getBoundingClientRect(), undefined);
    if (box) boxes.push(box);
  }
  return boxes;
}

function unionBox(a: Box, b: Box): Box {
  const top = Math.min(a.top, b.top);
  const left = Math.min(a.left, b.left);
  return {
    top,
    left,
    width: Math.max(a.left + a.width, b.left + b.width) - left,
    height: Math.max(a.top + a.height, b.top + b.height) - top,
  };
}

/** The nearest ancestor that scrolls `element`, whose edges clip what of it shows. */
function scrollerOf(element: HTMLElement | undefined): HTMLElement | undefined {
  for (let node = element?.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
  }
  return undefined;
}

function intersect(a: DOMRect | undefined, b: DOMRect | undefined): DOMRect | undefined {
  if (!a || !b) return a ?? b;
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  return new DOMRect(
    left,
    top,
    Math.max(0, Math.min(a.right, b.right) - left),
    Math.max(0, Math.min(a.bottom, b.bottom) - top),
  );
}

/** Follows the step's anchor every frame, so the spotlight tracks layout, scroll and resize. */
function useAnchorBox(step: TourStep, scope: RefObject<HTMLElement | null>, reduceMotion: boolean) {
  const [boxes, setBoxes] = useState<{ box?: Box; focus?: Box }>({});
  useLayoutEffect(() => {
    let frame = 0;
    // null until the first frame, so a step without an anchor clears the last step's box.
    let current: Box | undefined | null = null;
    let currentFocus: Box | undefined;
    let scrolledHeight: number | undefined;
    let focusScrolled = false;
    let stillFrames = 0;
    let lastScrollTop: number | undefined;
    let measured: HTMLElement | undefined;
    let scroller: HTMLElement | undefined;
    const started = performance.now();
    let warned = false;
    const tick = () => {
      const root = step.practice ? (scope.current ?? undefined) : document;
      const element = step.anchor && root ? findTourAnchor(step.anchor, root) : undefined;
      // Scrolled into view once, and again when it grows (a row opened under it).
      const height = element?.offsetHeight ?? 0;
      if (element && (scrolledHeight === undefined || height > scrolledHeight + 24)) {
        scrolledHeight = height;
        focusScrolled = false;
        stillFrames = 0;
        element.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
      }
      if (element !== measured) {
        measured = element;
        scroller = scrollerOf(element);
      }
      if (!element && step.anchor && !warned && performance.now() - started > ANCHOR_GRACE_MS) {
        warned = true;
        if (import.meta.env.DEV)
          console.warn(
            `Onboarding tour: anchor "${step.anchor}" is not on screen; showing a centred card.`,
          );
      }
      // A tall anchor is clipped to what the practice stage and its scroller show,
      // and in practice, to the transcript above the composer that floats over it.
      const composerElement =
        step.practice && root instanceof HTMLElement ? findTourAnchor('composer', root) : undefined;
      const composer =
        composerElement && element && !composerElement.contains(element)
          ? composerElement.getBoundingClientRect()
          : undefined;
      const shown = intersect(
        root instanceof HTMLElement && root !== element ? root.getBoundingClientRect() : undefined,
        scroller?.getBoundingClientRect(),
      );
      const bounds =
        shown &&
        composer &&
        composer.top > shown.top &&
        composer.top < shown.bottom &&
        composer.left < shown.right &&
        composer.right > shown.left
          ? new DOMRect(shown.left, shown.top, shown.width, composer.top - shown.top)
          : shown;
      const anchorBox = element ? visibleBox(element.getBoundingClientRect(), bounds) : undefined;
      // A menu or picker the step opened stays lit with its control.
      const next = anchorBox ? openPopups().reduce(unionBox, anchorBox) : undefined;
      const focusElement = step.focus ? element?.querySelector(step.focus) : undefined;
      // The transcript's opaque control lane ("Jump to latest") also hides what is under it.
      const lane = scroller?.querySelector('[data-slot="transcript-control-lane"]');
      const laneTop = lane?.getBoundingClientRect().top;
      const focusBounds =
        bounds && laneTop !== undefined && laneTop > bounds.top && laneTop < bounds.bottom
          ? new DOMRect(bounds.left, bounds.top, bounds.width, laneTop - bounds.top)
          : bounds;
      // The part the step asks you to use is scrolled into view, top first, since a tall
      // anchor scrolled into view shows only its top. It waits for the anchor's own scroll
      // to settle, so it measures the final position and doesn't cancel that scroll.
      if (focusElement && focusBounds && scroller && !focusScrolled) {
        stillFrames = scroller.scrollTop === lastScrollTop ? stillFrames + 1 : 0;
        lastScrollTop = scroller.scrollTop;
        if (stillFrames >= SETTLED_FRAMES) {
          focusScrolled = true;
          const rect = focusElement.getBoundingClientRect();
          const above = rect.top - focusBounds.top;
          const below = rect.bottom - focusBounds.bottom;
          const delta = below > 0 ? Math.min(below, above) : Math.min(above, 0);
          if (Math.abs(delta) > 1)
            scroller.scrollBy({ top: delta, behavior: reduceMotion ? 'auto' : 'smooth' });
        }
      }
      const focus = focusElement
        ? visibleBox(focusElement.getBoundingClientRect(), focusBounds)
        : undefined;
      if (current === null || !sameBox(current, next) || !sameBox(currentFocus, focus)) {
        current = next;
        currentFocus = focus;
        setBoxes({ box: next, focus });
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [step, scope, reduceMotion]);
  return boxes;
}

interface CardPlacement {
  top: number;
  left: number;
  width: number;
}

/**
 * Where the card sits: below, above, right or left of the spotlight, narrowing
 * to fit a side. With no room on any side it goes where it covers the least
 * of the step's focus, then of the spotlight, so what the step asks you to use
 * stays reachable.
 */
function cardPosition(
  box: Box | undefined,
  cardHeight: number,
  focus?: Box,
): CardPlacement | undefined {
  if (!box) return undefined;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const full = Math.min(CARD_WIDTH, vw - GAP * 2);
  const clampLeft = (left: number, width: number) =>
    Math.min(Math.max(GAP, left), vw - width - GAP);
  const clampTop = (top: number) => Math.min(Math.max(GAP, top), vh - cardHeight - GAP);
  const right = box.left + box.width;
  const bottom = box.top + box.height;
  if (bottom + GAP + cardHeight <= vh - GAP)
    return { top: bottom + GAP, left: clampLeft(box.left, full), width: full };
  if (box.top - GAP - cardHeight >= GAP)
    return { top: box.top - GAP - cardHeight, left: clampLeft(box.left, full), width: full };
  const roomRight = vw - GAP - right - GAP;
  const roomLeft = box.left - GAP - GAP;
  if (Math.max(roomRight, roomLeft) >= Math.min(MIN_CARD_WIDTH, full)) {
    const width = Math.min(full, Math.max(roomRight, roomLeft));
    return roomRight >= roomLeft
      ? { top: clampTop(box.top), left: right + GAP, width }
      : { top: clampTop(box.top), left: box.left - GAP - width, width };
  }
  const candidates: CardPlacement[] = [
    { top: clampTop(bottom + GAP), left: clampLeft(box.left, full), width: full },
    { top: clampTop(box.top - GAP - cardHeight), left: clampLeft(box.left, full), width: full },
    { top: clampTop(box.top), left: clampLeft(right + GAP, full), width: full },
    { top: clampTop(box.top), left: clampLeft(box.left - GAP - full, full), width: full },
  ];
  const overlap = ({ top, left, width }: CardPlacement, area: Box | undefined) =>
    area
      ? Math.max(0, Math.min(left + width, area.left + area.width) - Math.max(left, area.left)) *
        Math.max(0, Math.min(top + cardHeight, area.top + area.height) - Math.max(top, area.top))
      : 0;
  const worse = (a: CardPlacement, b: CardPlacement) =>
    overlap(a, focus) - overlap(b, focus) || overlap(a, box) - overlap(b, box);
  return candidates.reduce((best, next) => (worse(next, best) < 0 ? next : best));
}

/** The least of a spotlight left lit beside the card before the card may cover it instead. */
const MIN_LIT = 48;

/**
 * A card with no room beside the spotlight stacks over one end of it (a phone's
 * full-height practice stage). The lit area then starts past the card, so the card
 * never covers what the spotlight shows.
 */
function clearOfCard(
  box: Box | undefined,
  card: CardPlacement | undefined,
  cardHeight: number,
): Box | undefined {
  if (!box || !card) return box;
  const bottom = box.top + box.height;
  const cardBottom = card.top + cardHeight;
  const covers =
    card.left < box.left + box.width &&
    card.left + card.width > box.left &&
    card.top < bottom &&
    cardBottom > box.top;
  if (!covers) return box;
  if (card.top <= box.top) {
    const top = cardBottom + GAP;
    return bottom - top >= MIN_LIT ? { ...box, top, height: bottom - top } : box;
  }
  if (cardBottom >= bottom) {
    const end = card.top - GAP;
    return end - box.top >= MIN_LIT ? { ...box, height: end - box.top } : box;
  }
  return box;
}

export interface TourOverlayProps {
  step: TourStep;
  /** The learner did what the step asked. */
  done: boolean;
  index: number;
  count: number;
  stageRef: RefObject<HTMLElement | null>;
  reduceMotion: boolean;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}

/** The one spotlight and step card every tour step uses. */
export function TourOverlay({
  step,
  done,
  index,
  count,
  stageRef,
  reduceMotion,
  onBack,
  onNext,
  onSkip,
}: TourOverlayProps) {
  const { box: anchorBox, focus } = useAnchorBox(step, stageRef, reduceMotion);
  const card = useRef<HTMLDivElement>(null);
  const [cardHeight, setCardHeight] = useState(180);
  useLayoutEffect(() => {
    const element = card.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setCardHeight(element.offsetHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    card.current?.focus({ preventScroll: true });
  }, [step.id]);
  const position = cardPosition(anchorBox, cardHeight, focus);
  const box = clearOfCard(anchorBox, position, cardHeight);
  const last = index === count - 1;
  const titleId = `tour-step-${step.id}-title`;
  const bodyId = `tour-step-${step.id}-body`;
  const transition = reduceMotion
    ? undefined
    : 'transition-[top,left,width,height] duration-200 ease-out motion-reduce:transition-none';

  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-[45]" data-tour-overlay="">
        {box ? (
          <>
            <div
              className={cn('pointer-events-auto fixed inset-x-0 top-0 bg-scrim', transition)}
              style={{ height: Math.max(0, box.top) }}
            />
            <div
              className={cn('pointer-events-auto fixed inset-x-0 bottom-0 bg-scrim', transition)}
              style={{ top: box.top + box.height }}
            />
            <div
              className={cn('pointer-events-auto fixed left-0 bg-scrim', transition)}
              style={{ top: box.top, height: box.height, width: Math.max(0, box.left) }}
            />
            <div
              className={cn('pointer-events-auto fixed right-0 bg-scrim', transition)}
              style={{ top: box.top, height: box.height, left: box.left + box.width }}
            />
            <div
              aria-hidden="true"
              className={cn('fixed rounded-lg ring-2 ring-primary', transition)}
              style={box}
            />
          </>
        ) : (
          <div className="pointer-events-auto fixed inset-0 bg-scrim" />
        )}
      </div>
      {/* Above menus and the model picker's dim (110), beside what they show. */}
      <div
        aria-describedby={bodyId}
        aria-labelledby={titleId}
        aria-modal="false"
        className={cn(
          'pointer-events-auto fixed z-[120] rounded-[10px] border border-border bg-popover p-4 text-ui leading-[1.45] text-popover-foreground shadow-xl outline-none',
          position ? undefined : 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
        )}
        data-tour-card=""
        {...(box ? {} : { 'data-tour-fallback': step.anchor ?? 'none' })}
        data-tour-step={step.id}
        ref={card}
        role="dialog"
        style={position ?? { width: `min(${CARD_WIDTH}px, calc(100vw - ${GAP * 2}px))` }}
        tabIndex={-1}
      >
        <p className="flex items-center gap-2 text-label text-muted-foreground">
          <span>
            Step {index + 1} of {count}
          </span>
          {TOUR_SCRIPT_STATUS === 'draft' ? (
            <span className="rounded border border-border px-1.5 py-px text-caption">Draft</span>
          ) : null}
        </p>
        <h2 className="mt-1 text-[14px] font-medium" id={titleId}>
          {step.title}
        </h2>
        <div id={bodyId}>
          <p className="mt-1 text-muted-foreground">{step.body}</p>
          {step.tryIt && !done ? (
            <p className="mt-2">
              <span className="font-medium">Try it: </span>
              {step.tryIt}
            </p>
          ) : null}
          <p aria-live="polite" className="mt-2 flex items-center gap-1.5 empty:hidden">
            {done ? (
              <>
                <CheckIcon aria-hidden="true" className="size-4 text-primary" />
                <span className="font-medium">
                  {step.waitFor === 'interact' || step.stay
                    ? 'Done. Keep exploring, or press Next.'
                    : 'Done'}
                </span>
              </>
            ) : null}
          </p>
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          {last ? (
            <span />
          ) : (
            <Button onClick={onSkip} size="sm" variant="ghost">
              Skip tour
            </Button>
          )}
          <div className="flex gap-2">
            {index > 0 ? (
              <Button onClick={onBack} size="sm" variant="outline">
                Back
              </Button>
            ) : null}
            <Button onClick={onNext} size="sm">
              {last ? 'Done' : 'Next'}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
