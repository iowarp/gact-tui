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
import { TOUR_STEPS } from '@/lib/onboarding/tour-script';
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
  const active = index !== undefined;
  const start = useCallback(() => {
    void loadPracticeStage();
    setIndex(undefined);
    setRequested(true);
  }, []);
  useFirstRunStart(start, active || requested);

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

  const controls = useMemo(() => ({ start, active }), [start, active]);
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
function useFirstRunStart(start: () => void, busy: boolean) {
  const { credentialsReady } = useConnectionSettings();
  const repository = useRepository();
  const location = useLocation();
  const onWorkspace = location.pathname.startsWith('/workspaces/');
  const checked = useRef(false);
  useEffect(() => {
    if (checked.current || busy || !credentialsReady || !onWorkspace) return;
    checked.current = true;
    if (firstRunStep(readTourRecord()) !== 'check-service') return;
    repository
      .sessionPage({ kinds: PRIMARY_SESSION_KINDS, limit: 1 })
      .then((page) => {
        if (page.sessions.length > 0) writeTourRecord({ install: 'existing' });
        else start();
      })
      // Unknown: the record stays `new`, so the next launch asks again.
      .catch(() => undefined);
  }, [busy, credentialsReady, onWorkspace, repository, start]);
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
      if (document.querySelector('[data-radix-popper-content-wrapper], [role="menu"]')) return;
      event.preventDefault();
      event.stopPropagation();
      onFinish('skipped');
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onFinish]);

  const content = (
    <>
      {step.stage === 'practice' ? (
        <Suspense fallback={null}>
          <TourPracticeStage stageId={step.id} stageRef={stageRef} />
        </Suspense>
      ) : null}
      <TourOverlay
        count={TOUR_STEPS.length}
        index={index}
        onBack={() => onIndex(Math.max(0, index - 1))}
        onNext={() => (last ? onFinish('completed') : onIndex(index + 1))}
        onSkip={() => onFinish('skipped')}
        reduceMotion={reduceMotion}
        stageRef={stageRef}
        step={step}
      />
    </>
  );
  return overlay ? createPortal(content, overlay) : content;
}
