/**
 * UI component: Composer Textarea. Renders `ComposerTextarea` from `ComposerTextareaProps`.
 */
import { createEffect, createMemo, createSignal, type Accessor, type Setter } from 'solid-js';
import { brand } from '@brand';
import type { Client } from '@clio/core';
import { AtMentionPicker, DEFAULT_ITEMS, type MentionItem } from './AtMentionPicker.js';
import {
  handleComposerTextareaKeyDown,
  handleComposerTextareaPaste,
  resizeComposerTextarea,
} from './ComposerTextareaController.js';
import { mentionQueryForText, textWithPickedMention } from './ComposerTextareaModel.js';
import type { ComposerHistory } from './ComposerState.js';

export interface ComposerTextareaProps {
  text: Accessor<string>;
  setText: Setter<string>;
  history: ComposerHistory;
  submit: () => void | Promise<void>;
  pasteStash: Accessor<Record<string, string>>;
  setPasteStash: Setter<Record<string, string>>;
  pasteCompressThreshold?: number;
  placeholder?: string;
  mentionItems?: MentionItem[];
  workspaceClient?: Client;
  workspaceId?: string;
  onSlashTyped?: () => void;
}

export function ComposerTextarea(props: ComposerTextareaProps) {
  const [mentionHighlight, setMentionHighlight] = createSignal(0);
  let inputTextareaRef: HTMLTextAreaElement | undefined;

  const mentionQuery = createMemo(() => mentionQueryForText(props.text()));
  const mentionOpen = () => mentionQuery() !== null;

  function pickMention(item: MentionItem) {
    props.setText(textWithPickedMention(props.text(), item.label));
    setMentionHighlight(0);
  }

  // Auto-grow the composer to fit its content even when `text()` is set
  // programmatically (fixtures, history walk, paste-expand).
  createEffect(() => {
    const value = props.text();
    const ta = inputTextareaRef;
    if (!ta) return;
    queueMicrotask(() => {
      resizeComposerTextarea(ta);
      void value;
    });
  });

  return (
    <div class="composer__input-wrap">
      <textarea
        ref={(el) => {
          inputTextareaRef = el;
        }}
        class="composer__input"
        placeholder={props.placeholder ?? `Ask ${brand.name} anything — @ references, / commands`}
        rows={1}
        value={props.text()}
        onPaste={(e) => {
          handleComposerTextareaPaste(e, {
            threshold: props.pasteCompressThreshold ?? 3,
            setText: props.setText,
            setPasteStash: props.setPasteStash,
          });
        }}
        onInput={(e) => {
          props.setText(e.currentTarget.value);
          resizeComposerTextarea(e.currentTarget);
        }}
        onKeyDown={(e) => {
          handleComposerTextareaKeyDown(e, {
            mentionOpen: mentionOpen(),
            setMentionHighlight,
            text: props.text(),
            onSlashTyped: props.onSlashTyped,
            history: props.history,
            pasteStash: props.pasteStash(),
            setText: props.setText,
            setPasteStash: props.setPasteStash,
            submit: props.submit,
          });
        }}
        data-testid="composer-input"
      />
      <AtMentionPicker
        open={mentionOpen()}
        query={mentionQuery() ?? ''}
        items={props.mentionItems ?? DEFAULT_ITEMS}
        highlight={mentionHighlight()}
        client={props.workspaceClient}
        workspaceId={props.workspaceId}
        onPick={pickMention}
        onClose={() => setMentionHighlight(0)}
      />
    </div>
  );
}
