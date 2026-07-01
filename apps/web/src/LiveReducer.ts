/**
 * Top-level SSE event dispatcher: routes each decoded event to the specialised
 * Live*Events reducers (messages, sessions, tools, notifications, semantics,
 * pending interactions, refresh) that mutate the transcript signals.
 *
 * Dispatch is declarative: every event name in {@link LIVE_SSE_EVENT_TYPES} is
 * mapped, in {@link EVENT_HANDLERS}, to the domain reducer that claims it. The
 * map is keyed by the `LiveEventType` union, so adding a backend event to
 * `LIVE_SSE_EVENT_TYPES` without wiring a handler is a compile-time error here
 * — not a silent runtime warn. The per-domain `apply*Event` reducers are
 * unchanged; this file only routes through them.
 */
import { type LiveEventType, LIVE_SSE_EVENT_TYPES } from './LiveConnectionConfig.js';
import {
  applyLiveNotificationEvent,
  type BackendNotification,
  type LiveNotificationHooks,
} from './LiveNotifications.js';
import { applyLiveMessageEvent, type MessageEventHooks } from './LiveMessageEvents.js';
import {
  applyPendingInteractionEvent,
  type PendingInteractionHooks,
} from './LivePendingInteractions.js';
import {
  applyLiveSessionEvent,
  type LiveSessionEventHooks,
} from './LiveSessionEvents.js';
import { applySemanticFeedEvent, type SemanticFeedHooks } from './LiveSemanticFeed.js';
import {
  applyLiveNormalizedTranscriptEvent,
  type NormalizedTranscriptHooks,
} from './LiveNormalizedTranscriptEvents.js';
import { applyLiveToolEvent, type ToolEventHooks } from './LiveToolEvents.js';
import { applyLiveRefreshEvent, type RefreshEventHooks } from './LiveRefreshEvents.js';

export type { ExecutionTranscriptEvent } from './LiveExecutionEvents.js';
export type { BackendNotification } from './LiveNotifications.js';
export type { RunningTool } from './LiveRunningTools.js';
export type { SessionEventSink } from './LiveSessionEvents.js';
export type { MessageCompletion } from './LiveMessageEvents.js';

export interface NotificationSink {
  onNotification: (n: BackendNotification) => void;
  /** Fires on context.frame.{created,completed} so consumers can
   * refetch /v1/sessions/{id}/context/frames. */
  onFrameChanged?: () => void;
  /** Fires on context.file.{added,removed} so the Inspector Context tab
   * can refetch /v1/sessions/{id}/context/files. */
  onContextFilesChanged?: () => void;
  /** Fires on file.diff.{applied,rejected,write_failed} so the Inspector
   * Diffs tab can refetch the session's pending diffs. */
  onDiffChanged?: () => void;
  /** Fires on memory.search.completed so any open Memory drawer can
   * refresh hits. */
  onMemoryChanged?: () => void;
}

// ---------------------------------------------------------------------------
// Domain-focused hook interfaces.
//
// `ReduceHooks` used to be a 25-field god-interface that every handler took
// whole and re-declared a narrow subset of. Instead, each domain reducer owns
// its own hook interface (in its own file) and `ReduceHooks` composes them, so
// the top-level call site supplies one object that structurally satisfies every
// per-domain subset. The `apply*Event` reducers keep taking only their slice.
// ---------------------------------------------------------------------------

/** Message-stream signals: transcript feed, completion summary, cost, running
 * tools, execution trace. Driven by `message.*` and `cost.updated`. */
export type MessageHooks = MessageEventHooks;

/** Running-tool + execution-trace signals. Driven by `tool.call.*`. */
export type ToolHooks = ToolEventHooks;

/** Sidebar session list + pending-permission signal + rename toasts. Driven by
 * `session.{created,updated,deleted,status_changed}`. */
export type SessionHooks = LiveSessionEventHooks;

/** Pending permission + pending user-question signals. Driven by
 * `permission.*` and `user_question.*`. */
export type InteractionHooks = PendingInteractionHooks;

/** Read-only semantic feed + execution-trace projection. Driven by
 * `semantic.event`. */
export type ExecutionHooks = SemanticFeedHooks;

/** Provider-agnostic normalized transcript stream. */
export type NormalizedHooks = NormalizedTranscriptHooks;

/** Toast notifications + memory-refresh signal. Driven by lifecycle events
 * (provider swap/fail, summarize/compact, sub-agents, memory search, retries). */
export type NotificationHooks = LiveNotificationHooks;

/** Refetch/refresh signals for context frames, context files, diffs, plus the
 * session.cleared reset. Driven by `context.*`, `file.diff.*`, `session.cleared`. */
export type RefreshHooks = RefreshEventHooks;

/**
 * The full hook bag the live transcript passes to {@link reduce}. It composes
 * every domain-focused interface above; structural typing means a single
 * object that has all the fields satisfies each narrow `apply*Event` subset.
 */
export interface ReduceHooks
  extends MessageHooks,
    ToolHooks,
    SessionHooks,
    InteractionHooks,
    ExecutionHooks,
    NormalizedHooks,
    NotificationHooks,
    RefreshHooks {
  /** Fires when an event type matched none of the handlers. Lets callers
   * surface protocol drift (a new backend event we don't reduce yet) instead
   * of silently dropping it. Defaults to a console.warn when unset. */
  onUnhandled?: (type: string | undefined, payload: Record<string, unknown>) => void;
}

// ---------------------------------------------------------------------------
// Declarative dispatch registry.
// ---------------------------------------------------------------------------

