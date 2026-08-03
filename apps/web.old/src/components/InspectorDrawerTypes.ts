/**
 * Shared prop and tab-identifier types for the Inspector drawer and its tabs.
 */
import type {
  ContextFile,
  ContextFileContent,
  FileDiff,
  Message,
  SemanticEventPayload,
  SessionTask,
  TurnAttempt,
} from '@clio/core';
import type { SessionDiffRow } from './InspectorDiffs.js';
import type { IntegrationStatus } from './InspectorIntegrations.js';
import type { SessionBindings } from './InspectorBindings.js';
import type { ContextFrameRow } from './InspectorFrames.js';
import type { ScheduleRow } from './InspectorSchedules.js';
import type { ToolCallSummary } from './InspectorToolCalls.js';

export interface InspectorDrawerProps {
  open: boolean;
  /** Latest assistant message (or current turn) — drives the metadata panel. */
  message: Message | null;
  /** Pending tool-call activity for the active turn. */
  toolCalls: ToolCallSummary[];
  /** Rolling per-session cost. */
  costUsd: number;
  /** Tokens for the latest completed turn. */
  tokens?: { input?: number; output?: number; total?: number };
  /** Optional model identifier shown in the header. */
  model?: string;
  /** Backend integration health entries (from /v1/health when capability is on). */
  integrations?: IntegrationStatus[];
  /** Per-session task list from /v1/sessions/{id}/tasks. */
  tasks?: SessionTask[];
  /** Cycle a task's status — wired by ChatScreen to PATCH /v1/tasks/{tid}. */
  onCycleTaskStatus?: (taskId: string, next: SessionTask['status']) => void | Promise<void>;
  /** Per-session context files from /v1/sessions/{id}/context/files. */
  contextFiles?: ContextFile[];
  /** Fetch a context file's bytes for inline preview (1.0 item 2) — wired
   * by ChatScreen to `client.readWorkspaceFile` (workspace-scoped read;
   * replaced the removed session context-file-content endpoint). */
  onPreviewContextFile?: (path: string) => Promise<ContextFileContent>;
  /** Recorded retry attempts for this session (1.0 item 3) — from
   * GET /v1/sessions/{id}/attempts. Surfaces the Attempts tab. */
  attempts?: TurnAttempt[];
  /** Per-session time-series memory snapshots from
   * /v1/sessions/{id}/context/frames. Surfaces in the Frames tab. */
  frames?: ContextFrameRow[];
  /** Lazy-load a single frame's full payload — wired by ChatScreen to
   * `client.sessionContextFrame(sid, frameId)`. */
  onLoadFrameDetail?: (frameId: string) => Promise<Record<string, unknown>>;
  /** Per-session pending diffs from /v1/sessions/{id}/diffs — these
   * surface on the Diffs tab in addition to the current message's
   * file_diff parts so the user can see everything pending in the
   * session. */
  sessionDiffs?: SessionDiffRow[];
  /** Bulk-apply all pending diffs (POST /v1/sessions/{id}/diffs/apply). */
  onApplyAllDiffs?: () => void | Promise<void>;
  /** Bulk-reject all pending diffs. */
  onRejectAllDiffs?: () => void | Promise<void>;
  /** Per-session cron triggers from /v1/sessions/{id}/schedules. */
  schedules?: ScheduleRow[];
  /** Create a new schedule (POST /v1/sessions/{id}/schedules). */
  onCreateSchedule?: (body: { cron: string; prompt: string }) => void | Promise<void>;
  /** Delete a schedule (DELETE /v1/schedules/{id}). */
  onDeleteSchedule?: (scheduleId: string) => void | Promise<void>;
  /** Per-session blueprint + expert-pack bindings (PR #386/#387 + #344). */
  bindings?: SessionBindings;
  /** Bind a different blueprint to the active session. Pass null to clear. */
  onSetBlueprint?: (blueprintId: string | null) => void | Promise<void>;
  /** Bind a different expert pack to the active session. Pass null to clear. */
  onSetExpertPack?: (packId: string | null) => void | Promise<void>;
  /** Read-only semantic execution trace for the active session
   * (clio `x_clio_semantic_events`). Passed pre-filtered to the active
   * session by ChatScreen; the Timeline tab groups them by turn_id and
   * renders rows the part-derived timeline doesn't already cover. */
  semanticEvents?: SemanticEventPayload[];
  /** Capability gate — only render the semantic rows when the backend
   * advertises `x_clio_semantic_events`. */
  semanticEventsEnabled?: boolean;
  /** Called when the user clicks a diff entry — opens the DiffPane. */
  onOpenDiff?: (diff: FileDiff) => void;
  /** Callback to remove a context file (DELETE /v1/sessions/{id}/context/files). */
  onRemoveContextFile?: (path: string) => void | Promise<void>;
  /** Cycle a context file's mode (read → edit → pin → read). */
  onCycleContextFileMode?: (path: string, next: 'read' | 'edit' | 'pin') => void | Promise<void>;
  onClose: () => void;
}

export type InspectorTab =
  | 'turn'
  | 'timeline'
  | 'tools'
  | 'diffs'
  | 'thinking'
  | 'tasks'
  | 'attempts'
  | 'context'
  | 'frames'
  | 'schedules'
  | 'bindings'
  | 'health';
