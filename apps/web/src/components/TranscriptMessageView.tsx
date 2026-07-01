/**
 * Renders a single transcript message: header, ordered part views, status, and
 * the hover action row.
 */
import { For, Show, createComputed, createMemo } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import type { FileDiff, Message } from '@clio/core';
import type { ModelOption } from './ComposerTypes.js';
import { metadataToolDiffs } from './TranscriptToolParts.js';
import { PartView, shouldRenderPart, type TranscriptDensity } from './TranscriptParts.js';
import { TranscriptMessageHeader } from './TranscriptMessageHeader.js';
import { MessageStatusPanels } from './TranscriptMessageStatus.js';
import { TurnWorkflowBlocker, turnWorkflowBlocker } from './WorkflowState.js';
import { AssistantTurnView } from './AssistantTurnView.js';
import { buildAssistantTurnModel, type TurnRow } from './transcriptDelegationModel.js';
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
  /** Resolve a workspace file path to an inline image data URL (tool artifacts). */
  readWorkspaceImage?: (path: string) => Promise<{ url: string; mediaType: string } | null>;
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
  //
  // The model is a flat ORDERED ROW LOG. On every SSE delta we rebuild it and
  // reconcile(key:'id') it INTO a store, so unchanged rows keep their object
  // identity and the streaming text row updates in place — Solid's <For> then
  // appends/updates exactly the changed row instead of destroying and rebuilding
  // every row each token (append-only + incremental paint — RENDERING_SPEC).
  const [rows, setRows] = createStore<TurnRow[]>([]);
  createComputed(() => {
    // streamingPartIdx >= 0 means this assistant message is still in-flight; tell
    // the builder so the visibility filter doesn't drop main/synthesis rows on
    // partial text (they'd only pop in when complete). Finalized messages pass
    // streaming:false → full filter → identical to a reload.
    const streaming = (props.streamingPartIdx ?? -1) >= 0;
    // Search must NOT swap to the flat per-part render (it exposed the raw routing
    // decision + raw tool-result <pre>, i.e. the "old render on search"). Keep the
    // canonical AssistantTurnView for assistant turns even while searching; the
    // server-search panel's jump still works, we just drop in-transcript highlight.
    const model = !isAssistant()
      ? null
      : buildAssistantTurnModel(props.msg.parts ?? [], { streaming });
    setRows(reconcile(model?.rows ?? [], { key: 'id' }));
  });
  const hasTurn = createMemo(() => rows.length > 0);

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
          when={hasTurn()}
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
                  readWorkspaceImage={props.readWorkspaceImage}
                />
              )}
            </For>
          }
        >
          <AssistantTurnView
            rows={rows}
            density={props.density}
            streaming={(props.streamingPartIdx ?? -1) >= 0}
            onOpenDiff={props.onOpenDiff}
            onPinFile={props.onPinFile}
            imagePartsSupported={props.imagePartsSupported}
            readWorkspaceImage={props.readWorkspaceImage}
            messageId={props.msg.id}
          />
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
