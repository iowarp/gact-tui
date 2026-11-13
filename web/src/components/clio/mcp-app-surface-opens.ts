/**
 * The views `clio.mcp-app.v1` components have open, shared by every mount of one
 * component on one surface.
 *
 * Showing a surface makes the component's call once. Mounting the same component
 * again while it is open (a re-render, React's development double mount, the same
 * surface shown twice) shares that view. When its last mount goes, the view is
 * closed (MA7): unmounting the surface closes it.
 * The close waits for the end of the current task, so an immediate remount keeps
 * the view instead of making the call again.
 */
import type { McpAppIdentity, McpAppOpened, McpAppOpenFailure } from '@clio/core/v3';

export type SurfaceOpenOutcome = McpAppOpened | McpAppOpenFailure;

interface Entry {
  mounts: number;
  outcome: Promise<SurfaceOpenOutcome>;
  closeTimer?: ReturnType<typeof setTimeout>;
}

const entries = new Map<string, Entry>();

/** The identity that controls an opened view, or `undefined` for a failure. */
export function openedIdentity(
  sessionId: string,
  outcome: SurfaceOpenOutcome | undefined,
): McpAppIdentity | undefined {
  if (!outcome || !('part' in outcome)) return undefined;
  return {
    sessionId,
    appInstanceId: outcome.part.app_instance_id,
    dataRef: outcome.part.data_ref,
  };
}

/** Share or make the open for `key`; call the returned release when the mount goes. */
export function acquireSurfaceOpen(
  key: string,
  open: () => Promise<SurfaceOpenOutcome>,
  close: (outcome: SurfaceOpenOutcome) => void,
): { outcome: Promise<SurfaceOpenOutcome>; release: () => void } {
  let entry = entries.get(key);
  if (entry) {
    if (entry.closeTimer) clearTimeout(entry.closeTimer);
    entry.closeTimer = undefined;
  } else {
    entry = { mounts: 0, outcome: open() };
    entries.set(key, entry);
  }
  entry.mounts += 1;
  const held = entry;
  let released = false;
  return {
    outcome: held.outcome,
    release: () => {
      if (released) return;
      released = true;
      held.mounts -= 1;
      if (held.mounts > 0) return;
      held.closeTimer = setTimeout(() => {
        if (held.mounts > 0 || entries.get(key) !== held) return;
        entries.delete(key);
        // A failed open has opened nothing; the mount shows its reason.
        void held.outcome.then(close, () => undefined);
      }, 0);
    },
  };
}

/** Forget a failed open so the person's Retry makes the call again. */
export function forgetSurfaceOpen(key: string): void {
  const entry = entries.get(key);
  if (entry?.closeTimer) clearTimeout(entry.closeTimer);
  entries.delete(key);
}
