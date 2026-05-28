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

    // GACT emits typed events ("event: <name>" + "data: {...payload}").
    // Per SPEC §7.2 the event name comes from the `event:` line; we
    // register one listener per spec-defined event so the dispatcher
    // stays explicit. Anything we don't list here is silently tolerated.
    const named = [
      'server.connected',
      'server.heartbeat',
      'session.created',
      'session.updated',
      'session.status_changed',
      'session.summarized',
      'session.compacted',
      'message.created',
      'message.part.added',
      'message.part.delta',
      'message.part.completed',
      'message.completed',
      'message.error',
      'tool.call.started',
      'tool.call.completed',
      'permission.requested',
      'permission.resolved',
      'cost.updated',
      'notification',
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
 *
 * Per SPEC §7.2 the envelope is `{type, occurred_at, payload}`. We read
 * everything out of `payload` so the reducer stays aligned with the
 * wire. Tolerates unknown event types (silently drops them so a backend
 * that ships a richer event surface doesn't blow up older clients).
 */
function reduce(
  ev: { type?: string; payload?: Record<string, unknown> },
  hooks: {
    setMessages: (m: Message[] | ((p: Message[]) => Message[])) => void;
    setPendingPermission: (p: PermissionRequest | null) => void;
  },
) {
  const t = ev.type;
  const p = ev.payload ?? {};
  switch (t) {
    case 'message.created': {
      const msg = p.message as Message | undefined;
      if (msg) hooks.setMessages((prev) => upsertMessage(prev, msg));
      break;
    }
    case 'message.part.added': {
      const messageId = p.message_id as string;
      const part = p.part as Message['parts'][number];
      if (messageId && part) {
        hooks.setMessages((prev) => appendPart(prev, messageId, part));
      }
      break;
    }
    case 'message.part.delta': {
      const messageId = p.message_id as string;
      const partId = p.part_id as string;
      const delta = (p.delta as { text_append?: string }) ?? {};
      if (messageId && partId && delta.text_append) {
        hooks.setMessages((prev) =>
          applyTextAppend(prev, messageId, partId, delta.text_append!),
        );
      }
      break;
    }
    case 'permission.requested': {
      const req = p.permission as PermissionRequest | undefined;
      if (req) hooks.setPendingPermission(req);
      break;
    }
    case 'permission.resolved': {
      // Clear the inline card — the agent has acked the user's decision.
      hooks.setPendingPermission(null);
      break;
    }
    case 'session.status_changed':
    case 'session.created':
    case 'session.updated':
    case 'message.completed':
    case 'message.part.completed':
    case 'message.error':
    case 'tool.call.started':
    case 'tool.call.completed':
    case 'cost.updated':
    case 'notification':
    case 'server.connected':
    case 'server.heartbeat':
    default:
      // No transcript-reducer action; sidebar status / cost chips refresh
      // via the next /v1/sessions poll.
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
