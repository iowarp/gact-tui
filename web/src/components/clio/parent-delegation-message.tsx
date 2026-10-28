import type { Message as DomainMessage } from '@clio/core/v3';
import { BotIcon, CopyIcon } from 'lucide-react';
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message';
import { useTranscriptPreviewLines } from '@/providers/appearance-provider';
import { copyText } from '@/lib/clipboard';
import { BoundedResult } from './bounded-result';
import { delegationPrompt, isParentDelegation } from './parent-delegation';

/** Show what the parent asked as a readable message, with exact evidence on demand. */
export function ParentDelegationMessage({ message }: { message: DomainMessage }) {
  const lines = useTranscriptPreviewLines();
  return message.blocks.filter(isParentDelegation).map((block) => {
    const prompt = delegationPrompt(block.text);
    return (
      <Message from="user" key={block.id} data-slot="parent-delegation">
        <div
          className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground"
          data-slot="conversation-message-sender"
        >
          <BotIcon aria-hidden="true" className="size-4" />
          <span>Parent</span>
          <time dateTime={message.created_at}>
            {new Date(message.created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </time>
        </div>
        <MessageContent className="rounded-xl bg-muted/60 px-4 py-3">
          <BoundedResult lines={lines} title="Parent assignment">
            <MessageResponse>{prompt}</MessageResponse>
          </BoundedResult>
        </MessageContent>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <details className="min-w-0 flex-1">
            <summary className="cursor-pointer py-2">Technical details</summary>
            <BoundedResult lines={lines} title="Original delegation">
              <pre className="whitespace-pre-wrap [overflow-wrap:anywhere]">{block.text}</pre>
            </BoundedResult>
          </details>
          <MessageActions>
            <MessageAction
              label="Copy parent assignment"
              tooltip="Copy assignment"
              onClick={() => void copyText(prompt)}
            >
              <CopyIcon aria-hidden="true" className="size-4" />
            </MessageAction>
          </MessageActions>
        </div>
      </Message>
    );
  });
}