/** A domain reducer: inspects (type, payload) and applies it to `hooks` if it
 * recognises the type, returning whether it consumed the event. */
type DomainHandler = (
  type: string | undefined,
  payload: Record<string, unknown>,
  hooks: ReduceHooks,
) => boolean;

/** Connection-level events (`server.connected`, `server.heartbeat`) are
 * registered on the SSE stream but carry no transcript state, so no domain
 * reducer claims them. Routing them here (rather than omitting them) keeps
 * {@link EVENT_HANDLERS} exhaustive over `LIVE_SSE_EVENT_TYPES` at compile
 * time, while preserving the historical behaviour of falling through to
 * `onUnhandled`/console.warn (it returns false → "not consumed"). */
const notReducedByDomain: DomainHandler = () => false;

/**
 * Maps every SSE event name to the domain reducer that handles it. Keyed by the
 * `LiveEventType` union, so a new type added to `LIVE_SSE_EVENT_TYPES` without a
 * handler here fails `tsc` (missing key) instead of warning at runtime.
 */
const EVENT_HANDLERS: Record<LiveEventType, DomainHandler> = {
  // Connection lifecycle — no transcript state.
  'server.connected': notReducedByDomain,
  'server.heartbeat': notReducedByDomain,

  // Sessions.
  'session.created': applyLiveSessionEvent,
  'session.updated': applyLiveSessionEvent,
  'session.deleted': applyLiveSessionEvent,
  'session.status_changed': applyLiveSessionEvent,

  // Notifications (lifecycle toasts + memory refresh).
  'session.summarized': applyLiveNotificationEvent,
  'session.compacted': applyLiveNotificationEvent,
  'lm.provider.changed': applyLiveNotificationEvent,
  'lm.provider.failed': applyLiveNotificationEvent,
  notification: applyLiveNotificationEvent,
  'subagent.started': applyLiveNotificationEvent,
  'subagent.completed': applyLiveNotificationEvent,
  'memory.search.completed': applyLiveNotificationEvent,
  'turn.retry_requested': applyLiveNotificationEvent,
  'turn.retry_running': applyLiveNotificationEvent,
  'turn.retry_completed': applyLiveNotificationEvent,
  'turn.retry_failed': applyLiveNotificationEvent,
  'turn.retry_cancelled': applyLiveNotificationEvent,

  // Pending interactions (permissions + user questions).
  'permission.requested': applyPendingInteractionEvent,
  'permission.resolved': applyPendingInteractionEvent,
  'user_question.created': applyPendingInteractionEvent,
  'user_question.answered': applyPendingInteractionEvent,
  'user_question.cancelled': applyPendingInteractionEvent,
  'user_question.expired': applyPendingInteractionEvent,
  'user_question.resumed': applyPendingInteractionEvent,

  // Semantic feed / execution-trace projection.
  'semantic.event': applySemanticFeedEvent,

  // Normalized transcript stream.
  'turn.started': applyLiveNormalizedTranscriptEvent,
  'turn.trace.delta': applyLiveNormalizedTranscriptEvent,
  'turn.text.delta': applyLiveNormalizedTranscriptEvent,
  'turn.action.added': applyLiveNormalizedTranscriptEvent,
  'call.result.delta': applyLiveNormalizedTranscriptEvent,
  'turn.completed': applyLiveNormalizedTranscriptEvent,
  'state.updated': applyLiveNormalizedTranscriptEvent,

  // Message stream.
  'message.created': applyLiveMessageEvent,
  'message.part.added': applyLiveMessageEvent,
  'message.part.delta': applyLiveMessageEvent,
  'message.part.completed': applyLiveMessageEvent,
  'message.completed': applyLiveMessageEvent,
  'message.error': applyLiveMessageEvent,
  'message.deleted': applyLiveMessageEvent,
  'cost.updated': applyLiveMessageEvent,

  // Tool calls.
  'tool.call.started': applyLiveToolEvent,
  'tool.call.progress': applyLiveToolEvent,
  'tool.call.completed': applyLiveToolEvent,

  // Refresh / refetch signals + session reset.
  'context.frame.created': applyLiveRefreshEvent,
  'context.frame.completed': applyLiveRefreshEvent,
  'context.file.added': applyLiveRefreshEvent,
  'context.file.removed': applyLiveRefreshEvent,
  'file.diff.applied': applyLiveRefreshEvent,
  'file.diff.rejected': applyLiveRefreshEvent,
  'file.diff.write_failed': applyLiveRefreshEvent,
  'session.cleared': applyLiveRefreshEvent,
};

// Belt-and-braces: assert at module-eval that no declared type is missing a
// handler (the Record type already enforces this at compile time; this guards
// against a hand-edited registry losing a key under a loosened tsconfig).
for (const type of LIVE_SSE_EVENT_TYPES) {
  if (!(type in EVENT_HANDLERS)) {
    throw new Error(`[live] no SSE handler registered for declared event type: ${type}`);
  }
}

export function reduce(
  ev: { type?: string; payload?: Record<string, unknown> },
  hooks: ReduceHooks,
) {
  const t = ev.type;
  const p = ev.payload ?? {};
  const handler = t === undefined ? undefined : EVENT_HANDLERS[t as LiveEventType];
  if (handler && handler(t, p, hooks)) return;
  // No handler claimed the event (unknown type, or a connection-level event
  // with no transcript state). Make it observable rather than dropping it.
  if (hooks.onUnhandled) hooks.onUnhandled(t, p);
  else console.warn(`[live] unhandled SSE event type: ${t ?? '(none)'}`);
}
