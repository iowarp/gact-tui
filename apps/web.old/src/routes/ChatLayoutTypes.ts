/**
 * Shared TypeScript types for the chat layout tree — the prop/state shapes
 * threaded between ChatLayout and its column/panel/overlay children.
 */
import type {
  CapabilityFlags,
  ContextFile,
  ContextFileContent,
  Message,
  PermissionRequest,
  PermissionScope,
  SemanticEventPayload,
  SessionTask,
  SlashCommandDef,
  TurnAttempt,
  UserQuestion,
} from '@clio/core';
import type {
  ExecutionTranscriptEvent,
  RunningTool,
  StreamStats,
} from '../live.js';
import type {
  ModelOption,
  ModelProviderOption,
  PermissionMode,
} from '../components/ComposerTypes.js';
import type { BackendHandle } from '../App.js';
import type { SessionBindings } from '../components/InspectorBindings.js';
import type { ContextFrameRow } from '../components/InspectorFrames.js';
import type { ScheduleRow } from '../components/InspectorSchedules.js';
import type { SessionDiffRow } from '../components/InspectorDiffs.js';
import type { DetachedSession } from '../detached.js';
import type { SessionRow, WorkspaceOption } from '../components/SessionsColumn.js';
import type { TranscriptDensity } from '../components/Transcript.js';
import type { SessionSemanticOption, SessionSemanticsSelection } from '../session-semantics.js';
import type { SettingsSection } from './SettingsShell.js';

export interface ChatLayoutProps {
  backendUrl: string;
  voiceCapable: boolean;
  sessions: SessionRow[];
  /** True while /v1/sessions loads — SessionsColumn renders skeleton rows. */
  sessionsLoading?: boolean;
  activeId: string;
  onSelect: (id: string) => void;
  density: TranscriptDensity;
  setDensity: (d: TranscriptDensity) => void;
  messages: Message[];
  /** True while the active session's messages load — Transcript renders
   * skeleton bubbles. */
  messagesLoading?: boolean;
  /** Live mode only: show the first-run onboarding tour when the profile
   * has never completed it. Fixture mode never enables this. */
  enableOnboarding?: boolean;
  pendingPermission: PermissionRequest | null;
  pendingQuestion?: UserQuestion | null;
  onSubmit?: (text: string) => Promise<void> | void;
  onPermissionDecide?: (decision: 'approve' | 'deny', scope?: PermissionScope) => void;
  onAnswerQuestion?: (body: {
    answer?: string;
    selected_options?: string[];
  }) => void | Promise<void>;
  onCancelQuestion?: () => void | Promise<void>;
  onStop?: () => void | Promise<void>;
  composerDisabled: boolean;
  streaming?: boolean;
  sseStatus?: 'connecting' | 'open' | 'closed' | 'error' | 'reconnecting';
  sseReconnectInSec?: number;
  runningTools?: RunningTool[];
  responseActivity?: string;
  /** TTFT + token rate of the most recent turn (W3 Tier-2). */
  streamStats?: StreamStats | null;
  sessionTokens?: { input?: number; output?: number; total?: number };
  preOpen?: string | null;
  sessionCostUsd?: number;
  /** When set to the active session id and recent, the topbar flashes
   * a "renamed" pill so the user notices an auto-rename. */
  renamedSessionId?: string | null;
  onNewSession?: (selection?: SessionSemanticsSelection, title?: string) => void | Promise<void>;
  sessionSemanticsOptions?: {
    blueprints: SessionSemanticOption[];
    expertPacks: SessionSemanticOption[];
  };
  sessionSemanticsLoading?: boolean;
  onRefreshSessionSemantics?: () => void | Promise<void>;
  onOpenSettings?: (section?: SettingsSection) => void;
  onAddRemote?: () => void;
  caps?: BackendHandle['capabilities'];
  /** SessionsColumn workspace switcher wiring (LiveDriven path only). */
  workspaces?: WorkspaceOption[];
  selectedWorkspaceId?: string;
  onPickWorkspace?: (id: string) => void;
  /** Manual refresh for the sessions list (LiveDriven path only). */
  onRefreshSessions?: () => void | Promise<void>;
  /** Import a session from a JSON export (LiveDriven path only). */
  onImportSession?: (blob: Record<string, unknown>) => void | Promise<void>;
  /** Per-session actions (LiveDriven path only). */
  onRenameSession?: (id: string, nextTitle: string) => void | Promise<void>;
  onDeleteSession?: (id: string) => void | Promise<void>;
  onExportSession?: (id: string, format?: 'json' | 'md') => void | Promise<void>;
  onShareSession?: (id: string) => void | Promise<void>;
  onForkSession?: (id: string) => void | Promise<void>;
  onTogglePin?: (id: string) => void;
  onSummarize?: () => void | Promise<void>;
  onUndoTurn?: () => void | Promise<void>;
  onCompactSession?: () => void | Promise<void>;
  /** Composer wiring (LiveDriven path only). */
  models?: ModelOption[];
  modelProviders?: ModelProviderOption[];
  selectedModelId?: string;
  onPickModel?: (m: ModelOption) => void | Promise<void>;
  permMode?: PermissionMode;
  onPickPermMode?: (m: PermissionMode) => void | Promise<void>;
  slashCommands?: SlashCommandDef[];
  sessionTasks?: SessionTask[];
  contextFiles?: ContextFile[];
  contextFrames?: ContextFrameRow[];
  /**
   * Inspector-drawer action callbacks, grouped because they share a single
   * consumer ({@link ChatLayoutSidePanels} → InspectorDrawer) and a single
   * concern: mutating the per-session inspector state (diffs, schedules,
   * bindings, context files, tasks, frames). Grouping these collapses ~11 flat
   * fields off the top-level prop tunnel into one cohesive object.
   */
  inspectorActions: ChatInspectorActions;
  onSpeakMessage?: (msg: Message) => void | Promise<void>;
  onCopyMessagePermalink?: (msg: Message) => void | Promise<void>;
  onExtractAgent?: () => void | Promise<void>;
  onSummarizeWithInstructions?: () => void | Promise<void>;
  capsFlags?: CapabilityFlags;
  /** Retry-attempt lineage for the Inspector Attempts tab (1.0 item 3). */
  attempts?: TurnAttempt[];
  sessionDiffs?: SessionDiffRow[];
  schedules?: ScheduleRow[];
  sessionBindings?: SessionBindings;
  detachedSessions?: DetachedSession[];
  onReattachDetached?: (sessionId: string) => void;
  onWalkAway?: () => void;
  /** Execute a backend slash command via the structured endpoint
   * POST /v1/sessions/{id}/commands/{cmd}. */
  onRunCommand?: (commandId: string, args: Record<string, unknown>) => Promise<unknown>;
  /** Message-level actions. */
  onCopyMessage?: (msg: Message) => void;
  onRegenerate?: (msg: Message) => void;
  /** Retry variants (1.0 item 4) — notes + model overrides on clio's retry route. */
  onRegenerateWithNotes?: (msg: Message, notes: string) => void;
  onRegenerateWithModel?: (msg: Message, model: ModelOption) => void;
  onEditMessage?: (msg: Message) => void;
  onQuoteMessage?: (msg: Message) => void;
  onDeleteMessage?: (msg: Message) => void;
  onPinFile?: (path: string) => void;
  /** Read-only semantic execution trace for the active session (GAP 3) —
   * feeds the Inspector Timeline tab. */
  semanticEvents?: SemanticEventPayload[];
  /** Transcript projection ledger: assistant deltas and semantic execution
   * events in receive order. Shared by web and desktop. */
  executionEvents?: ExecutionTranscriptEvent[];
  /** Capability gate for the semantic trace (x_clio_semantic_events). */
  semanticEventsEnabled?: boolean;
}

