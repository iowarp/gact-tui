/**
 * Reduces session-scoped SSE events (created/updated/deleted, status, title,
 * permission requests) into the sidebar session list and pending-permission signal.
 */
import type { PermissionRequest, Session, SessionStatus } from '@clio/core';
import type { SidebarSession } from './components/Sidebar.js';
import type { BackendNotification } from './LiveNotifications.js';
import { toSidebarSession } from './LiveSessionsModel.js';

export interface SessionEventSink {
  patch: (id: string, p: Partial<SidebarSession>) => void;
  setRaw?: (next: SidebarSession[] | ((prev: SidebarSession[]) => SidebarSession[])) => void;
  /** Force a refetch of `/v1/sessions` — used when SSE signals a field
   * change (title, status, archived) whose new value isn't in the
   * event payload. */
  refetch?: () => void;
  /** Fired when SSE session.updated says the title changed. ChatScreen
   * uses this to flash a transient "renamed" pill in the topbar. */
  onTitleChanged?: (sessionId: string) => void;
}

export interface LiveSessionEventHooks {
  setPendingPermission: (p: PermissionRequest | null) => void;
  sessionEvents?: SessionEventSink;
  onNotification?: (n: BackendNotification) => void;
  now?: () => number;
}

export function applyLiveSessionEvent(
  type: string | undefined,
  payload: Record<string, unknown>,
  hooks: LiveSessionEventHooks,
): boolean {
  switch (type) {
    case 'session.status_changed':
      applySessionStatusChanged(payload, hooks);
      return true;
    case 'session.created':
      applySessionCreated(payload, hooks.sessionEvents);
      return true;
    case 'session.updated':
      applySessionUpdated(payload, hooks);
      return true;
    case 'session.deleted':
      applySessionDeleted(payload, hooks.sessionEvents);
      return true;
    default:
      return false;
  }
}

function applySessionStatusChanged(
  payload: Record<string, unknown>,
  hooks: LiveSessionEventHooks,
) {
  const sid = payload.session_id as string;
  const next = payload.status as SessionStatus;
  if (isSettledStatus(next)) hooks.setPendingPermission(null);
  if (sid && next && hooks.sessionEvents) {
    hooks.sessionEvents.patch(sid, {
      status: next,
      bumpedAt: (hooks.now ?? Date.now)(),
    });
  }
}

function applySessionCreated(
  payload: Record<string, unknown>,
  sessionEvents?: SessionEventSink,
) {
  const s = payload.session as Session | undefined;
  if (s && sessionEvents?.setRaw) {
    const next = toSidebarSession(s);
    sessionEvents.setRaw((prev) => {
      if (prev.some((b) => b.id === next.id)) return prev;
      return [next, ...prev];
    });
  }
}

function applySessionUpdated(
  payload: Record<string, unknown>,
  hooks: LiveSessionEventHooks,
) {
  const sink = hooks.sessionEvents;
  // Two wire shapes exist (iowarp/gact-tui#225): the envelope form
  // `{ session_id, changed_fields }` and clio's, which publishes the FULL
  // Session object (`id`, no `session_id`, no `changed_fields`).
  const sid = (payload.session_id as string | undefined) ?? (payload.id as string | undefined);
  if (!sid || !sink) {
    if (!sid) {
      console.warn('[live] session.updated dropped', {
        reason: 'session_updated_missing_id',
        payload_keys: Object.keys(payload),
      });
    }
    return;
  }
  const bump = {
    updatedAt: 'just now',
    bumpedAt: (hooks.now ?? Date.now)(),
  } satisfies Partial<SidebarSession>;
  let titleChanged = ((payload.changed_fields as string[]) ?? []).includes('title');
  if (isFullSessionPayload(payload)) {
    // The full-Session payload IS the update: apply it wholesale and derive
    // the title change by comparing against the current sidebar row.
    const next = toSidebarSession(payload as unknown as Session);
    if (sink.setRaw) {
      sink.setRaw((prev) =>
        prev.map((row) => {
          if (row.id !== sid) return row;
          if (row.title !== next.title) titleChanged = true;
          return { ...row, ...next, ...bump };
        }),
      );
    } else {
      // Degraded: without list access the previous title is unknown, so a
      // backend rename can't be detected (no toast) — fields still apply.
      console.warn('[live] session.updated applied without rename detection', {
        reason: 'session_updated_sink_missing_setraw',
        session_id: sid,
      });
      sink.patch(sid, { ...next, ...bump });
    }
  } else {
    sink.patch(sid, bump);
  }
  if (titleChanged) {
    sink.refetch?.();
    sink.onTitleChanged?.(sid);
    hooks.onNotification?.({
      level: 'info',
      title: 'Session renamed',
      body: `Backend updated the title of session ${sid.slice(0, 8)}.`,
    });
  }
}

/** A clio-shaped `session.updated` payload: the Session object itself. */
function isFullSessionPayload(payload: Record<string, unknown>): boolean {
  return (
    !('session_id' in payload) &&
    typeof payload.id === 'string' &&
    typeof payload.title === 'string' &&
    typeof payload.status === 'string'
  );
}

function applySessionDeleted(
  payload: Record<string, unknown>,
  sessionEvents?: SessionEventSink,
) {
  const sid = payload.session_id as string;
  if (sid && sessionEvents?.setRaw) {
    sessionEvents.setRaw((prev) => prev.filter((b) => b.id !== sid));
  }
}

function isSettledStatus(status: SessionStatus): boolean {
  return (
    status === 'idle' ||
    status === 'error' ||
    status === 'finished' ||
    (typeof status === 'string' &&
      ['completed', 'failed', 'cancelled', 'canceled'].includes(status))
  );
}
