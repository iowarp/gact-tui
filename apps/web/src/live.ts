/**
 * Live data plumbing for ChatScreen — Wave 1.
 *
 * These Solid factories own the connection to a single GACT v0.2
 * backend (`@clio/core` Client). They expose signals the existing
 * components already consume (`SidebarSession[]`, `Message[]`,
 * `PermissionRequest | null`) so the visual proof set can keep
 * driving the same JSX with `?fixture=…` while the live build flips
 * over to real data when no fixture is requested.
 */

import {
  createEffect,
  createResource,
  createSignal,
  onCleanup,
  type Accessor,
  type Resource,
} from 'solid-js';
import {
  Client,
  applyTextAppend,
  appendPart,
  upsertMessage,
  type Message,
  type PermissionRequest,
  type Session,
  type SessionStatus,
} from '@clio/core';
import type { SidebarSession } from './components/Sidebar.js';

export interface LiveStoreOptions {
  url: string;
  bearerToken: string;
}

export interface LiveSessionsHandle {
  sessions: Resource<SidebarSession[]>;
  /** Re-fetch the sessions list (e.g. after creating a new session). */
  refetch: () => void;
  /** Surface the underlying Client for one-off RPCs (sendMessage etc.). */
  client: Client;
}

export interface LiveTranscriptHandle {
  messages: Accessor<Message[]>;
  pendingPermission: Accessor<PermissionRequest | null>;
  /** Connection state to the SSE stream for the current session. */
  status: Accessor<'connecting' | 'open' | 'closed' | 'error'>;
}

/**
 * Lists sessions on the connected backend. Used by Sidebar. Returns a
 * Solid resource that auto-fetches on mount and exposes a manual refetch.
 */
export function createLiveSessions(opts: LiveStoreOptions): LiveSessionsHandle {
  const client = new Client({ baseUrl: opts.url, bearerToken: opts.bearerToken });

  const [sessions, { refetch }] = createResource<SidebarSession[]>(async () => {
    const { sessions: rows } = await client.sessions();
    return rows.map(toSidebarSession);
  });

  return { sessions, refetch: () => void refetch(), client };
}

/**
 * Manages the message + permission state for `activeSessionId`. When the
 * accessor changes (user clicks a different sidebar row), the previous
 * EventSource is torn down and a new one is opened.
 */
export function createLiveTranscript(
  client: Client,
  activeSessionId: Accessor<string>,
): LiveTranscriptHandle {
  const [messages, setMessages] = createSignal<Message[]>([]);
  const [pendingPermission, setPendingPermission] = createSignal<PermissionRequest | null>(null);
  const [status, setStatus] = createSignal<'connecting' | 'open' | 'closed' | 'error'>(
    'closed',
  );

  createEffect(() => {
    const id = activeSessionId();
    if (!id) {
      setMessages([]);
      setPendingPermission(null);
      setStatus('closed');
      return;
    }

    setStatus('connecting');
    // Snapshot the existing transcript before opening the live stream so
    // the user sees historic content immediately.
    void client
      .messages(id)
      .then(({ messages: existing }) => setMessages(existing))
      .catch(() => setMessages([]));

    // Initial pending-permission probe — subsequent arrivals come via SSE.
    void client
      .permissions(id)
      .then(({ permissions }) => setPendingPermission(permissions[0] ?? null))
      .catch(() => setPendingPermission(null));

    const es = new EventSource(client.sseUrl(id));
    es.onopen = () => setStatus('open');
    es.onerror = () => setStatus('error');

    const onEvent = (raw: MessageEvent) => {
      let ev: unknown;
      try {
        ev = JSON.parse(raw.data);
      } catch {
        return;
      }
      reduce(ev as Record<string, unknown>, {
        setMessages,
        setPendingPermission,
      });
    };

    // GACT emits typed events ("event: message.created" + "data: …"), so
    // EventSource fires per-name listeners; we register one listener per
    // contract event so the dispatcher stays explicit.
    const named = [
      'session.status',
      'message.created',
      'message.part.added',
      'message.part.delta',
      'message.completed',
      'permission.requested',
      'usage',
    ];
    for (const name of named) es.addEventListener(name, onEvent as EventListener);

    onCleanup(() => {
      for (const name of named) es.removeEventListener(name, onEvent as EventListener);
      es.close();
      setStatus('closed');
    });
  });

  return { messages, pendingPermission, status };
}

/**
 * Reduce an envelope-shaped event onto the message + permission signals.
 * Tolerates unknown event types (silently drops them so a backend that
 * ships a richer event surface doesn't blow up older clients).
 */
function reduce(
  ev: Record<string, unknown>,
  hooks: {
    setMessages: (m: Message[] | ((p: Message[]) => Message[])) => void;
    setPendingPermission: (p: PermissionRequest | null) => void;
  },
) {
  const t = ev.type as string | undefined;
  switch (t) {
    case 'message.created': {
      const msg = ev.message as Message | undefined;
      if (msg) hooks.setMessages((prev) => upsertMessage(prev, msg));
      break;
    }
    case 'message.part.added': {
      const messageId = ev.message_id as string;
      const part = ev.part as Message['parts'][number];
      if (messageId && part) {
        hooks.setMessages((prev) => appendPart(prev, messageId, part));
      }
      break;
    }
    case 'message.part.delta': {
      const messageId = ev.message_id as string;
      const partIndex = ev.part_index as number;
      const textAppend = ev.text_append as string | undefined;
      if (messageId && Number.isFinite(partIndex) && textAppend) {
        hooks.setMessages((prev) => applyTextAppend(prev, messageId, partIndex, textAppend));
      }
      break;
    }
    case 'permission.requested': {
      const req = ev.permission as PermissionRequest | undefined;
      if (req) hooks.setPendingPermission(req);
      break;
    }
    case 'session.status':
    case 'message.completed':
    case 'usage':
    default:
      // No reducer action needed today; SidebarSession status pip updates
      // come from the next /v1/sessions refetch.
      break;
  }
}

function toSidebarSession(s: Session): SidebarSession {
  const project = workspaceLabel(s);
  return {
    id: s.id,
    title: s.title,
    status: s.status as SessionStatus,
    project,
    updatedAt: humanizeUpdatedAt(s.updated_at),
  };
}

function workspaceLabel(s: Session): string {
  if (s.workspace_id) return s.workspace_id;
  const meta = s.metadata ?? {};
  if (typeof meta.project === 'string') return meta.project;
  return 'workspace';
}

function humanizeUpdatedAt(iso: string): string {
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