/**
 * Inspector-drawer action callbacks, grouped off {@link ChatLayoutProps}.
 *
 * Every one of these mutates per-session inspector state and is forwarded by a
 * single consumer ({@link ChatLayoutSidePanels} → InspectorDrawer), so they form
 * a cohesive sub-object rather than ~11 sibling fields on the flat tunnel. The
 * fields keep their original names so the InspectorDrawer wiring below the
 * routes layer is untouched.
 */
export interface ChatInspectorActions {
  onCycleContextFileMode?: (path: string, next: 'read' | 'edit' | 'pin') => void | Promise<void>;
  onLoadFrameDetail?: (frameId: string) => Promise<Record<string, unknown>>;
  onApplyAllDiffs?: () => void | Promise<void>;
  onRejectAllDiffs?: () => void | Promise<void>;
  onCycleTaskStatus?: (taskId: string, next: SessionTask['status']) => void | Promise<void>;
  /** Capability-gated context-file content preview (1.0 item 2). */
  onPreviewContextFile?: (path: string) => Promise<ContextFileContent>;
  onCreateSchedule?: (body: { cron: string; prompt: string }) => void | Promise<void>;
  onDeleteSchedule?: (scheduleId: string) => void | Promise<void>;
  onSetBlueprint?: (id: string | null) => void | Promise<void>;
  onSetExpertPack?: (id: string | null) => void | Promise<void>;
  onRemoveContextFile?: (path: string) => void | Promise<void>;
}
