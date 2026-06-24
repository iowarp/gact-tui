/**
 * Pure session-list helpers: maps wire {@link Session} to {@link SidebarSession}
 * ({@link toSidebarSession}, {@link humanizeUpdatedAt}) and decides when an SSE
 * event warrants a transcript refetch ({@link shouldReconcileTranscriptAfterEvent}).
 */
import type { Session, SessionStatus } from '@clio/core';
import type { SidebarSession } from './components/Sidebar.js';

export function shouldReconcileTranscriptAfterEvent(
  ev: { type?: string; payload?: Record<string, unknown> },
  activeSessionId: string,
): boolean {
  const p = ev.payload ?? {};
  const eventSessionId = (p['session_id'] as string | undefined) ?? activeSessionId;
  if (eventSessionId !== activeSessionId) return false;
  if (
    ev.type === 'message.completed' ||
    ev.type === 'message.error' ||
    ev.type === 'message.deleted' ||
    ev.type === 'session.compacted' ||
    ev.type === 'session.cleared'
  ) {
    return true;
  }
  return (
    ev.type === 'session.status_changed' &&
    p['status'] !== 'running' &&
    p['status'] !== 'waiting_permission'
  );
}

export function toSidebarSession(s: Session): SidebarSession {
  const project = workspaceLabel(s);
  const meta = s.metadata ?? {};
  const metaPinned = meta['pinned'] === true;
  return {
    id: s.id,
    title: s.title,
    status: s.status as SessionStatus,
    project,
    updatedAt: humanizeUpdatedAt(s.updated_at),
    ...(metaPinned ? { metaPinned: true } : {}),
    ...(s.parent_session_id ? { parentId: s.parent_session_id } : {}),
  };
}

export function workspaceLabel(s: Pick<Session, 'workspace_id' | 'metadata'>): string {
  if (s.workspace_id) return s.workspace_id;
  const meta = s.metadata ?? {};
  if (typeof meta['project'] === 'string') return meta['project'];
  return 'workspace';
}

export function humanizeUpdatedAt(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const delta = Date.now() - d.getTime();
  const min = Math.round(delta / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.round(hr / 24);
  return `${day}d`;
}
