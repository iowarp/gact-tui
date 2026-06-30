/**
 * The conversation transcript: virtualised list of message views with search,
 * scroll management, and the per-message part renderers.
 */
import { For, Show, createMemo } from 'solid-js';
import type { FileDiff, Message, SemanticEventPayload } from '@clio/core';
import type { ExecutionTranscriptEvent } from '../live.js';
import type { ModelOption } from './ComposerTypes.js';
import type { TranscriptDensity } from './TranscriptParts.js';
import { TranscriptSkeleton } from './TranscriptSkeleton.js';
import { MessageView } from './TranscriptMessageView.js';
import { AssistantTurnView } from './AssistantTurnView.js';
import { createTranscriptPresentationModel } from './TranscriptPresentationModel.js';
import { createTranscriptHashNavigation } from './TranscriptHashNavigation.js';
import { createTranscriptVirtualization } from './TranscriptVirtualization.js';
import type { NormalizedTranscriptState } from '../NormalizedTranscriptEvents.js';
import './transcript.css';
import './inline-markdown.css';

export type { TranscriptDensity } from './TranscriptParts.js';

export interface TranscriptProps {
  messages: Message[];
  /** True while the message list is loading (session switch) — renders
   * skeleton bubbles instead of a blank pane (W3 Tier-1). */
  loading?: boolean;
  density: TranscriptDensity;
  onOpenDiff?: (diff: FileDiff) => void;
  /** Optional per-message action callbacks. Wired in LiveDriven mode. */
  onCopy?: (msg: Message) => void;
  onRegenerate?: (msg: Message) => void;
  /** Retry variants (1.0 item 4). When either is provided the Regenerate
   * button opens a variant menu instead of firing immediately; clio's
   * retry route accepts `notes` and `provider_id`/`model_id` overrides. */
  onRegenerateWithNotes?: (msg: Message, notes: string) => void;
  onRegenerateWithModel?: (msg: Message, model: ModelOption) => void;
  /** Available models for the "Regenerate with model" submenu. */
  models?: ModelOption[];
  onEdit?: (msg: Message) => void;
  onQuote?: (msg: Message) => void;
  onDelete?: (msg: Message) => void;
  onPinFile?: (path: string) => void;
  /** Currently-focused message id (drives the Inspector). */
  selectedId?: string;
  onSelect?: (msg: Message) => void;
  /** Cmd+F highlight state. */
  searchQuery?: string;
  /** Match identifier "<message_id>:<index>" pointing at the focused hit. */
  currentMatchKey?: string;
  /** When true, the last text part of the last assistant message renders a streaming cursor. */
  streaming?: boolean;
  /** When set, assistant messages render a Speak button that pulls
   * TTS audio from POST /v1/sessions/{id}/voice/synthesize. */
  onSpeak?: (msg: Message) => void | Promise<void>;
  /** When set, renders a copy-link action that calls back with the
   * message id; ChatScreen wraps it into a `clio://session/<sid>#<mid>`
   * permalink and writes to the clipboard. */
  onCopyPermalink?: (msg: Message) => void | Promise<void>;
  /** The scrollable ancestor (ChatScreen's `chat__pane`). Required for
   * virtual windowing of very large transcripts (1.0 item 6) — without it
   * (or below the threshold) every message renders, exactly as before. */
  scrollEl?: HTMLElement;
  /**
   * A2 — backend advertises capabilities.multimodal_image_parts. When
   * explicitly false, image parts render an honest "image not supported
   * by this backend" placeholder instead of an inline <img>. Defaults to
   * true (absent capability is treated as allowed).
   */
  imagePartsSupported?: boolean;
  /** Resolve a workspace file path to an inline image data URL — used to render
   *  tool artifacts (e.g. a plot's output_path) inline in the transcript. */
  readWorkspaceImage?: (path: string) => Promise<{ url: string; mediaType: string } | null>;
  /** Chronological CLIO execution ledger. When present, assistant execution
   * renders as one interleaved timeline instead of separate semantic/message
   * blocks. Shared by web and desktop. */
  executionEvents?: ExecutionTranscriptEvent[];
  normalizedTranscript?: NormalizedTranscriptState;
  /** v0.2 semantic-execution spine. When provided, each assistant turn gets an
   * opt-in collapsible "execution trace" strip (agent invocations, expert
   * handoffs, tool timings, memory access) keyed by `turn_id`. Additive: absent
   * or empty leaves the transcript exactly as before. */
  semanticEvents?: SemanticEventPayload[];
}

