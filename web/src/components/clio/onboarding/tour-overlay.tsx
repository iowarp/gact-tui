import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { findTourAnchor } from '@/lib/onboarding/tour-anchors';
import { TOUR_SCRIPT_STATUS, type TourStep } from '@/lib/onboarding/tour-script';
import { cn } from '@/lib/utils';

const PAD = 6;
const GAP = 12;
const CARD_WIDTH = 352;
/** How long a missing anchor may still be mounting before the step is reported as degraded. */
const ANCHOR_GRACE_MS = 1500;

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
  const top = Math.max(rect.top - PAD, bounds?.top ?? 0, 0);
  const left = Math.max(rect.left - PAD, bounds?.left ?? 0, 0);
  const bottom = Math.min(rect.bottom + PAD, bounds?.bottom ?? Infinity, window.innerHeight);
  const right = Math.min(rect.right + PAD, bounds?.right ?? Infinity, window.innerWidth);
  return bottom - top > PAD && right - left > PAD
    ? { top, left, width: right - left, height: bottom - top }
    : undefined;
}

/** Follows the step's anchor every frame, so the spotlight tracks layout, scroll and resize. */
function useAnchorBox(step: TourStep, scope: RefObject<HTMLElement | null>, reduceMotion: boolean) {
  const [box, setBox] = useState<Box>();
  useLayoutEffect(() => {
    let frame = 0;
    // null until the first frame, so a step without an anchor clears the last step's box.
    let current: Box | undefined | null = null;
    let scrolled = false;
    const started = performance.now();
    let warned = false;
    const tick = () => {
      const root = step.stage === 'practice' ? (scope.current ?? undefined) : document;
      const element = step.anchor && root ? findTourAnchor(step.anchor, root) : undefined;
      if (element && !scrolled) {
        scrolled = true;
        element.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
      }
      if (!element && step.anchor && !warned && performance.now() - started > ANCHOR_GRACE_MS) {
        warned = true;
        if (import.meta.env.DEV)
          console.warn(
            `Onboarding tour: anchor "${step.anchor}" is not on screen; showing a centred card.`,
          );
      }
      const anchorRect = element?.getBoundingClientRect();
      // The practice note answers what the learner just did, so it stays lit with the anchor.
      const noteRect =
        anchorRect && root instanceof HTMLElement
          ? root.querySelector('[data-tour-note]')?.getBoundingClientRect()
          : undefined;
      const rect =
        anchorRect && noteRect
          ? DOMRect.fromRect({
              x: Math.min(anchorRect.left, noteRect.left),
              y: Math.min(anchorRect.top, noteRect.top),
              width:
                Math.max(anchorRect.right, noteRect.right) -
                Math.min(anchorRect.left, noteRect.left),
              height:
                Math.max(anchorRect.bottom, noteRect.bottom) -
                Math.min(anchorRect.top, noteRect.top),
            })
          : anchorRect;
      // A tall anchor inside the practice stage is clipped to what the stage shows.
      const bounds =
        root instanceof HTMLElement && root !== element ? root.getBoundingClientRect() : undefined;
      const next = rect ? visibleBox(rect, bounds) : undefined;
      if (current === null || !sameBox(current, next)) {
        current = next;
        setBox(next);
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [step, scope, reduceMotion]);
  return box;
}

/** Where the card sits: beside the spotlight when it fits, else over the bottom of it. */
function cardPosition(
  box: Box | undefined,
  cardHeight: number,
): { top: number; left: number } | undefined {
  if (!box) return undefined;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(CARD_WIDTH, vw - GAP * 2);
  const clampLeft = (left: number) => Math.min(Math.max(GAP, left), vw - width - GAP);
  const clampTop = (top: number) => Math.min(Math.max(GAP, top), vh - cardHeight - GAP);
  if (box.top + box.height + GAP + cardHeight <= vh - GAP)
    return { top: box.top + box.height + GAP, left: clampLeft(box.left) };
  if (box.top - GAP - cardHeight >= GAP)
    return { top: box.top - GAP - cardHeight, left: clampLeft(box.left) };
  if (box.left + box.width + GAP + width <= vw - GAP)
    return { top: clampTop(box.top), left: box.left + box.width + GAP };
  if (box.left - GAP - width >= GAP)
    return { top: clampTop(box.top), left: box.left - GAP - width };
  return { top: vh - cardHeight - GAP, left: clampLeft(box.left + box.width / 2 - width / 2) };
}

export interface TourOverlayProps {
  step: TourStep;
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
  index,
  count,
  stageRef,
  reduceMotion,
  onBack,
  onNext,
  onSkip,
}: TourOverlayProps) {
  const box = useAnchorBox(step, stageRef, reduceMotion);
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
  const position = cardPosition(box, cardHeight);
  const last = index === count - 1;
  const titleId = `tour-step-${step.id}-title`;
  const bodyId = `tour-step-${step.id}-body`;
  const transition = reduceMotion
    ? undefined
    : 'transition-[top,left,width,height] duration-200 ease-out motion-reduce:transition-none';

  return (
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
      <div
        aria-describedby={bodyId}
        aria-labelledby={titleId}
        aria-modal="false"
        className={cn(
          'pointer-events-auto fixed rounded-xl bg-popover p-4 text-sm text-popover-foreground shadow-xl ring-1 ring-foreground/10 outline-none',
          position ? undefined : 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
        )}
        data-tour-card=""
        {...(box ? {} : { 'data-tour-fallback': step.anchor ?? 'none' })}
        data-tour-step={step.id}
        ref={card}
        role="dialog"
        style={{ width: `min(${CARD_WIDTH}px, calc(100vw - ${GAP * 2}px))`, ...position }}
        tabIndex={-1}
      >
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            Step {index + 1} of {count}
          </span>
          {TOUR_SCRIPT_STATUS === 'draft' ? (
            <span className="rounded border border-border px-1.5 py-px text-[11px]">Draft</span>
          ) : null}
        </p>
        <h2 className="mt-1.5 text-base font-medium" id={titleId}>
          {step.title}
        </h2>
        <div id={bodyId}>
          <p className="mt-1 text-muted-foreground">{step.body}</p>
          {step.tryIt ? (
            <p className="mt-2">
              <span className="font-medium">Try it: </span>
              {step.tryIt}
            </p>
          ) : null}
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
    </div>
  );
}
