/**
 * Self-update check for the web SPA: the standard "a new build was deployed —
 * refresh" pattern. The running bundle knows its own build via APP_VERSION
 * (stamped by vite from git-describe). A tiny `version.json` marker is emitted
 * next to the bundle at build time (see vite.config.ts) and served uncached.
 *
 * This service periodically (and on window focus) fetches that marker with a
 * cache-busting query, compares the served version against the loaded
 * APP_VERSION, and exposes a reactive `updateAvailable` signal plus the new
 * version string. Fetch failures (offline, marker missing) are swallowed — an
 * update check must never surface an error to the user.
 *
 * When APP_VERSION is "dev" (a non-stamped build, e.g. ts-node or a bare
 * checkout) the service no-ops entirely: there is no meaningful "newer build"
 * to compare against.
 */
import { createSignal, type Accessor } from 'solid-js';
import { APP_VERSION } from './build-info.js';

/** Default poll cadence: every 5 minutes. */
export const DEFAULT_UPDATE_POLL_MS = 5 * 60 * 1000;

/** Path to the build marker. Kept relative-from-root so it works under any base. */
export const VERSION_MARKER_PATH = '/version.json';

export interface UpdateCheckHandle {
  /** Flips to true once a build newer than the loaded one is observed. */
  updateAvailable: Accessor<boolean>;
  /** The version string reported by the marker once an update is seen. */
  newVersion: Accessor<string | null>;
  /** Force an immediate check (also runs on focus + on the interval). */
  checkNow: () => Promise<void>;
  /** Tear down timers + listeners. Idempotent. */
  stop: () => void;
}

export interface UpdateCheckOptions {
  /** Override the running build version (mainly for tests). */
  currentVersion?: string;
  /** Poll cadence in ms. Defaults to {@link DEFAULT_UPDATE_POLL_MS}. */
  pollIntervalMs?: number;
  /** Injected fetch (mainly for tests / non-DOM environments). */
  fetchImpl?: typeof fetch;
  /** Marker URL. Defaults to {@link VERSION_MARKER_PATH}. */
  markerPath?: string;
  /** Start polling immediately. Defaults to true. */
  autoStart?: boolean;
}

/**
 * Fetch the build marker once, defeating any HTTP cache with a timestamped
 * query and `cache: 'no-store'`. Returns the reported version, or null if the
 * marker is unreachable / malformed (treated as "no information", never an
 * error the caller must handle).
 */
export async function fetchMarkerVersion(
  fetchImpl: typeof fetch,
  markerPath: string,
): Promise<string | null> {
  try {
    const url = `${markerPath}?t=${Date.now()}`;
    const res = await fetchImpl(url, {
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    if (
      data &&
      typeof data === 'object' &&
      'version' in data &&
      typeof (data as { version: unknown }).version === 'string'
    ) {
      return (data as { version: string }).version;
    }
    return null;
  } catch {
    // Offline, DNS failure, JSON parse error, marker not deployed — all
    // indistinguishable here and all non-fatal. Stay quiet.
    return null;
  }
}

/**
 * Create the reactive update-check service. Safe to call in any environment;
 * timers/listeners are only attached when a real DOM is present.
 */
export function createUpdateCheck(options: UpdateCheckOptions = {}): UpdateCheckHandle {
  const currentVersion = options.currentVersion ?? APP_VERSION;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_UPDATE_POLL_MS;
  const fetchImpl = options.fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined);
  const markerPath = options.markerPath ?? VERSION_MARKER_PATH;
  const autoStart = options.autoStart ?? true;

  const [updateAvailable, setUpdateAvailable] = createSignal(false);
  const [newVersion, setNewVersion] = createSignal<string | null>(null);

  // A non-stamped build has nothing meaningful to compare against — never
  // poll, never surface an update. Also bail if there's no fetch to call.
  const enabled = currentVersion !== 'dev' && !!fetchImpl;

  let intervalId: ReturnType<typeof setInterval> | undefined;
  let stopped = false;

  async function checkNow(): Promise<void> {
    if (!enabled || stopped || updateAvailable() || !fetchImpl) return;
    const served = await fetchMarkerVersion(fetchImpl, markerPath);
    if (served === null) return; // no info
    if (served !== currentVersion) {
      setNewVersion(served);
      setUpdateAvailable(true);
      // Once an update is known, stop polling — the answer won't change until
      // the user reloads, at which point a fresh service starts.
      teardownTimersAndListeners();
    }
  }

  const onFocus = () => {
    void checkNow();
  };
  const onVisibility = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      void checkNow();
    }
  };

  function teardownTimersAndListeners(): void {
    if (intervalId !== undefined) {
      clearInterval(intervalId);
      intervalId = undefined;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', onFocus);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibility);
    }
  }

  function start(): void {
    if (!enabled || stopped || intervalId !== undefined) return;
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onFocus);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }
    intervalId = setInterval(() => void checkNow(), pollIntervalMs);
    // Kick off an initial check so a long-idle tab that reloads into a stale
    // deploy notices promptly rather than after a full interval.
    void checkNow();
  }

  function stop(): void {
    stopped = true;
    teardownTimersAndListeners();
  }

  if (autoStart) start();

  return { updateAvailable, newVersion, checkNow, stop };
}
