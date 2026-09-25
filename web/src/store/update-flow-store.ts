import { create } from 'zustand';

/**
 * Which product(s) one "Update all" click is driving. Mirrors the
 * `UpdateAction` union `navigation-version-status.tsx` already used locally
 * before this store existed.
 */
export type UpdateAction = 'agent' | 'desktop' | 'both';

/**
 * Real, observable phases of an update — never inferred from a timer.
 * `checking` covers the version-comparison work that decides an update is
 * needed; `downloading` is driven by the desktop updater plugin's own
 * `DownloadEvent` byte counts; `installing` is driven by the managed CLIO
 * agent's streamed `clio:install-progress` log lines (no byte count exists
 * for that path, so lines are the honest signal instead of a fabricated
 * percentage); `restarting` covers the window between a successful install
 * and the process-replacing `app.restart()` / `relaunch()` call; `reconnecting`
 * is the window after that restart, before the managed backend answers again
 * (see `readPendingUpdateMarker` — this phase is recovered from a persisted
 * marker because the JS process performing `restarting` does not survive to
 * observe its own end).
 */
export type UpdateStep =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'installing'
  | 'restarting'
  | 'reconnecting'
  | 'done'
  | 'failed';

export interface UpdateDownloadProgress {
  downloadedBytes: number;
  totalBytes?: number;
}

/** Bounds retained `clio:install-progress` lines. Unit: lines. */
export const MAX_RETAINED_INSTALL_LINES = 200;

interface UpdateFlowState {
  step: UpdateStep;
  action?: UpdateAction;
  version?: string;
  progress?: UpdateDownloadProgress;
  lines: readonly string[];
  /** Typed, always-present reason once `step === 'failed'` — no silent failure. */
  reason?: string;
  /** Begin a fresh update run driven by this session (not a resumed one). */
  start: (action: UpdateAction, version?: string) => void;
  /** Resume from a persisted marker after a process-replacing restart. */
  resume: (action: UpdateAction, version?: string) => void;
  setStep: (step: Exclude<UpdateStep, 'failed' | 'done'>) => void;
  setProgress: (progress: UpdateDownloadProgress) => void;
  appendLine: (line: string) => void;
  fail: (reason: string) => void;
  finish: (version?: string) => void;
  reset: () => void;
}

const initialState = {
  step: 'idle' as const,
  action: undefined,
  version: undefined,
  progress: undefined,
  lines: [] as readonly string[],
  reason: undefined,
};

export const useUpdateFlowStore = create<UpdateFlowState>((set) => ({
  ...initialState,
  start: (action, version) =>
    set({
      step: 'checking',
      action,
      version,
      progress: undefined,
      lines: [],
      reason: undefined,
    }),
  resume: (action, version) =>
    set({
      step: 'reconnecting',
      action,
      version,
      progress: undefined,
      lines: [],
      reason: undefined,
    }),
  setStep: (step) => set({ step }),
  setProgress: (progress) => set({ progress }),
  appendLine: (line) =>
    set((state) => ({
      lines: [...state.lines, line].slice(-MAX_RETAINED_INSTALL_LINES),
    })),
  fail: (reason) => set({ step: 'failed', reason }),
  finish: (version) => set((state) => ({ step: 'done', version: version ?? state.version })),
  reset: () => set(initialState),
}));

/**
 * A phase in this list means the JS main thread is either actively driving an
 * update, or the app just booted back up from one and is waiting to hear from
 * the managed backend again. Consumers (the full-screen overlay, the
 * transport-error suppression in `WorkspaceTranscriptAlerts`) treat this as
 * "an expected outage is in progress" — as opposed to `done`/`failed`, which
 * are settled outcomes the person can dismiss, or `idle`, when nothing is
 * happening at all.
 */
export const UPDATE_IN_FLIGHT_STEPS: ReadonlySet<UpdateStep> = new Set([
  'checking',
  'downloading',
  'installing',
  'restarting',
  'reconnecting',
]);

export function isUpdateInFlight(step: UpdateStep): boolean {
  return UPDATE_IN_FLIGHT_STEPS.has(step);
}

const PENDING_UPDATE_MARKER_KEY = 'clio.pending-update';

export interface PendingUpdateMarker {
  action: UpdateAction;
  version?: string;
  startedAt: number;
}

/**
 * Bridges the one gap React state cannot survive: `app.restart()` /
 * `relaunch()` replace the whole process, destroying every in-memory store.
 * This marker is the only thing that tells the freshly booted app "you are
 * mid-update, keep showing the restart overlay until the managed backend
 * reconnects" instead of rendering a bare, unexplained disconnect.
 */
export function readPendingUpdateMarker(): PendingUpdateMarker | undefined {
  try {
    const raw = localStorage.getItem(PENDING_UPDATE_MARKER_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return undefined;
    const candidate = parsed as Record<string, unknown>;
    if (
      (candidate.action !== 'agent' && candidate.action !== 'desktop' && candidate.action !== 'both') ||
      typeof candidate.startedAt !== 'number'
    ) {
      return undefined;
    }
    return {
      action: candidate.action,
      version: typeof candidate.version === 'string' ? candidate.version : undefined,
      startedAt: candidate.startedAt,
    };
  } catch {
    return undefined;
  }
}

export function writePendingUpdateMarker(marker: PendingUpdateMarker): void {
  try {
    localStorage.setItem(PENDING_UPDATE_MARKER_KEY, JSON.stringify(marker));
  } catch {
    // Best-effort only, matching desktop-updater.ts's own last-checked clock:
    // a blocked store just means a cold reconnect cannot be distinguished
    // from a fresh boot, not a crash.
  }
}

export function clearPendingUpdateMarker(): void {
  try {
    localStorage.removeItem(PENDING_UPDATE_MARKER_KEY);
  } catch {
    // See writePendingUpdateMarker.
  }
}
