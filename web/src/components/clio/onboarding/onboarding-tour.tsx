import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import { useRepository } from '@/hooks/use-repository';
import { firstRunStep, readTourRecord, writeTourRecord } from '@/lib/onboarding/first-run';
import { OnboardingTourContext } from '@/lib/onboarding/tour-context';
import { ONBOARDING_TOUR_ENABLED } from '@/lib/onboarding/tour-flag';
import { PRIMARY_SESSION_KINDS } from '@/lib/recent-sessions';
import { useConnectionSettings } from '@/providers/connection-provider';

// The spotlight, card and practice conversation load when a tour starts, not at boot.
const loadTourSession = () => import('./tour-session');
const TourSession = lazy(() =>
  loadTourSession().then((module) => ({ default: module.TourSession })),
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

/**
 * A replay asked for and not started yet. Closing a Settings window that has no
 * workspace behind it remounts the app, so the request outlives this provider.
 */
let replayPending = false;

function EnabledOnboardingTour({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [requested, setRequestedState] = useState(() => replayPending);
  const setRequested = useCallback((next: boolean) => {
    replayPending = next;
    setRequestedState(next);
  }, []);
  const [index, setIndex] = useState<number>();
  // A fresh install may still start the tour: hold other first-run prompts until it's decided.
  const [deciding, setDeciding] = useState(
    () => firstRunStep(readTourRecord()) === 'check-service',
  );
  const active = index !== undefined;
  const start = useCallback(() => {
    void loadTourSession();
    void import('./tour-practice-stage');
    setIndex(undefined);
    setRequested(true);
  }, [setRequested]);
  const decided = useCallback(() => setDeciding(false), []);
  useFirstRunStart(start, decided, active || requested);

  // The tour runs over a workspace: past Settings, and past the connect screen a
  // detached Settings window may return to first.
  const onWorkspace = location.pathname.startsWith('/workspaces/');
  useEffect(() => {
    if (!requested || !onWorkspace) return;
    // Wait for Settings or any other dialog to finish closing.
    const timer = window.setInterval(() => {
      if (document.querySelector('[data-slot="dialog-content"], [role="alertdialog"]')) return;
      window.clearInterval(timer);
      setRequested(false);
      setIndex(0);
    }, WAIT_MS);
    return () => window.clearInterval(timer);
  }, [requested, onWorkspace, setRequested]);

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
      {active ? (
        <Suspense fallback={null}>
          <TourSession index={index} onFinish={finish} onIndex={setIndex} />
        </Suspense>
      ) : null}
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
