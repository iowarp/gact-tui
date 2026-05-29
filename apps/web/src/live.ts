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
  type UserQuestion,
} from '@clio/core';
import type { SidebarSession } from './components/Sidebar.js';
import { getRequestLocale } from './locale.js';
import { inTauri, tauriFetch } from './tauri.js';

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
  status: Accessor<'connecting' | 'open' | 'closed' | 'error' | 'reconnecting'>;
  /** Seconds remaining until the next reconnect attempt (0 when not pending). */
  reconnectInSec: Accessor<number>;
  /** Last known `message.completed` summary for the active session. */
  lastCompletion: Accessor<MessageCompletion | null>;
  /** Per-session cost rolled forward by `cost.updated` events. */
  costUsd: Accessor<number>;
  /** Currently in-flight tool calls (started but not completed). */
  runningTools: Accessor<RunningTool[]>;
  /** Currently pending orchestrator ask-user questions (PR #380). */
  pendingQuestion: Accessor<UserQuestion | null>;
  /** Force-refetch the message list (e.g. after undo/rewind). */
  refetch: () => Promise<void>;
}

export interface RunningTool {
  callId: string;
  toolName: string;
  startedAt: number;
  /** Optional progress 0..1 from `tool.call.progress` events. */
  progress?: number;
  /** Last status message from tool.call.progress. */
  progressMessage?: string;
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
  const client = new Client({
    baseUrl: opts.url,
    bearerToken: opts.bearerToken,
    fetch: inTauri() ? tauriFetch : undefined,
    getLocale: getRequestLocale,
  });

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
  sessionEvents?: SessionEventSink & Partial<NotificationSink>,
): LiveTranscriptHandle {
  const [messages, setMessages] = createSignal<Message[]>([]);
  const [pendingPermission, setPendingPermission] = createSignal<PermissionRequest | null>(null);
  const [status, setStatus] = createSignal<
    'connecting' | 'open' | 'closed' | 'error' | 'reconnecting'
  >('closed');
  const [reconnectInSec, setReconnectInSec] = createSignal(0);
  const [lastCompletion, setLastCompletion] = createSignal<MessageCompletion | null>(null);
  const [costUsd, setCostUsd] = createSignal<number>(0);
  const [runningTools, setRunningTools] = createSignal<RunningTool[]>([]);
  const [pendingQuestion, setPendingQuestion] = createSignal<UserQuestion | null>(null);

  // Backoff ladder. Each step caps at 10s so we don't go silent for
  // minutes after a few attempts; the user can still force-recover by
  // navigating away and back.
  const BACKOFF_LADDER = [1, 2, 5, 10, 10, 10];

  createEffect(() => {
    const id = activeSessionId();
    if (!id) {
      setMessages([]);
      setPendingPermission(null);
      setStatus('closed');
      setReconnectInSec(0);
      setLastCompletion(null);
      setCostUsd(0);
      setRunningTools([]);
      setPendingQuestion(null);
      return;
    }

    // Seed pending questions on session activation — there might be
    // one already waiting from before SSE was connected.
    void client
      .sessionQuestions(id, 'pending')
      .then(({ questions }) => setPendingQuestion(questions[0] ?? null))
      .catch(() => setPendingQuestion(null));

    void client
      .messages(id)
      .then(({ messages: existing }) => setMessages(existing))
      .catch(() => setMessages([]));

    void client
      .permissions(id)
      .then(({ permissions }) => setPendingPermission(permissions[0] ?? null))
      .catch(() => setPendingPermission(null));

    let es: EventSource | null = null;
    let attempt = 0;
    let countdownTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

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
      'tool.call.progress',
      'tool.call.completed',
      'permission.requested',
      'permission.resolved',
      'cost.updated',
      'notification',
      'user_question.created',
      'user_question.answered',
      'user_question.cancelled',
      'user_question.resumed',
      'lm.provider.changed',
      'lm.provider.failed',
    ];

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
        setRunningTools,
        setPendingQuestion,
        sessionEvents,
        onNotification: sessionEvents?.onNotification,
      });
    };

    function clearReconnectTimers() {
      if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      setReconnectInSec(0);
    }

    function teardownEs() {
      if (!es) return;
      for (const name of named) es.removeEventListener(name, onEvent as EventListener);
      es.close();
      es = null;
    }

    function scheduleReconnect() {
      if (disposed) return;
      const delay =
        BACKOFF_LADDER[Math.min(attempt, BACKOFF_LADDER.length - 1)] ?? 10;
      attempt += 1;
      setStatus('reconnecting');
      setReconnectInSec(delay);
      countdownTimer = setInterval(() => {
        setReconnectInSec((s) => (s > 1 ? s - 1 : 0));
      }, 1000);
      reconnectTimer = setTimeout(() => {
        clearReconnectTimers();
        openEs();
      }, delay * 1000);
    }

    function openEs() {
      if (disposed) return;
      teardownEs();
      setStatus('connecting');
      const next = new EventSource(client.sseUrl(id));
      es = next;
      next.onopen = () => {
        attempt = 0;
        setStatus('open');
      };
      next.onerror = () => {
        // EventSource emits onerror both on transient hiccups and on
        // permanent close. We treat it uniformly: tear down and back
        // off. Browser's auto-reconnect is unreliable when the server
        // rejects mid-stream — explicit control is safer.
        teardownEs();
        setStatus('error');
        scheduleReconnect();
      };
      for (const name of named) next.addEventListener(name, onEvent as EventListener);
    }

    openEs();

    onCleanup(() => {
      disposed = true;
      clearReconnectTimers();
      teardownEs();
      setStatus('closed');
    });
  });

  async function refetch(): Promise<void> {
    const id = activeSessionId();
    if (!id) return;
    try {
      const { messages: fresh } = await client.messages(id);
      setMessages(fresh);
    } catch {
      // ignore — SSE will catch up on the next event.
    }
  }

  return {
    messages,
    pendingPermission,
    status,
    reconnectInSec,
    lastCompletion,
    costUsd,
    runningTools,
    pendingQuestion,
    refetch,
  };
}

