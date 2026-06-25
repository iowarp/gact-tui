/**
 * Renders a single transcript message: header, ordered part views, status, and
 * the hover action row.
 */
import { For, Show, createMemo } from 'solid-js';
import type { FileDiff, Message } from '@clio/core';
import type { ModelOption } from './ComposerTypes.js';
import { metadataToolDiffs } from './TranscriptToolParts.js';
import { PartView, shouldRenderPart, type TranscriptDensity } from './TranscriptParts.js';
import { TranscriptMessageHeader } from './TranscriptMessageHeader.js';
import { MessageStatusPanels } from './TranscriptMessageStatus.js';
import { TurnWorkflowBlocker, turnWorkflowBlocker } from './WorkflowState.js';
import { AssistantTurnView } from './AssistantTurnView.js';
import type { AssistantTurnModel } from './transcriptDelegationModel.js';
import { buildAssistantTurnModel, reconcileTurnModel } from './transcriptDelegationModel.js';
import './transcript-message.css';

export interface MessageViewProps {
  msg: Message;
  density: TranscriptDensity;
  onOpenDiff?: (diff: FileDiff) => void;
  onCopy?: (msg: Message) => void;
  onRegenerate?: (msg: Message) => void;
  onRegenerateWithNotes?: (msg: Message, notes: string) => void;
  onRegenerateWithModel?: (msg: Message, model: ModelOption) => void;
  models?: ModelOption[];
  onEdit?: (msg: Message) => void;
  onQuote?: (msg: Message) => void;
  onDelete?: (msg: Message) => void;
  onPinFile?: (path: string) => void;
  onSpeak?: (msg: Message) => void | Promise<void>;
  onCopyPermalink?: (msg: Message) => void | Promise<void>;
  selected?: boolean;
  onSelect?: (msg: Message) => void;
  searchQuery?: string;
  currentMatchKey?: string;
  matchBaseIndex?: number;
  /** Index of the part that should show the streaming cursor (or -1). */
  streamingPartIdx?: number;
  imagePartsSupported?: boolean;
}

export function MessageView(props: MessageViewProps) {
  const role = () => props.msg.role;
  const isAssistant = () => role() === 'assistant';
  const metadataDiffs = createMemo(() => metadataToolDiffs(props.msg));
  const turnBlocker = createMemo(() =>
    isAssistant() ? turnWorkflowBlocker(props.msg.parts ?? []) : null,
  );
  // For assistant turns carrying delegation/handoff structure, render the
  // flowing, indented, TUI-style view (dedupe + strip + depth) instead of the
  // flat per-part box loop. Searching disables it so the highlight loop stays
  // authoritative. User turns and plain assistant turns keep the simple path.
  // Rebuilt per SSE delta, but identity-stabilised against the previous model so
  // Solid's <For> only re-renders the block that actually changed (perf — see
  // reconcileTurnModel). `prevModel` persists across the memo's recomputations.
  let prevModel: AssistantTurnModel | null = null;
  const turnModel = createMemo(() => {
    if (!isAssistant() || props.searchQuery?.trim()) {
      prevModel = null;
      return null;
    }
    const next = buildAssistantTurnModel(props.msg.parts ?? []);
    if (!next) {
      prevModel = null;
      return null;
    }
    const stable = reconcileTurnModel(prevModel, next);
    prevModel = stable;
    return stable;
  });

  return (
    <article
      class={'trx-msg anim-rise trx-msg--' + role() + (props.selected ? ' is-selected' : '')}
      id={`msg-${props.msg.id}`}
      data-testid={`msg-${props.msg.id}`}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('button')) return;
        props.onSelect?.(props.msg);
      }}
    >
      <TranscriptMessageHeader
        msg={props.msg}
        isAssistant={isAssistant()}
        onCopy={props.onCopy}
        onRegenerate={props.onRegenerate}
        onRegenerateWithNotes={props.onRegenerateWithNotes}
        onRegenerateWithModel={props.onRegenerateWithModel}
        models={props.models}
        onEdit={props.onEdit}
        onQuote={props.onQuote}
        onDelete={props.onDelete}
        onSpeak={props.onSpeak}
        onCopyPermalink={props.onCopyPermalink}
      />
      <div class="trx-msg__body">
        <Show
          when={turnModel()}
          fallback={
            <For each={props.msg.parts.filter((part) => shouldRenderPart(part, props.density))}>
              {(part, i) => (
                <PartView
                  part={part}
                  density={props.density}
                  onOpenDiff={props.onOpenDiff}
                  onPinFile={props.onPinFile}
                  searchQuery={props.searchQuery}
                  messageId={props.msg.id}
                  currentMatchKey={props.currentMatchKey}
                  matchBaseIndex={props.matchBaseIndex}
                  showCursor={i() === props.streamingPartIdx}
                  imagePartsSupported={props.imagePartsSupported}
                />
              )}
            </For>
          }
        >
          {(model) => (
            <AssistantTurnView
              model={model()}
              density={props.density}
              onOpenDiff={props.onOpenDiff}
              onPinFile={props.onPinFile}
              imagePartsSupported={props.imagePartsSupported}
              messageId={props.msg.id}
            />
          )}
        </Show>
        <For each={metadataDiffs()}>
          {(diff) => (
            <PartView
              part={diff}
              density={props.density}
              onOpenDiff={props.onOpenDiff}
              onPinFile={props.onPinFile}
              searchQuery={props.searchQuery}
              messageId={props.msg.id}
              currentMatchKey={props.currentMatchKey}
              matchBaseIndex={props.matchBaseIndex}
              imagePartsSupported={props.imagePartsSupported}
            />
          )}
        </For>
        <Show when={turnBlocker()}>{(summary) => <TurnWorkflowBlocker summary={summary()} />}</Show>
        <MessageStatusPanels
          msg={props.msg}
          isAssistant={isAssistant()}
          onRegenerate={props.onRegenerate}
        />
      </div>
    </article>
  );
}
