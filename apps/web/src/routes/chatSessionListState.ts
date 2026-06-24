/**
 * Solid state container for the sidebar session list (rows, selection, live
 * patching). Exports {@link createChatSessionListState}.
 */
import { createEffect, createMemo, createSignal, type Accessor } from 'solid-js';
import type { SessionRow } from '../components/SessionsColumn.js';
import { addDetached, listDetached, removeDetached, type DetachedSession } from '../detached.js';
import type { ToastInput } from '../components/Toast.js';
import { loadPinnedSet } from './chatScreenUtils.js';

export interface LiveSessionLike {
  id: string;
  title: string;
  status: SessionRow['status'];
  project?: string;
  updatedAt: string;
  preview?: string;
  metaPinned?: boolean;
  bumpedAt?: number;
  parentId?: string;
}

export interface ChatSessionListStateOptions {
  backendUrl: string;
  sessions: Accessor<LiveSessionLike[] | undefined>;
  activeId: Accessor<string>;
  setActiveId: (id: string) => void;
  patchSessionMetadata: (id: string, pinned: boolean) => Promise<unknown>;
  toastPush: (input: ToastInput) => number;
}

export function createChatSessionListState(options: ChatSessionListStateOptions) {
  const pinnedKey = `clio.pinned.${options.backendUrl}`;
  const [pinnedIds, setPinnedIds] = createSignal<Set<string>>(loadPinnedSet(pinnedKey));

  function togglePin(id: string) {
    let nextPinned = false;
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        nextPinned = false;
      } else {
        next.add(id);
        nextPinned = true;
      }
      try {
        localStorage.setItem(pinnedKey, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
    // Mirror to the server so other clients (TUI) see the same pin
    // state. Failure is non-fatal; the local store remains authoritative.
    void options.patchSessionMetadata(id, nextPinned).catch(() => {
      /* server-side metadata write best-effort */
    });
  }

  const rows = createMemo<SessionRow[]>(() => {
    const sessions = options.sessions() ?? [];
    const pins = pinnedIds();
    return sessions.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      workspace: row.project,
      updatedAt: row.updatedAt,
      preview: row.preview,
      // The row is pinned if either local state or the server says so.
      // Server-side metadata mirrors the TUI; local state wins when the
      // user just toggled and the server has not responded.
      pinned: pins.has(row.id) || row.metaPinned === true,
      ...(row.bumpedAt ? { bumpedAt: row.bumpedAt } : {}),
      ...(row.parentId ? { parentId: row.parentId } : {}),
    }));
  });

  createEffect(() => {
    const list = rows();
    // Stale-id recovery only. Do not auto-select the first session:
    // that races with composer draft persistence and can wipe the text
    // the user is typing as the sessions resource resolves.
    if (
      options.activeId() &&
      list.length > 0 &&
      !list.some((row) => row.id === options.activeId())
    ) {
      options.setActiveId('');
    }
  });

  const [detachedSessions, setDetachedSessions] = createSignal<DetachedSession[]>(
    listDetached(options.backendUrl),
  );

  function reattachDetached(sessionId: string) {
    removeDetached(options.backendUrl, sessionId);
    setDetachedSessions(listDetached(options.backendUrl));
  }

  function walkAwayFromActive() {
    const sessionId = options.activeId();
    const row = rows().find((session) => session.id === sessionId);
    if (!sessionId || !row) return;
    addDetached(options.backendUrl, {
      id: sessionId,
      title: row.title,
      ...(row.preview ? { preview: row.preview } : {}),
      ...(row.workspace ? { workspace: row.workspace } : {}),
    });
    setDetachedSessions(listDetached(options.backendUrl));
    options.toastPush({
      tone: 'info',
      title: 'Walked away',
      body: `${row.title} parked - open Cmd+K to re-attach.`,
      duration: 3200,
    });
  }

  return {
    rows,
    togglePin,
    detachedSessions,
    reattachDetached,
    walkAwayFromActive,
  };
}