export function Transcript(props: TranscriptProps) {
  // Render the REAL, ordered message parts directly — both live and persisted.
  // The assistant-turn projection (one append-only ordered row log built from
  // the parts in wire-arrival order) lives in buildAssistantTurnModel, used by
  // MessageView. We no longer substitute a separately-projected execution_tree
  // synthetic part (which re-grouped/re-ordered the turn and diverged from the
  // persisted render) — that violated the append-only conversation invariant.
  const hasAssistantMessages = createMemo(() =>
    props.messages.some((message) => message.role === 'assistant'),
  );
  const hasNormalizedTranscript = createMemo(
    () => (props.normalizedTranscript?.rows.length ?? 0) > 0 && !hasAssistantMessages(),
  );
  const displayMessages = createMemo(() => props.messages);
  const { virtual, vwindow, visible, offsetOfIndex } = createTranscriptVirtualization({
    messages: displayMessages,
    scrollEl: () => props.scrollEl,
    currentMatchKey: () => props.currentMatchKey,
  });
  const presentation = createTranscriptPresentationModel({
    messages: displayMessages,
    searchQuery: () => props.searchQuery,
    streaming: () => props.streaming,
    density: () => props.density,
  });
  createTranscriptHashNavigation({
    messages: displayMessages,
    virtual,
    offsetOfIndex,
    scrollEl: () => props.scrollEl,
  });

  return (
    // aria-live: screen readers announce streamed content as it lands
    // (polite — queued behind the user's current reading position).
    // aria-busy flags the in-flight turn so AT can defer announcement.
    <div
      class={'trx' + (virtual() ? ' trx--virtual' : '')}
      data-density={props.density}
      data-testid="transcript"
      aria-live="polite"
      aria-busy={props.streaming ? 'true' : 'false'}
    >
      <Show when={props.loading && displayMessages().length === 0}>
        <TranscriptSkeleton />
      </Show>
      <Show when={virtual()}>
        <div
          class="trx__spacer"
          style={{ height: `${vwindow().padTop}px` }}
          aria-hidden="true"
          data-testid="trx-spacer-top"
        />
      </Show>
      <For each={visible()}>
        {(m) => {
          const target = presentation.streamingTarget();
          const partIdx = target?.msgId === m.id ? target.partIdx : -1;
          return (
            <MessageView
              msg={m}
              density={props.density}
              onOpenDiff={props.onOpenDiff}
              onPinFile={props.onPinFile}
              onCopy={props.onCopy}
              onRegenerate={props.onRegenerate}
              onRegenerateWithNotes={props.onRegenerateWithNotes}
              onRegenerateWithModel={props.onRegenerateWithModel}
              models={props.models}
              onEdit={props.onEdit}
              onQuote={props.onQuote}
              onSpeak={props.onSpeak}
              onCopyPermalink={props.onCopyPermalink}
              onDelete={props.onDelete}
              selected={m.id === props.selectedId}
              onSelect={props.onSelect}
              searchQuery={props.searchQuery}
              currentMatchKey={props.currentMatchKey}
              matchBaseIndex={presentation.baseIndexFor(m.id)}
              streamingPartIdx={partIdx}
              imagePartsSupported={props.imagePartsSupported}
              readWorkspaceImage={props.readWorkspaceImage}
            />
          );
        }}
      </For>
      <Show when={hasNormalizedTranscript()}>
        <article
          class="trx-msg anim-rise trx-msg--assistant"
          data-testid="normalized-transcript-message"
        >
          <div class="trx-msg__body">
            <AssistantTurnView
              rows={props.normalizedTranscript?.rows ?? []}
              density={props.density}
              onOpenDiff={props.onOpenDiff}
              onPinFile={props.onPinFile}
              imagePartsSupported={props.imagePartsSupported}
              readWorkspaceImage={props.readWorkspaceImage}
              messageId="normalized-transcript"
            />
          </div>
        </article>
      </Show>
      <Show when={virtual()}>
        <div
          class="trx__spacer"
          style={{ height: `${vwindow().padBottom}px` }}
          aria-hidden="true"
          data-testid="trx-spacer-bottom"
        />
      </Show>
    </div>
  );
}
