/**
 * Declares the LiveTranscriptHandle shape and creates the backing Solid signals
 * (messages, status, completion, cost, running tools, semantic/execution feeds).
 */
import { createSignal, type Accessor, type Setter } from 'solid-js';
import { createStore, reconcile, unwrap } from 'solid-js/store';
import type {
  Message,
  PermissionRequest,
  SemanticEventPayload,
  UserQuestion,
} from '@clio/core';
import type {
  ExecutionTranscriptEvent,
  MessageCompletion,
  RunningTool,
} from './LiveReducer.js';
import type { StreamStats } from './LiveStreamStats.js';
import type { LiveConnectionStatus } from './LiveReconnect.js';
import type { LivePendingInteractionsHandle } from './LivePendingInteractionsHandle.js';

export interface LiveTranscriptHandle {
  messages: Accessor<Message[]>;
  /** True while the initial message list for the active session loads. */
  messagesLoading: Accessor<boolean>;
  pendingPermission: Accessor<PermissionRequest | null>;
  /** Connection state to the SSE stream for the current session. */
  status: Accessor<LiveConnectionStatus>;
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
  /** Read-only semantic execution trace for the active session
   * (clio `x_clio_semantic_events`). Append-only, cleared on session
   * switch, capped at SEMANTIC_FEED_CAP. Feeds the Inspector timeline -
   * NOT the transcript (the plain events already drive that). */
  semanticEvents: Accessor<SemanticEventPayload[]>;
  /** Chronological transcript projection input: assistant text deltas,
   * handoff parts, ReAct steps, expert extracts, and tool events. This is
   * the transcript highway; semanticEvents remains the Inspector feed. */
  executionEvents: Accessor<ExecutionTranscriptEvent[]>;
  /** TTFT + token-rate of the most recent turn (null before the first turn). */
  streamStats: Accessor<StreamStats | null>;
  /** Force-refetch the message list (e.g. after undo/rewind). */
  refetch: () => Promise<void>;
  /** Skip the backoff countdown and reconnect the SSE stream right now -
   * wired to the "Reconnect now" action on the disconnect toast. No-op when
   * the stream is already open or no session is active. */
  reconnectNow: () => void;
  /** Optimistically clear the pending permission card after a successful
   * resolve POST. The card must not depend on the `permission.resolved`
   * SSE round-trip alone - on the desktop the bridge/fallback stream can
   * miss the event window (found by the real-WebView e2e), and a 200 from
   * the resolve endpoint already proves the permission is settled. */
  clearPendingPermission: () => void;
  /** Focused sub-handle owning the pending permission + question lifecycle.
   * `pendingPermission`, `pendingQuestion` and `clearPendingPermission` above
   * are flattened from here for backward-compatible flat access. */
  pending: LivePendingInteractionsHandle;
}

export interface LiveTranscriptSignals {
  messages: Accessor<Message[]>;
  setMessages: Setter<Message[]>;
  messagesLoading: Accessor<boolean>;
  setMessagesLoading: Setter<boolean>;
  pendingPermission: Accessor<PermissionRequest | null>;
  setPendingPermission: Setter<PermissionRequest | null>;
  status: Accessor<LiveConnectionStatus>;
  setStatus: Setter<LiveConnectionStatus>;
  reconnectInSec: Accessor<number>;
  setReconnectInSec: Setter<number>;
  lastCompletion: Accessor<MessageCompletion | null>;
  setLastCompletion: Setter<MessageCompletion | null>;
  costUsd: Accessor<number>;
  setCostUsd: Setter<number>;
  runningTools: Accessor<RunningTool[]>;
  setRunningTools: Setter<RunningTool[]>;
  pendingQuestion: Accessor<UserQuestion | null>;
  setPendingQuestion: Setter<UserQuestion | null>;
  semanticEvents: Accessor<SemanticEventPayload[]>;
  setSemanticEvents: Setter<SemanticEventPayload[]>;
  executionEvents: Accessor<ExecutionTranscriptEvent[]>;
  setExecutionEvents: Setter<ExecutionTranscriptEvent[]>;
  streamStats: Accessor<StreamStats | null>;
  setStreamStats: Setter<StreamStats | null>;
}

export function createLiveTranscriptSignals(): LiveTranscriptSignals {
  // Messages are backed by a fine-grained store + reconcile(key:'id') rather than
  // a plain signal. Each SSE delta produces a *new* immutable message array (see
  // appendPart/applyTextAppend in @clio/core); reconcile diffs it INTO the store
  // by id, so unchanged messages — and the in-flight streaming message and its
  // already-rendered parts — keep their object identity. Solid's <For> then
  // reconciles in place instead of destroying and recreating the whole assistant
  // subtree (article → body → every row) on every token. This is the streaming
  // perf fix: per-delta DOM work drops to the one new/changed row.
  const [msgStore, setMsgStore] = createStore<{ list: Message[] }>({ list: [] });
  const messages: Accessor<Message[]> = () => msgStore.list;
  const setMessages = ((arg: Message[] | ((prev: Message[]) => Message[])) => {
    const next =
      typeof arg === 'function'
        ? (arg as (prev: Message[]) => Message[])(unwrap(msgStore.list))
        : arg;
    setMsgStore('list', reconcile(next ?? [], { key: 'id' }));
    return msgStore.list;
  }) as Setter<Message[]>;
  const [messagesLoading, setMessagesLoading] = createSignal(false);
  const [pendingPermission, setPendingPermission] = createSignal<PermissionRequest | null>(null);
  const [status, setStatus] = createSignal<LiveConnectionStatus>('closed');
  const [reconnectInSec, setReconnectInSec] = createSignal(0);
  const [lastCompletion, setLastCompletion] = createSignal<MessageCompletion | null>(null);
  const [costUsd, setCostUsd] = createSignal<number>(0);
  const [runningTools, setRunningTools] = createSignal<RunningTool[]>([]);
  const [pendingQuestion, setPendingQuestion] = createSignal<UserQuestion | null>(null);
  const [semanticEvents, setSemanticEvents] = createSignal<SemanticEventPayload[]>([]);
  const [executionEvents, setExecutionEvents] = createSignal<ExecutionTranscriptEvent[]>([]);
  const [streamStats, setStreamStats] = createSignal<StreamStats | null>(null);

  return {
    messages,
    setMessages,
    messagesLoading,
    setMessagesLoading,
    pendingPermission,
    setPendingPermission,
    status,
    setStatus,
    reconnectInSec,
    setReconnectInSec,
    lastCompletion,
    setLastCompletion,
    costUsd,
    setCostUsd,
    runningTools,
    setRunningTools,
    pendingQuestion,
    setPendingQuestion,
    semanticEvents,
    setSemanticEvents,
    executionEvents,
    setExecutionEvents,
    streamStats,
    setStreamStats,
  };
}
