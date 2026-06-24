/**
 * Per-message hover action row (copy, regenerate, edit, branch) shown beside an
 * assistant or user message in the transcript.
 */
import { Show } from 'solid-js';
import type { Message } from '@clio/core';
import type { ModelOption } from './ComposerTypes.js';
import { Icon } from './Icon.js';
import { RegenMenu } from './TranscriptRegenMenu.js';

export function TranscriptMessageActions(props: {
  msg: Message;
  isAssistant: boolean;
  isUser: boolean;
  onCopy?: (msg: Message) => void;
  onRegenerate?: (msg: Message) => void;
  onRegenerateWithNotes?: (msg: Message, notes: string) => void;
  onRegenerateWithModel?: (msg: Message, model: ModelOption) => void;
  models?: ModelOption[];
  onEdit?: (msg: Message) => void;
  onQuote?: (msg: Message) => void;
  onDelete?: (msg: Message) => void;
  onSpeak?: (msg: Message) => void | Promise<void>;
  onCopyPermalink?: (msg: Message) => void | Promise<void>;
}) {
  return (
    <span class="trx-msg__actions">
      <Show when={props.onCopy}>
        <button
          type="button"
          class="trx-msg__action"
          title="Copy message"
          data-testid={`msg-copy-${props.msg.id}`}
          onClick={() => props.onCopy?.(props.msg)}
        >
          <Icon name="copy" size={12} />
        </button>
      </Show>
      <Show when={props.isAssistant && props.onRegenerate}>
        <RegenMenu
          msg={props.msg}
          models={props.models}
          onRegenerate={props.onRegenerate}
          onRegenerateWithNotes={props.onRegenerateWithNotes}
          onRegenerateWithModel={props.onRegenerateWithModel}
        />
      </Show>
      <Show when={props.isAssistant && props.onSpeak}>
        <button
          type="button"
          class="trx-msg__action"
          title="Speak this message"
          data-testid={`msg-speak-${props.msg.id}`}
          onClick={() => void props.onSpeak?.(props.msg)}
        >
          <Icon name="bell" size={12} />
        </button>
      </Show>
      <Show when={props.onCopyPermalink}>
        <button
          type="button"
          class="trx-msg__action"
          title="Copy link to this message"
          data-testid={`msg-link-${props.msg.id}`}
          onClick={() => void props.onCopyPermalink?.(props.msg)}
        >
          <Icon name="arrow-up-right" size={12} />
        </button>
      </Show>
      <Show when={props.isUser && props.onEdit}>
        <button
          type="button"
          class="trx-msg__action"
          title="Edit message"
          data-testid={`msg-edit-${props.msg.id}`}
          onClick={() => props.onEdit?.(props.msg)}
        >
          <Icon name="edit" size={12} />
        </button>
      </Show>
      <Show when={props.onQuote}>
        <button
          type="button"
          class="trx-msg__action"
          title="Quote in composer"
          data-testid={`msg-quote-${props.msg.id}`}
          onClick={() => props.onQuote?.(props.msg)}
        >
          <Icon name="branch" size={12} />
        </button>
      </Show>
      <Show when={props.onDelete}>
        <button
          type="button"
          class="trx-msg__action trx-msg__action--danger"
          title="Delete message"
          data-testid={`msg-delete-${props.msg.id}`}
          onClick={() => {
            if (
              window.confirm(
                'Delete this message? The rest of the conversation will be re-numbered around it.',
              )
            ) {
              props.onDelete?.(props.msg);
            }
          }}
        >
          <Icon name="close" size={12} />
        </button>
      </Show>
    </span>
  );
}
