import type {
  CommandDefinition,
  CommentAttachment,
  ComposerMessagePart,
  MessageBehavior,
  MessageDelivery,
  RunState,
  WorkspaceReference,
  SummonTargets,
  WorkspaceResource,
} from '@clio/core/v3';
import type { ReactNode } from 'react';
import type { InlineReferenceSelection } from '@/lib/composer-reference-domain';
import type { ModelReasoningLevels } from '@/lib/reasoning-levels';
import type {
  ResourceUploadProgress,
  UploadableFilePart,
  WorkspaceResourceUploadResult,
} from '@/lib/upload-workspace-resources';
import type { CommandListState } from './composer-command-menu';
import type { ComposerQueueControls } from './composer-queue';

export interface ClioComposerProps extends ComposerQueueControls {
  state: RunState;
  attachments: boolean;
  provider?: string;
  model?: string;
  modelCatalogStatus?: 'error' | 'loading' | 'ready';
  effort?: string;
  /** The configured (global) level: displayed when nothing is picked, never sent. */
  configuredEffort?: string;
  executionMode?: MessageBehavior['execution_mode'];
  confirmationPolicy?: MessageBehavior['confirmation_policy'];
  modelOptions?: Array<{
    providerId: string;
    providerName: string;
    id: string;
    label: string;
    description?: string;
    available: boolean;
    availabilityDetail?: string;
    configurationUrl?: string;
    endpoint?: string;
    freshness?: string;
    health?: string;
    modalities?: readonly string[];
    reasoning?: ModelReasoningLevels;
    aliases?: readonly string[];
  }>;
  disabled?: boolean;
  /** A send is out and the service hasn't taken it yet; a slow one says so in the row. */
  sending?: boolean;
  /**
   * The connection's defaults are still loading. The draft stays editable; the
   * controls and the send wait, and an Enter pressed meanwhile sends once ready.
   */
  connecting?: boolean;
  /** Keep the draft editable while the first session catalog is registering. */
  catalogPreparing?: boolean;
  contextReferences?: boolean;
  /**
   * The service's capabilities are still loading, so `attachments` and
   * `contextReferences` aren't known yet. `+` and `@` hold their place, disabled.
   */
  capabilitiesPending?: boolean;
  workspaceId?: string;
  sessionId?: string;
  commands?: CommandDefinition[];
  /** Whether `commands` is the agent's list yet (default `ready`). */
  commandsState?: CommandListState;
  /** The subagents and MCP servers the person can `@`-summon (fetched for the session if absent). */
  summonTargets?: SummonTargets;
  onSubmit: (value: {
    text: string;
    files: UploadableFilePart[];
    references: Exclude<ComposerMessagePart, { type: 'text' }>[];
    provider?: string;
    model?: string;
    delivery: MessageDelivery | 'queued';
    behavior: MessageBehavior;
    onUploadProgress: (progress: ResourceUploadProgress) => void;
    /** The fleet model (`<account>/<model>`) SPOTTER review runs on in a new conversation. */
    spotterModel?: string;
  }) => Promise<void>;
  onBehaviorChange?: (behavior: MessageBehavior) => Promise<void>;
  spotterModel?: string;
  /** Stores the session's SPOTTER model (empty: conversation model); else the draft keeps it. */
  onSpotterModelChange?: (ref: string) => Promise<void>;
  onDiscardFiles?: (files: readonly UploadableFilePart[]) => Promise<void>;
  onPrepareFiles?: (
    files: readonly UploadableFilePart[],
    onProgress?: (progress: ResourceUploadProgress) => void,
    signal?: AbortSignal,
  ) => Promise<WorkspaceResourceUploadResult>;
  onStop?: () => void;
  onCommand?: (value: { commandId: string; input: string }) => Promise<void>;
  onRetryModelCatalog?: (providerId?: string) => void;
  onHeightChange?: (height: number) => void;
  activityControl?: ReactNode;
  workSummary?: ReactNode;
  pendingInteractions?: ReactNode;
  resources?: readonly WorkspaceResource[];
  onOpenResource?: (resource: WorkspaceResource) => void;
  onOpenReference?: (reference: WorkspaceReference) => void;
  value?: string;
  onValueChange?: (value: string) => void;
  /**
   * The references the draft carries. Controlled alongside `value` by whoever
   * owns the draft: the composer is remounted whenever the session, model or
   * layout branch changes, so state kept inside it would be destroyed while the
   * text beside it survived.
   */
  references?: readonly InlineReferenceSelection[];
  onReferencesChange?: (references: readonly InlineReferenceSelection[]) => void;
  /** Selections attached to the next message (sent as quotes ahead of the text). */
  /** Comment sessions attached to the next message (answers, A2UI views, pages). */
  annotations?: readonly CommentAttachment[];
  onAnnotationsChange?: (annotations: readonly CommentAttachment[]) => void;
  focusRequestKey?: number;
  /**
   * Place the caret in the editor on mount when nothing else holds focus. Skipped
   * on touch screens so arriving on the page doesn't raise the on-screen keyboard.
   */
  autoFocus?: boolean;
  variant?: 'docked' | 'welcome';
  /**
   * Hint shown in the empty editor. Defaults to steering copy in a conversation
   * and to the open invitation on the welcome page.
   */
  placeholder?: string;
}
