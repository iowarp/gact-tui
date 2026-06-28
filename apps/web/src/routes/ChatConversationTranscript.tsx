/**
 * Transcript slot of the conversation pane: renders the message feed with
 * scroll/search wiring. Exports {@link ChatConversationTranscript}.
 */
import { Show } from 'solid-js';
import { brand } from '@brand';
import type {
  FileDiff,
  Message,
  PermissionRequest,
  PermissionScope,
  SemanticEventPayload,
  UserQuestion,
} from '@clio/core';
import type { BackendHandle } from '../App.js';
import type { ModelOption } from '../components/ComposerTypes.js';
import { Icon } from '../components/Icon.js';
import { PermissionCard } from '../components/PermissionCard.js';
import { Transcript, type TranscriptDensity } from '../components/Transcript.js';
import { UserQuestionCard } from '../components/UserQuestionCard.js';
import type { ExecutionTranscriptEvent } from '../live.js';
import { EmptyState } from './EmptyState.js';
import type { TranscriptScrollController } from './chatTranscriptScroll.js';
import './chat-conversation-transcript.css';

export interface ChatConversationTranscriptProps {
  activeId: string;
  voiceCapable: boolean;
  caps?: BackendHandle['capabilities'];
  density: TranscriptDensity;
  messages: Message[];
  messagesLoading?: boolean;
  pendingPermission: PermissionRequest | null;
  pendingQuestion?: UserQuestion | null;
  streaming?: boolean;
  responseActivity?: string;
  previewActive: boolean;
  transcriptScroll: TranscriptScrollController;
  searchQuery: string;
  currentMatchKey: string;
  selectedMessageId: string;
  models?: ModelOption[];
  executionEvents?: ExecutionTranscriptEvent[];
  semanticEvents?: SemanticEventPayload[];
  onSubmit?: (text: string) => Promise<void> | void;
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
  /** Resolve a workspace file path to an inline image data URL (for tool
   *  artifacts like plot output_path). */
  readWorkspaceImage?: (path: string) => Promise<{ url: string; mediaType: string } | null>;
}

export function ChatConversationTranscript(props: ChatConversationTranscriptProps) {
  return (
    <>
      <div
        class="chat__pane"
        data-testid="transcript-pane"
        ref={props.transcriptScroll.setPaneRef}
        onScroll={props.transcriptScroll.onPaneScroll}
      >
        <div class="chat__pane-inner">
          <Show when={props.messages.length === 0 && !props.pendingPermission}>
            <EmptyState
              hasSession={!!props.activeId}
              previewActive={props.previewActive}
              onPrompt={(prompt) => void props.onSubmit?.(prompt)}
            />
          </Show>
          <Show when={props.pendingPermission}>
            <PermissionCard
              request={props.pendingPermission!}
              onDecide={props.onPermissionDecide}
            />
          </Show>
          <Show when={props.pendingQuestion && props.onAnswerQuestion && props.onCancelQuestion}>
            <UserQuestionCard
              question={props.pendingQuestion!}
              onAnswer={props.onAnswerQuestion!}
              onCancel={props.onCancelQuestion!}
            />
          </Show>
          <Transcript
            messages={props.messages}
            loading={props.messagesLoading}
            density={props.density}
            onOpenDiff={props.onOpenDiff}
            onCopy={props.onCopyMessage}
            onRegenerate={props.onRegenerate}
            onRegenerateWithNotes={props.onRegenerateWithNotes}
            onRegenerateWithModel={props.onRegenerateWithModel}
            models={props.models}
            onEdit={props.onEditMessage}
            onQuote={props.onQuoteMessage}
            onDelete={props.onDeleteMessage}
            onPinFile={props.onPinFile}
            onSpeak={props.voiceCapable ? props.onSpeakMessage : undefined}
            onCopyPermalink={props.onCopyMessagePermalink}
            selectedId={props.selectedMessageId}
            onSelect={(message) => props.onSelectMessage(message.id)}
            searchQuery={props.searchQuery}
            currentMatchKey={props.currentMatchKey}
            streaming={props.streaming}
            scrollEl={props.transcriptScroll.scrollEl()}
            imagePartsSupported={props.caps?.capabilities?.['multimodal_image_parts'] !== false}
            readWorkspaceImage={props.readWorkspaceImage}
            executionEvents={props.executionEvents}
            semanticEvents={props.semanticEvents}
          />
          <Show when={props.streaming && props.messages.length > 0}>
            <div class="chat__typing" data-testid="chat-typing">
              <span class="chat__typing-avatar" aria-hidden>
                <Icon name="bot" size={14} />
              </span>
              <span class="chat__typing-copy">
                <span class="chat__typing-label">{brand.name} is responding</span>
                <Show when={props.responseActivity}>
                  <span class="chat__typing-detail">{props.responseActivity}</span>
                </Show>
              </span>
              <span class="chat__typing-dots" aria-hidden>
                <span class="chat__typing-dot" />
                <span class="chat__typing-dot" />
                <span class="chat__typing-dot" />
              </span>
            </div>
          </Show>
          <Show
            when={props.messages.length > 0 || props.pendingPermission || props.pendingQuestion}
          >
            <div class="chat__composer-clearance" aria-hidden="true" />
          </Show>
        </div>
      </div>

      <Show
        when={
          props.transcriptScroll.scrolledUp() && !props.pendingPermission && !props.pendingQuestion
        }
      >
        <button
          type="button"
          class="chat__scroll-pill"
          onClick={props.transcriptScroll.scrollToBottom}
          data-testid="scroll-to-bottom"
        >
          <Icon name="chevron-down" size={14} />
          <Show
            when={props.transcriptScroll.newSinceScroll() > 0}
            fallback={<span>Jump to latest</span>}
          >
            <span>{props.transcriptScroll.newSinceScroll()} new</span>
          </Show>
        </button>
      </Show>
    </>
  );
}
