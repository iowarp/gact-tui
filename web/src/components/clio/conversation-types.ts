import type {
  ActionCardAction,
  Artifact,
  A2UIActionLifecycle,
  A2UISurface,
  ClioRepository,
  Message as DomainMessage,
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

export interface ClioConversationProps {
  messages: readonly DomainMessage[];
  loading?: boolean;
  error?: string;
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
  mcpAppRepository?: ClioRepository;
  interactions?: readonly PendingInteraction[];
  onInteractionResponse?: (
    interaction: PendingInteraction,
    response: PendingInteractionResponse,
  ) => Promise<void>;
}

export interface ConversationMessageRowProps extends Omit<ClioConversationProps, 'messages'> {
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
}
