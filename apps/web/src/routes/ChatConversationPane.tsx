/**
 * The conversation pane: transcript + composer column for the active session.
 * Exports {@link ChatConversationPane}.
 */
import type {
  FileDiff,
  Message,
  PermissionRequest,
  PermissionScope,
  SemanticEventPayload,
  UserQuestion,
} from '@clio/core';
import type { JSX } from 'solid-js';
import { Client } from '@clio/core';
import type { BackendHandle } from '../App.js';
import type {
  ModelOption,
  ModelProviderOption,
  PermissionMode,
} from '../components/ComposerTypes.js';
import type { TranscriptDensity } from '../components/Transcript.js';
import type { ExecutionTranscriptEvent } from '../live.js';
import type { NormalizedTranscriptState } from '../NormalizedTranscriptEvents.js';
import { ChatConversationComposer } from './ChatConversationComposer.js';
import { ChatConversationTranscript } from './ChatConversationTranscript.js';
import type { SessionRow } from '../components/SessionsColumn.js';
import type { TranscriptScrollController } from './chatTranscriptScroll.js';
import { previewWorkspaceIdForSession } from './chatLayoutSelectionModel.js';

export interface ChatConversationPaneProps {
  backendUrl: string;
  voiceCapable: boolean;
  caps?: BackendHandle['capabilities'];
  workspaceClient: Client;
  activeId: string;
  sessions: SessionRow[];
  selectedWorkspaceId?: string;
  density: TranscriptDensity;
  messages: Message[];
  messagesLoading?: boolean;
  pendingPermission: PermissionRequest | null;
  pendingQuestion?: UserQuestion | null;
  composerDisabled: boolean;
  streaming?: boolean;
  responseActivity?: string;
  previewActive: boolean;
  transcriptScroll: TranscriptScrollController;
  searchQuery: string;
  currentMatchKey: string;
  selectedMessageId: string;
  draftReloadTick: number;
  models?: ModelOption[];
  modelProviders?: ModelProviderOption[];
  selectedModelId?: string;
  permMode?: PermissionMode;
  executionEvents?: ExecutionTranscriptEvent[];
  normalizedTranscript?: NormalizedTranscriptState;
  semanticEvents?: SemanticEventPayload[];
  onSubmit?: (text: string) => Promise<void> | void;
  onStop?: () => void | Promise<void>;
  onPermissionDecide?: (decision: 'approve' | 'deny', scope?: PermissionScope) => void;
  onAnswerQuestion?: (body: {
    answer?: string;
    selected_options?: string[];
  }) => void | Promise<void>;
  onCancelQuestion?: () => void | Promise<void>;
  onOpenDiff: (diff: FileDiff) => void;
  onSelectMessage: (id: string) => void;
  onCopyMessage?: (msg: Message) => void;
  onRegenerate?: (msg: Message) => void;
  onRegenerateWithNotes?: (msg: Message, notes: string) => void;
  onRegenerateWithModel?: (msg: Message, model: ModelOption) => void;
  onEditMessage?: (msg: Message) => void;
  onQuoteMessage?: (msg: Message) => void;
  onDeleteMessage?: (msg: Message) => void;
  onPinFile?: (path: string) => void;
  onSpeakMessage?: (msg: Message) => void | Promise<void>;
  onCopyMessagePermalink?: (msg: Message) => void | Promise<void>;
  onSlashTyped: () => void;
  onOpenCommandPalette: () => void;
  onPickModel?: (m: ModelOption) => void | Promise<void>;
  onPickPermMode?: (m: PermissionMode) => void | Promise<void>;
  onOpenSettings?: () => void;
  onAddRemote?: () => void;
  renderContextFooter?: () => JSX.Element;
}

export function ChatConversationPane(props: ChatConversationPaneProps) {
  // Resolve a workspace file path (often the absolute output_path emitted by a
  // tool) into an inline image data URL via the workspace file-read endpoint.
  // The workspace id is the active session's workspace (falling back to the
  // selected one); the endpoint accepts absolute paths under the workspace root.
  const readWorkspaceImage = async (
    path: string,
  ): Promise<{ url: string; mediaType: string } | null> => {
    const workspaceId = previewWorkspaceIdForSession({
      sessions: props.sessions,
      activeId: props.activeId,
      ...(props.selectedWorkspaceId ? { selectedWorkspaceId: props.selectedWorkspaceId } : {}),
    });
    if (!workspaceId) return null;
    try {
      const content = await props.workspaceClient.readWorkspaceFile(workspaceId, path);
      if (!content?.data) return null;
      const mediaType = content.media_type || 'image/png';
      if (!mediaType.startsWith('image/')) return null;
      return { url: `data:${mediaType};base64,${content.data}`, mediaType };
    } catch {
      return null;
    }
  };

  return (
    <>
      <ChatConversationTranscript
        readWorkspaceImage={readWorkspaceImage}
        activeId={props.activeId}
        voiceCapable={props.voiceCapable}
        caps={props.caps}
        density={props.density}
        messages={props.messages}
        messagesLoading={props.messagesLoading}
        pendingPermission={props.pendingPermission}
        pendingQuestion={props.pendingQuestion}
        streaming={props.streaming}
        responseActivity={props.responseActivity}
        previewActive={props.previewActive}
        transcriptScroll={props.transcriptScroll}
        searchQuery={props.searchQuery}
        currentMatchKey={props.currentMatchKey}
        selectedMessageId={props.selectedMessageId}
        models={props.models}
        executionEvents={props.executionEvents}
        normalizedTranscript={props.normalizedTranscript}
        semanticEvents={props.semanticEvents}
        onSubmit={props.onSubmit}
        onPermissionDecide={props.onPermissionDecide}
        onAnswerQuestion={props.onAnswerQuestion}
        onCancelQuestion={props.onCancelQuestion}
        onOpenDiff={props.onOpenDiff}
        onSelectMessage={props.onSelectMessage}
        onCopyMessage={props.onCopyMessage}
        onRegenerate={props.onRegenerate}
        onRegenerateWithNotes={props.onRegenerateWithNotes}
        onRegenerateWithModel={props.onRegenerateWithModel}
        onEditMessage={props.onEditMessage}
        onQuoteMessage={props.onQuoteMessage}
        onDeleteMessage={props.onDeleteMessage}
        onPinFile={props.onPinFile}
        onSpeakMessage={props.onSpeakMessage}
        onCopyMessagePermalink={props.onCopyMessagePermalink}
      />

      {props.renderContextFooter?.()}

      <ChatConversationComposer
        backendUrl={props.backendUrl}
        voiceCapable={props.voiceCapable}
        caps={props.caps}
        workspaceClient={props.workspaceClient}
        activeId={props.activeId}
        sessions={props.sessions}
        selectedWorkspaceId={props.selectedWorkspaceId}
        composerDisabled={props.composerDisabled}
        streaming={props.streaming}
        draftReloadTick={props.draftReloadTick}
        models={props.models}
        modelProviders={props.modelProviders}
        selectedModelId={props.selectedModelId}
        permMode={props.permMode}
        onSubmit={props.onSubmit}
        onStop={props.onStop}
        onSlashTyped={props.onSlashTyped}
        onOpenCommandPalette={props.onOpenCommandPalette}
        onPickModel={props.onPickModel}
        onPickPermMode={props.onPickPermMode}
        onOpenSettings={props.onOpenSettings}
        onAddRemote={props.onAddRemote}
      />
    </>
  );
}
