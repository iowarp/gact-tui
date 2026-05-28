/**
 * Live data plumbing for ChatScreen — Wave 1 + post-tag refresh.
 *
 * These Solid factories own the connection to a single GACT v0.2
 * backend (`@clio/core` Client). They expose signals the existing
 * components already consume (`SidebarSession[]`, `Message[]`,
 * `PermissionRequest | null`) so the visual proof set can keep
 * driving the same JSX with `?fixture=…` while the live build flips
 * over to real data when no fixture is requested.
 *
 * Refresh from SSE: session.status_changed / session.created / .updated /
 * .deleted patch the sidebar list in-place; message.completed records
 * the stop_reason + tokens on the in-flight assistant message.
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
  /** Patch a single session in-place — used by the SSE reducer. */
  patch: (id: string, patch: Partial<SidebarSession>) => void;
  /** Replace the cached session list (additions/removals from SSE). */
  setRaw: (next: SidebarSession[] | ((prev: SidebarSession[]) => SidebarSession[])) => void;
  /** Surface the underlying Client for one-off RPCs (sendMessage etc.). */
  client: Client;
}

export interface LiveTranscriptHandle {
  messages: Accessor<Message[]>;
  pendingPermission: Accessor<PermissionRequest | null>;
  /** Connection state to the SSE stream for the current session. */
  status: Accessor<'connecting' | 'open' | 'closed' | 'error'>;
  /** Last known `message.completed` summary for the active session. */
  lastCompletion: Accessor<MessageCompletion | null>;
  /** Per-session cost rolled forward by `cost.updated` events. */
  costUsd: Accessor<number>;
}

export interface MessageCompletion {
  message_id: string;
  stop_reason: string;
  tokens?: { input?: number; output?: number; total?: number };
  cost_usd?: number;
}

/**
 * Lists sessions on the connected backend. Used by Sidebar. Returns a
 * Solid resource that auto-fetches on mount, exposes a manual refetch,
 * and a `patch` helper for SSE-driven in-place updates so the pip flips
 * green→amber→red without us hammering /v1/sessions.
 */
export function createLiveSessions(opts: LiveStoreOptions): LiveSessionsHandle {
  const client = new Client({ baseUrl: opts.url, bearerToken: opts.bearerToken });

  const [override, setOverride] = createSignal<SidebarSession[] | null>(null);
  const [resource, { refetch }] = createResource<SidebarSession[]>(async () => {
    const { sessions: rows } = await client.sessions();
    const next = rows.map(toSidebarSession);
    setOverride(null); // resource is fresh — discard local SSE-side overrides
    return next;
  });

  const sessions: Resource<SidebarSession[]> = new Proxy(resource, {
    apply() {
      // Resources are called as functions; merge override on top of latest.
      const base = resource() ?? [];
      const o = override();
      return o ?? base;
    },
    get(target, prop, recv) {
      if (prop === Symbol.toPrimitive) return undefined;
      return Reflect.get(target, prop, recv);
    },
  }) as Resource<SidebarSession[]>;

  function patch(id: string, p: Partial<SidebarSession>) {
    const base = override() ?? resource() ?? [];
    const exists = base.find((b) => b.id === id);
    if (!exists) return;
    setOverride(base.map((b) => (b.id === id ? { ...b, ...p } : b)));
  }

  function setRaw(
    next: SidebarSession[] | ((prev: SidebarSession[]) => SidebarSession[]),
  ) {
    const base = override() ?? resource() ?? [];
    setOverride(typeof next === 'function' ? next(base) : next);
  }

  return { sessions, refetch: () => void refetch(), patch, setRaw, client };
}

/**
 * Manages the message + permission state for `activeSessionId`. When the
 * accessor changes (user clicks a different sidebar row), the previous
 * EventSource is torn down and a new one is opened.
 *
 * The optional `sessionEvents` callback is invoked for every SSE event
 * touching the sessions list so the caller can patch SidebarSession[]
 * (see `createLiveSessions().patch`).
 */
