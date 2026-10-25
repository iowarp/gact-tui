import type {
  ActionCardAction,
  Artifact,
  A2UIActionLifecycle,
  A2UISurface,
  AsyncProcess,
  AttentionAvailable,
  ClioRepository,
  Message as DomainMessage,
  PendingCompaction,
  PendingInteraction,
  PendingInteractionResponse,
  SubagentRun,
  Task as DomainTask,
  ToolInvocation,
  WorkspaceReference,
  WorkspaceResource,
} from '@clio/core/v3';
import type { ConversationDisplayMode } from '@/providers/conversation-display-provider';
import type { McpAppResponseActivityData } from './mcp-app-surface';
import type { FileSearchLocation } from '@/lib/search-matches';
import type { SubagentOpenTarget } from './subagent-card';
import type { TurnPreparationProps } from './turn-preparation';
import type { ConversationModelBoundary } from './conversation-model-boundaries';
import type { ConversationForkOrigin } from './conversation-fork-origin';
import type { ConversationTurnPresentation } from './conversation-turn-model';

export interface ClioConversationProps {
  messages: readonly DomainMessage[];
  loading?: boolean;
  error?: string;
  /**
   * The workspace this transcript is rendering, so a presentation block that
   * does not carry its own `workspace_id` (or a caller composing a message
   * outside the live session store) can still resolve which workspace a
   * `workspace_file` block's path belongs to.
   */
  workspaceId?: string;
  sessionId?: string;
  /** Recorded/catalog-resolved agent identity for this conversation, separate from the product. */
  agentName?: string;
  forkOrigin?: ConversationForkOrigin;
  tools: Record<string, ToolInvocation>;
  tasks: Record<string, DomainTask>;
  processes?: readonly AsyncProcess[];
  subagents: Record<string, SubagentRun>;
  artifacts: Record<string, Artifact>;
  surfaces: Record<string, A2UISurface>;
  /**
   * Server-truth footer state per surface (`a2ui.action.received|delivered|
   * consumed|failed|duplicate`, dispatcher slice S5), keyed by surface id —
   * `EntityState.a2ui_action_lifecycles`. Stream-only (no REST snapshot
   * backs it), so a caller not wired to the live store may omit it; the
   * footer (`a2ui-action-lifecycle.tsx`) then just stays absent.
   */
  actionLifecycles?: Record<string, A2UIActionLifecycle>;
  resources?: Record<string, WorkspaceResource>;
  /**
   * This session's live compactions (`EntityState.compactions`): a running one
   * renders as "Summarizing context" where it started, a failed one as its
   * typed error. Stream-only, so a caller not wired to the live store omits it.
   */
  compactions?: readonly PendingCompaction[];
  onActionCardAction?: (action: ActionCardAction) => void | Promise<unknown>;
  onForkFromMessage?: (messageId: string) => void | Promise<unknown>;
  forkingMessageId?: string;
  markedMessageIds?: ReadonlySet<string>;
  markingMessageId?: string;
  onMarkMessage?: (messageId: string, marked: boolean) => Promise<void>;
  onRewindToMessage?: (messageId: string) => void | Promise<unknown>;
  rewindingMessageId?: string;
  onRetryMessage?: (messageId: string) => void | Promise<unknown>;
  retryingMessageId?: string;
  onOpenArtifact?: (artifact: Artifact) => void;
  onOpenFile?: (path: string) => void;
  onOpenFolder?: (path: string) => void;
  onOpenFileReference?: (path: string, location: FileSearchLocation) => void;
  onOpenWork?: () => void;
  onOpenResource?: (
    resource: WorkspaceResource,
    relatedResources?: readonly WorkspaceResource[],
  ) => void;
  onOpenReference?: (reference: WorkspaceReference) => void;
  onOpenSubagent?: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
  /** Open the flow run recorded under a task handle (a workflow, a council, ...). */
  onOpenFlow?: (handle: string, label?: string) => void;
  pendingMessageIds?: ReadonlySet<string>;
  cancellablePendingMessageIds?: ReadonlySet<string>;
  cancellingPendingMessageId?: string;
  onCancelPendingSteer?: (messageId: string) => void | Promise<unknown>;
  bottomInset?: number;
  preparation?: Omit<TurnPreparationProps, 'messages'>;
  mcpAppRepository?: ClioRepository;
  interactions?: readonly PendingInteraction[];
  onInteractionResponse?: (
    interaction: PendingInteraction,
    response: PendingInteractionResponse,
  ) => Promise<void>;
  /** "Understand attention" result currently shown, if any (`useAttentionMode`, status `shown`). */
  attentionData?: AttentionAvailable;
}

export interface ConversationMessageRowProps extends Omit<ClioConversationProps, 'messages'> {
  /** Feedback consumed at recorded boundaries inside this response. */
  feedbackMessages?: readonly DomainMessage[];
  /** Harness entries displayed inside the following response's activity group. */
  injectionMessages?: readonly DomainMessage[];
  /** Retain the original message anchor without rendering a second injection row. */
  injectionsGrouped?: boolean;
  active?: boolean;
  /** Canonical first iteration of the latest live activity group, including joined continuations. */
  liveActivityId?: string;
  responseContinued?: boolean;
  /** A resumed segment of the same response, without a repeated sender header. */
  responseContinuation?: boolean;
  /** Adjacent human bubbles share their sender header, retaining separate identities. */
  userContinuation?: boolean;
  userContinued?: boolean;
  /** Ordered activity joined across adjacent internal continuation turns. */
  turnPresentation?: ConversationTurnPresentation;
  displayMode: ConversationDisplayMode;
  message: DomainMessage;
  index: number;
  start?: number;
  recent: boolean;
  measureElement?: (element: Element | null) => void;
  virtualized?: boolean;
  onDisplayModeChange: (mode: ConversationDisplayMode) => void;
  activeMcpAppId?: string;
  mcpAppResponse?: McpAppResponseActivityData;
  /** The compactions positioned after this message's content. */
  messageCompactions?: readonly PendingCompaction[];
  /** A recorded provider/model segment beginning at this message. */
  modelBoundary?: ConversationModelBoundary;
}
