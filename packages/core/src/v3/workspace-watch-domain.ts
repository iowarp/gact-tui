/**
 * Health of the workspace's live filesystem watcher (gact `workspace_watch.py`, F1).
 *
 * `active: false` with no `reason` means simply "no live watcher yet" (no
 * session has subscribed) — not a failure. `reason` is only ever set for a
 * genuine typed degradation (e.g. `workspace_watch_unavailable`), which the
 * Files view surfaces via a hover card rather than staying silently stale.
 */
export interface WorkspaceLiveUpdatesStatus {
  active: boolean;
  reason?: string;
  detail?: string;
}
