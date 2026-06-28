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
  const sid = payload.session_id as string;
  if (!sid || !hooks.sessionEvents) return;
  const changed = (payload.changed_fields as string[]) ?? [];
  hooks.sessionEvents.patch(sid, {
    updatedAt: 'just now',
    bumpedAt: (hooks.now ?? Date.now)(),
  });
  if (changed.includes('title')) {
    hooks.sessionEvents.refetch?.();
    hooks.sessionEvents.onTitleChanged?.(sid);
    hooks.onNotification?.({
      level: 'info',
      title: 'Session renamed',
      body: `Backend updated the title of session ${sid.slice(0, 8)}.`,
    });
  }
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
