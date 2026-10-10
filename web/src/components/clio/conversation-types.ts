import type {
  ActionCardAction,
  Artifact,
  A2UIActionLifecycle,
  A2UISurface,
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
import type { SubagentOpenTarget } from './subagent-card';
import type { TurnPreparationProps } from './turn-preparation';
import type { ConversationModelBoundary } from './conversation-model-boundaries';

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
  tools: Record<string, ToolInvocation>;
  tasks: Record<string, DomainTask>;
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
  onRewindToMessage?: (messageId: string) => void | Promise<unknown>;
  rewindingMessageId?: string;
  onRetryMessage?: (messageId: string) => void | Promise<unknown>;
  retryingMessageId?: string;
  onOpenArtifact?: (artifact: Artifact) => void;
  onOpenFile?: (path: string) => void;
  onOpenWork?: () => void;
  onOpenResource?: (
    resource: WorkspaceResource,
    relatedResources?: readonly WorkspaceResource[],
  ) => void;
  onOpenReference?: (reference: WorkspaceReference) => void;
  onOpenSubagent?: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
  onOpenWorkflow?: (tool: ToolInvocation) => void;
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
  active?: boolean;
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