export interface SessionEventSink {
  patch: (id: string, p: Partial<SidebarSession>) => void;
  setRaw?: (
    next: SidebarSession[] | ((prev: SidebarSession[]) => SidebarSession[]),
  ) => void;
  /** Force a refetch of `/v1/sessions` — used when SSE signals a field
   * change (title, status, archived) whose new value isn't in the
   * event payload. */
  refetch?: () => void;
}

export interface BackendNotification {
  level: 'info' | 'warning' | 'error';
  title: string;
  body?: string;
}

export interface NotificationSink {
  onNotification: (n: BackendNotification) => void;
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
    setRunningTools: (
      n: RunningTool[] | ((p: RunningTool[]) => RunningTool[]),
    ) => void;
    setPendingQuestion: (q: UserQuestion | null) => void;
    sessionEvents?: SessionEventSink;
    onNotification?: (n: BackendNotification) => void;
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
      // Clear any lingering running-tool indicators — a completed
      // turn means none should still be in flight.
      hooks.setRunningTools(() => []);
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
        hooks.sessionEvents.patch(sid, {
          status: next,
          bumpedAt: Date.now(),
        });
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
        // thing is to mark the row as "updatedAt: just now" + bump it.
        hooks.sessionEvents.patch(sid, {
          updatedAt: 'just now',
          bumpedAt: Date.now(),
        });
        // Autorename hint — when the agent (or the user via slash
        // command) renames the session backend-side, mirror the TUI's
        // transient "agent renamed this" affordance: refetch so the new
        // title flows into the sessions list, and surface a quiet info
        // toast so the change isn't silent.
        if (changed.includes('title')) {
          hooks.sessionEvents.refetch?.();
          hooks.onNotification?.({
            level: 'info',
            title: 'Session renamed',
            body: `Backend updated the title of session ${sid.slice(0, 8)}.`,
          });
        }
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
    case 'tool.call.started': {
      const toolName = (p.tool_name as string) ?? 'tool';
      const callId =
        (p.call_id as string) ??
        (p.tool_call_id as string) ??
        `${toolName}-${Date.now()}`;
      hooks.setRunningTools((prev) => {
        if (prev.some((t) => t.callId === callId)) return prev;
        return [...prev, { callId, toolName, startedAt: Date.now() }];
      });
      break;
    }
    case 'tool.call.progress': {
      const callId = (p.call_id as string) ?? (p.tool_call_id as string);
      if (!callId) break;
      const progressVal = p.progress;
      const totalVal = p.total;
      const message = p.message as string | undefined;
      const ratio =
        typeof progressVal === 'number' && typeof totalVal === 'number' && totalVal > 0
          ? Math.min(1, Math.max(0, progressVal / totalVal))
          : typeof progressVal === 'number' && progressVal <= 1
          ? Math.min(1, Math.max(0, progressVal))
          : undefined;
      hooks.setRunningTools((prev) =>
        prev.map((t) =>
          t.callId === callId
            ? {
                ...t,
                ...(ratio != null ? { progress: ratio } : {}),
                ...(message ? { progressMessage: message } : {}),
              }
            : t,
        ),
      );
      break;
    }
    case 'tool.call.completed': {
      const callId = (p.call_id as string) ?? (p.tool_call_id as string);
      if (callId) {
        hooks.setRunningTools((prev) => prev.filter((t) => t.callId !== callId));
      }
      break;
    }
    case 'user_question.created':
    case 'user_question.resumed': {
      const q = p.question as UserQuestion | undefined;
      if (q && q.status === 'pending') hooks.setPendingQuestion(q);
      break;
    }
    case 'user_question.answered':
    case 'user_question.cancelled': {
      // Either resolution clears the active card. The post-handler
      // (the caller) refetches the transcript so the resumed turn
      // shows up.
      hooks.setPendingQuestion(null);
      break;
    }
    case 'lm.provider.changed': {
      const providerId = (p.provider_id as string) ?? 'unknown';
      const modelId = (p.model_id as string) ?? '';
      hooks.onNotification?.({
        level: 'info',
        title: 'Model swapped',
        body: modelId ? `${providerId} / ${modelId}` : providerId,
      });
      break;
    }
    case 'lm.provider.failed': {
      const providerId = (p.provider_id as string) ?? 'unknown';
      const reason =
        (p.error as string) ?? (p.message as string) ?? 'no detail provided';
      hooks.onNotification?.({
        level: 'error',
        title: `${providerId} failed`,
        body: reason,
      });
      break;
    }
    case 'notification': {
      const level = (p.level as string) ?? 'info';
      const title = (p.title as string) ?? 'Notification';
      const body = p.body as string | undefined;
      hooks.onNotification?.({
        level: level === 'warning' || level === 'error' ? level : 'info',
        title,
        ...(body ? { body } : {}),
      });
      break;
    }
    case 'message.part.completed':
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
