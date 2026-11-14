import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useReducedMotionConfig } from 'motion/react';
import { useOverlayContainer } from '@/components/ui/overlay-container';
import { findTourAnchor } from '@/lib/onboarding/tour-anchors';
import { TOUR_STEPS, type TourPracticeEvent } from '@/lib/onboarding/tour-script';
import { TourOverlay } from './tour-overlay';

const loadPracticeStage = () => import('./tour-practice-stage');
const TourPracticeStage = lazy(() =>
  loadPracticeStage().then((module) => ({ default: module.TourPracticeStage })),
);

/** How often a step looks for its anchor and checks its wait. */
const POLL_MS = 250;
/** Lets the spotlight arrive before the step opens its menu. */
const OPEN_DELAY_MS = 450;
const OPEN_TIMEOUT_MS = 4000;
/** Pause on a finished action before the next step. */
const ADVANCE_MS = 900;
const ADVANCE_REDUCED_MS = 400;

/** What a step's `change` wait compares: the anchor's name, text and open disclosures. */
function anchorSignature(element: HTMLElement): string {
  return [
    element.getAttribute('aria-label') ?? '',
    element.textContent ?? '',
    element.querySelectorAll('[aria-expanded="true"], [data-state="open"]').length,
  ].join('\u0000');
}

const popperOpen = () =>
  Boolean(document.querySelector('[data-radix-popper-content-wrapper], [role="menu"]'));

/**
 * Opens the menu or picker a step teaches, the way a press would. Only
 * popup triggers are pressed, so the tour can never start an upload or a send.
 */
function openTrigger(element: HTMLElement) {
  if (!element.hasAttribute('aria-haspopup') || element.getAttribute('aria-expanded') === 'true')
    return;
  // Radix menus open on pointer down; popovers on click.
  element.dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }),
  );
  requestAnimationFrame(() => {
    if (element.getAttribute('aria-expanded') !== 'true') element.click();
  });
}

export function TourSession({
  index,
  onIndex,
  onFinish,
}: {
  index: number;
  onIndex: (index: number) => void;
  onFinish: (status: 'completed' | 'skipped') => void;
}) {
  const overlay = useOverlayContainer();
  // Toasts wait while the tour runs, so nothing covers its card (rule in index.css).
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.clioTour = '';
    return () => {
      delete root.dataset.clioTour;
    };
  }, []);
  const reduceMotion = Boolean(useReducedMotionConfig());
  const stageRef = useRef<HTMLDivElement>(null);
  const step = TOUR_STEPS[index]!;
  const last = index === TOUR_STEPS.length - 1;
  const [doneStep, setDoneStep] = useState<string>();
  const done = doneStep === step.id;
  const next = useCallback(
    () => (last ? onFinish('completed') : onIndex(index + 1)),
    [index, last, onFinish, onIndex],
  );

  // The app behind the tour is look-only: focus and clicks stay in the tour.
  useLayoutEffect(() => {
    const root = document.getElementById('root');
    if (!root || root.hasAttribute('inert')) return;
    root.setAttribute('inert', '');
    return () => root.removeAttribute('inert');
  }, []);

  useEffect(() => {
    // Capture on window runs before the app's own Escape handling. A menu or
    // popover the practice conversation opened closes first.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (popperOpen()) return;
      event.preventDefault();
      event.stopPropagation();
      onFinish('skipped');
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onFinish]);

  const scope = useCallback(
    (): ParentNode | null => (step.practice ? stageRef.current : document),
    [step.practice],
  );

  // The tour opens what the step teaches once the spotlight has arrived.
  useEffect(() => {
    if (!step.open || !step.anchor) return;
    const anchor = step.anchor;
    const started = performance.now();
    let timer = window.setTimeout(function tryOpen() {
      const root = scope();
      const element = root ? findTourAnchor(anchor, root) : undefined;
      if (element) openTrigger(element);
      else if (performance.now() - started < OPEN_TIMEOUT_MS)
        timer = window.setTimeout(tryOpen, POLL_MS);
    }, OPEN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [step, scope]);

  // Waits that watch the page: a changed control, or the learner exploring a chart.
  useEffect(() => {
    const wait = step.waitFor;
    const anchor = step.anchor;
    if (!anchor || (wait !== 'change' && wait !== 'interact')) return;
    let initial: string | undefined;
    let watched: HTMLElement | undefined;
    const interacted = () => setDoneStep(step.id);
    const timer = window.setInterval(() => {
      const root = scope();
      const element = root ? findTourAnchor(anchor, root) : undefined;
      if (!element) return;
      if (wait === 'interact') {
        if (watched === element) return;
        watched?.removeEventListener('wheel', interacted, true);
        watched?.removeEventListener('pointerdown', interacted, true);
        watched = element;
        element.addEventListener('wheel', interacted, { capture: true, passive: true });
        element.addEventListener('pointerdown', interacted, true);
        return;
      }
      const signature = anchorSignature(element);
      if (initial === undefined) initial = signature;
      else if (signature !== initial && !popperOpen()) {
        window.clearInterval(timer);
        setDoneStep(step.id);
      }
    }, POLL_MS);
    return () => {
      window.clearInterval(timer);
      watched?.removeEventListener('wheel', interacted, true);
      watched?.removeEventListener('pointerdown', interacted, true);
    };
  }, [step, scope]);

  const onPracticeEvent = useCallback(
    (event: TourPracticeEvent) => {
      if (event === step.waitFor) setDoneStep(step.id);
    },
    [step],
  );

  // A finished action moves on by itself; exploring a chart or reading what opened waits for Next.
  useEffect(() => {
    if (!done || step.waitFor === 'interact' || step.stay) return;
    const timer = window.setTimeout(next, reduceMotion ? ADVANCE_REDUCED_MS : ADVANCE_MS);
    return () => window.clearTimeout(timer);
  }, [done, next, reduceMotion, step.waitFor, step.stay]);

  const content = (
    <>
      {step.practice ? (
        <Suspense fallback={null}>
          <TourPracticeStage onEvent={onPracticeEvent} stageRef={stageRef} step={step} />
        </Suspense>
      ) : null}
      <TourOverlay
        count={TOUR_STEPS.length}
        done={done}
        index={index}
        onBack={() => onIndex(Math.max(0, index - 1))}
        onNext={next}
        onSkip={() => onFinish('skipped')}
        reduceMotion={reduceMotion}
        stageRef={stageRef}
        step={step}
      />
    </>
  );
  return overlay ? createPortal(content, overlay) : content;
}
