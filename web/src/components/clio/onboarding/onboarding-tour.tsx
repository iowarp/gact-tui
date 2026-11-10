import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useReducedMotionConfig } from 'motion/react';
import { useOverlayContainer } from '@/components/ui/overlay-container';
import { useRepository } from '@/hooks/use-repository';
import { firstRunStep, readTourRecord, writeTourRecord } from '@/lib/onboarding/first-run';
import { OnboardingTourContext } from '@/lib/onboarding/tour-context';
import { ONBOARDING_TOUR_ENABLED } from '@/lib/onboarding/tour-flag';
import { findTourAnchor } from '@/lib/onboarding/tour-anchors';
import { TOUR_STEPS, type TourPracticeEvent } from '@/lib/onboarding/tour-script';
import { PRIMARY_SESSION_KINDS } from '@/lib/recent-sessions';
import { isSettingsRoute } from '@/lib/settings-window-route';
import { useConnectionSettings } from '@/providers/connection-provider';
import { TourOverlay } from './tour-overlay';

const loadPracticeStage = () => import('./tour-practice-stage');
const TourPracticeStage = lazy(() =>
  loadPracticeStage().then((module) => ({ default: module.TourPracticeStage })),
);

/** Poll interval while another window (What's New, a dialog) is still open. */
const WAIT_MS = 500;
/** How often a step looks for its anchor and checks its wait. */
const POLL_MS = 250;
/** Lets the spotlight arrive before the step opens its menu. */
const OPEN_DELAY_MS = 450;
const OPEN_TIMEOUT_MS = 4000;
/** Pause on a finished action before the next step. */
const ADVANCE_MS = 900;
const ADVANCE_REDUCED_MS = 400;

/**
 * Hosts the onboarding tour: starts it on a fresh install, replays it from
 * Settings, and renders nothing at all while the release flag is off.
 */
export function OnboardingTourProvider({ children }: { children: ReactNode }) {
  if (!ONBOARDING_TOUR_ENABLED) return children;
  return <EnabledOnboardingTour>{children}</EnabledOnboardingTour>;
}

function EnabledOnboardingTour({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [requested, setRequested] = useState(false);
  const [index, setIndex] = useState<number>();
  // A fresh install may still start the tour: hold other first-run prompts until it's decided.
  const [deciding, setDeciding] = useState(
    () => firstRunStep(readTourRecord()) === 'check-service',
  );
  const active = index !== undefined;
  const start = useCallback(() => {
    void loadPracticeStage();
    setIndex(undefined);
    setRequested(true);
  }, []);
  const decided = useCallback(() => setDeciding(false), []);
  useFirstRunStart(start, decided, active || requested);

  const overSettings = isSettingsRoute(location.pathname);
  useEffect(() => {
    if (!requested || overSettings) return;
    // Wait for Settings or any other dialog to finish closing.
    const timer = window.setInterval(() => {
      if (document.querySelector('[data-slot="dialog-content"], [role="alertdialog"]')) return;
      window.clearInterval(timer);
      setRequested(false);
      setIndex(0);
    }, WAIT_MS);
    return () => window.clearInterval(timer);
  }, [requested, overSettings]);

  const finish = useCallback((status: 'completed' | 'skipped') => {
    writeTourRecord({
      install: readTourRecord()?.install ?? 'existing',
      status,
      at: new Date().toISOString(),
    });
    setIndex(undefined);
  }, []);

  const holdPrompts = active || requested || deciding;
  const controls = useMemo(() => ({ start, active, holdPrompts }), [start, active, holdPrompts]);
  return (
    <OnboardingTourContext.Provider value={controls}>
      {children}
      {active ? <TourSession index={index} onFinish={finish} onIndex={setIndex} /> : null}
    </OnboardingTourContext.Provider>
  );
}

/**
 * Starts the tour once on a fresh install: no app data on this device before
 * this launch (`first-run.ts`) and no conversations on the connected service.
 */
function useFirstRunStart(start: () => void, decided: () => void, busy: boolean) {
  const { credentialsReady } = useConnectionSettings();
  const repository = useRepository();
  const location = useLocation();
  const onWorkspace = location.pathname.startsWith('/workspaces/');
  const checked = useRef(false);
  useEffect(() => {
    if (checked.current || busy || !credentialsReady || !onWorkspace) return;
    checked.current = true;
    if (firstRunStep(readTourRecord()) !== 'check-service') {
      decided();
      return;
    }
    repository
      .sessionPage({ kinds: PRIMARY_SESSION_KINDS, limit: 1 })
      .then((page) => {
        if (page.sessions.length > 0) writeTourRecord({ install: 'existing' });
        else start();
      })
      // Unknown: the record stays `new`, so the next launch asks again.
      .catch(() => undefined)
      .finally(decided);
  }, [busy, credentialsReady, decided, onWorkspace, repository, start]);
}

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

function TourSession({
  index,
  onIndex,
  onFinish,
}: {
  index: number;
  onIndex: (index: number) => void;
  onFinish: (status: 'completed' | 'skipped') => void;
}) {
  const overlay = useOverlayContainer();
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

  // A finished action moves on by itself; exploring a chart waits for Next.
  useEffect(() => {
    if (!done || step.waitFor === 'interact') return;
    const timer = window.setTimeout(next, reduceMotion ? ADVANCE_REDUCED_MS : ADVANCE_MS);
    return () => window.clearTimeout(timer);
  }, [done, next, reduceMotion, step.waitFor]);

  const content = (
    <>
      {/* Toasts wait while the tour runs, so nothing covers its card. */}
      <style>{'[data-sonner-toaster]{display:none!important}'}</style>
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