export function createLiveTranscript(
  client: Client,
  activeSessionId: Accessor<string>,
  sessionEvents?: SessionEventSink,
): LiveTranscriptHandle {
  const [messages, setMessages] = createSignal<Message[]>([]);
  const [pendingPermission, setPendingPermission] = createSignal<PermissionRequest | null>(null);
  const [status, setStatus] = createSignal<'connecting' | 'open' | 'closed' | 'error'>(
    'closed',
  );
  const [lastCompletion, setLastCompletion] = createSignal<MessageCompletion | null>(null);
  const [costUsd, setCostUsd] = createSignal<number>(0);

  createEffect(() => {
    const id = activeSessionId();
    if (!id) {
      setMessages([]);
      setPendingPermission(null);
      setStatus('closed');
      setLastCompletion(null);
      setCostUsd(0);
      return;
    }

    setStatus('connecting');
    void client
      .messages(id)
      .then(({ messages: existing }) => setMessages(existing))
      .catch(() => setMessages([]));

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
      reduce(ev as { type?: string; payload?: Record<string, unknown> }, {
        setMessages,
        setPendingPermission,
        setLastCompletion,
        setCostUsd,
        sessionEvents,
      });
    };

    const named = [
      'server.connected',
      'server.heartbeat',
      'session.created',
      'session.updated',
      'session.deleted',
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

  return { messages, pendingPermission, status, lastCompletion, costUsd };
}

export interface SessionEventSink {
  patch: (id: string, p: Partial<SidebarSession>) => void;
  setRaw?: (
    next: SidebarSession[] | ((prev: SidebarSession[]) => SidebarSession[]),
  ) => void;
}

/**
 * Reduce an envelope-shaped event onto the message + permission signals.
 * Per SPEC §7.2 every payload lives under `ev.payload`. Tolerates
 * unknown event types (silently drops them so a backend that ships a
 * richer event surface doesn't blow up older clients).
 */
function reduce(
  ev: { type?: string; payload?: Record<string, unknown> },
  hooks: {
    setMessages: (m: Message[] | ((p: Message[]) => Message[])) => void;
    setPendingPermission: (p: PermissionRequest | null) => void;
    setLastCompletion: (c: MessageCompletion | null) => void;
    setCostUsd: (n: number | ((p: number) => number)) => void;
    sessionEvents?: SessionEventSink;
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
    case 'message.completed': {
      const completion: MessageCompletion = {
        message_id: p.message_id as string,
        stop_reason: (p.stop_reason as string) ?? 'unknown',
        tokens: p.tokens as MessageCompletion['tokens'],
        cost_usd: p.cost_usd as number | undefined,
      };
      hooks.setLastCompletion(completion);
      hooks.setMessages((prev) =>
        prev.map((m) =>
          m.id === completion.message_id
            ? {
                ...m,
                stop_reason: completion.stop_reason,
                tokens: completion.tokens ?? m.tokens,
                cost_usd: completion.cost_usd ?? m.cost_usd,
              }
            : m,
        ),
      );
      break;
    }
    case 'message.error': {
      const messageId = p.message_id as string;
      const error = p.error as Message['error_info'] | undefined;
      if (messageId && error) {
        hooks.setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, error_info: error, stop_reason: 'error' } : m,
          ),
        );
      }
      break;
    }
    case 'cost.updated': {
      const cost = p.cost_usd as number | undefined;
      if (typeof cost === 'number') hooks.setCostUsd(cost);
      break;
    }
    case 'permission.requested': {
      const req = p.permission as PermissionRequest | undefined;
      if (req) hooks.setPendingPermission(req);
      break;
    }
    case 'permission.resolved': {
      hooks.setPendingPermission(null);
      break;
    }
    case 'session.status_changed': {
      const sid = p.session_id as string;
      const next = p.status as SessionStatus;
      if (sid && next && hooks.sessionEvents) {
        hooks.sessionEvents.patch(sid, { status: next });
      }
      break;
    }
    case 'session.created': {
      const s = p.session as Session | undefined;
      if (s && hooks.sessionEvents?.setRaw) {
        const next = toSidebarSession(s);
        hooks.sessionEvents.setRaw((prev) => {
          if (prev.some((b) => b.id === next.id)) return prev;
          return [next, ...prev];
        });
      }
      break;
    }
    case 'session.updated': {
      const sid = p.session_id as string;
      if (sid && hooks.sessionEvents) {
        const changed = (p.changed_fields as string[]) ?? [];
        // We don't get the new field values here; the simplest correct
        // thing is to mark the row as "updatedAt: just now" so the
        // sidebar's modification ordering still tells the truth.
        hooks.sessionEvents.patch(sid, { updatedAt: 'just now' });
        void changed;
      }
      break;
    }
    case 'session.deleted': {
      const sid = p.session_id as string;
      if (sid && hooks.sessionEvents?.setRaw) {
        hooks.sessionEvents.setRaw((prev) => prev.filter((b) => b.id !== sid));
      }
      break;
    }
    case 'message.part.completed':
    case 'tool.call.started':
    case 'tool.call.completed':
    case 'notification':
    case 'server.connected':
    case 'server.heartbeat':
    case 'session.summarized':
    case 'session.compacted':
    default:
      // No transcript-reducer action yet. tool.call.progress + notification
      // are tracked as v1.0 follow-ups for the chat shell.
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
  if (typeof meta['project'] === 'string') return meta['project'];
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
