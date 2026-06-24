/**
 * Renders a transcript message's header row (role icon/label, timestamp,
 * actions). Exports {@link TranscriptMessageHeader}.
 */
import { Show } from 'solid-js';
import type { Message } from '@clio/core';
import type { ModelOption } from './ComposerTypes.js';
import { Icon } from './Icon.js';
import { TranscriptMessageActions } from './TranscriptMessageActions.js';
import {
  absoluteMessageTime,
  relativeMessageTime,
  transcriptRoleIcon,
  transcriptRoleLabel,
} from './TranscriptMessageHeaderModel.js';

export function TranscriptMessageHeader(props: {
  msg: Message;
  isAssistant: boolean;
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
  const role = () => props.msg.role;
  return (
    <header class="trx-msg__head">
      <span class="trx-msg__avatar">
        <Icon name={transcriptRoleIcon(role())} size={14} />
      </span>
      <span class="trx-msg__role">{transcriptRoleLabel(role())}</span>
      <Show when={props.isAssistant && props.msg.model?.model_id}>
        <span class="trx-msg__model">{props.msg.model?.model_id}</span>
      </Show>
      <Show when={props.msg.metadata?.['retry_attempt_id']}>
        <span
          class="trx-msg__retry-chip"
          title="Created by a retry — see the Inspector's Attempts tab for the lineage"
          data-testid={`msg-retry-chip-${props.msg.id}`}
        >
          ↻ retry
        </span>
      </Show>
      <Show when={props.msg.created_at}>
        <span class="trx-msg__when" title={absoluteMessageTime(props.msg.created_at!)}>
          {relativeMessageTime(props.msg.created_at!)}
        </span>
      </Show>
      <TranscriptMessageActions
        msg={props.msg}
        isAssistant={props.isAssistant}
        isUser={role() === 'user'}
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
    </header>
  );
}
